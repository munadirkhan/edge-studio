import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });
import express from "express";
import cors from "cors";
import fs from "fs";
import { v4 as uuid } from "uuid";

import { downloadVideo, getVideoInfo } from "./services/downloader.js";
import { extractAudio, transcribeAudio } from "./services/transcriber.js";
import { findViralMoments } from "./services/moments.js";
import { createClip, buildSRT, addCaptions, generateThumbnail } from "./services/clipper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "uploads");
const OUTPUTS_DIR = path.join(__dirname, "outputs");

// Ensure dirs exist
[UPLOADS_DIR, OUTPUTS_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const app = express();
app.use(cors());
app.use(express.json());

// Serve output clips for download
app.use("/clips", express.static(OUTPUTS_DIR));

// Health check for Railway
app.get("/health", (_req, res) => res.json({ ok: true }));

// In-memory job store (MVP — replace with DB for prod)
const jobs = new Map();

// ── POST /video/process ───────────────────────────────────────────────────────
// Start a full pipeline: download → transcribe → find moments → clip → captions
app.post("/video/process", async (req, res) => {
  const { url, clipCount = 3, clipDuration = 60, fontKey = "impact" } = req.body;

  if (!url) return res.status(400).json({ error: "url required" });

  const jobId = uuid();
  const job = {
    id: jobId,
    status: "queued",
    stage: "Starting...",
    url,
    clips: [],
    error: null,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  // Return immediately with job ID — client polls /video/status/:id
  res.json({ jobId });

  // Run pipeline async
  runPipeline(job, { url, clipCount, clipDuration, fontKey }).catch((err) => {
    console.error(`[pipeline] Job ${jobId} failed:`, err.message);
    job.status = "failed";
    job.error = err.message;
  });
});

// ── GET /video/status/:id ─────────────────────────────────────────────────────
app.get("/video/status/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

// ── GET /video/jobs ───────────────────────────────────────────────────────────
app.get("/video/jobs", (req, res) => {
  const list = [...jobs.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);
  res.json(list);
});

// ─────────────────────────────────────────────────────────────────────────────

async function runPipeline(job, { url, clipCount, clipDuration, fontKey = "impact" }) {
  const { id: jobId } = job;
  const jobUploads = path.join(UPLOADS_DIR, jobId);
  const jobOutputs = path.join(OUTPUTS_DIR, jobId);
  fs.mkdirSync(jobUploads, { recursive: true });
  fs.mkdirSync(jobOutputs, { recursive: true });

  try {
    // 1. Get video metadata
    job.status = "running";
    job.stage = "Fetching video info...";
    console.log(`[pipeline:${jobId}] Fetching info for ${url}`);
    let videoInfo;
    try {
      videoInfo = await getVideoInfo(url);
      job.title = videoInfo.title;
      job.thumbnailUrl = videoInfo.thumbnail;
      job.videoDuration = videoInfo.duration;
    } catch (e) {
      console.warn("[pipeline] Could not get video info:", e.message);
    }

    // 2. Download
    job.stage = "Downloading video...";
    console.log(`[pipeline:${jobId}] Downloading...`);
    const videoPath = await downloadVideo(url, jobUploads, jobId);

    // 3. Extract audio
    job.stage = "Extracting audio...";
    const audioPath = await extractAudio(videoPath, jobUploads, jobId);

    // 4. Transcribe
    job.stage = "Transcribing with Whisper...";
    const transcription = await transcribeAudio(audioPath);
    const videoDuration = job.videoDuration || (transcription.segments?.slice(-1)[0]?.end ?? 600);

    // 5. Find viral moments
    job.stage = "Finding viral moments...";
    const moments = await findViralMoments(transcription, videoDuration, clipCount, clipDuration);
    console.log(`[pipeline:${jobId}] Found ${moments.length} moments`);

    // 6. Clip + captions for each moment
    job.stage = "Creating clips...";
    const clips = [];

    for (const moment of moments) {
      job.stage = `Creating clip ${moment.rank} of ${moments.length}...`;
      console.log(`[pipeline:${jobId}] Clipping moment ${moment.rank}: ${moment.start}s → ${moment.end}s`);

      // Create the clip (cropped 9:16)
      const rawClipPath = await createClip({
        videoPath,
        start: moment.start,
        end: moment.end,
        outputDir: jobOutputs,
        jobId,
        rank: moment.rank,
      });

      // Build SRT from transcript segments
      const srtContent = buildSRT(transcription.segments || [], moment.start, moment.end);
      const srtPath = path.join(jobOutputs, `${jobId}_clip${moment.rank}.srt`);
      fs.writeFileSync(srtPath, srtContent, "utf8");

      // Burn captions if we have subtitle content
      let finalClipPath = rawClipPath;
      if (srtContent.trim()) {
        const captionedPath = rawClipPath.replace(".mp4", "_captioned.mp4");
        try {
          await addCaptions({ videoPath: rawClipPath, srtPath, outputPath: captionedPath, fontKey });
          finalClipPath = captionedPath;
        } catch (captionErr) {
          console.warn(`[pipeline:${jobId}] Caption burn failed (using raw clip):`, captionErr.message);
        }
      }

      // Generate thumbnail from original video at clip midpoint
      const thumbPath = path.join(jobOutputs, `${jobId}_clip${moment.rank}_thumb.jpg`);
      try {
        await generateThumbnail({ videoPath, start: moment.start, end: moment.end, outputPath: thumbPath });
      } catch (thumbErr) {
        console.warn(`[pipeline:${jobId}] Thumbnail failed (non-fatal):`, thumbErr.message);
      }

      const filename = path.basename(finalClipPath);
      const thumbFilename = path.basename(thumbPath);
      clips.push({
        rank: moment.rank,
        viralScore: moment.viralScore,
        title: moment.title,
        hook: moment.hook,
        reason: moment.reason,
        caption: moment.caption,
        start: moment.start,
        end: moment.end,
        duration: moment.duration,
        downloadUrl: `/clips/${jobId}/${filename}`,
        thumbnailUrl: fs.existsSync(thumbPath) ? `/clips/${jobId}/${thumbFilename}` : null,
      });
    }

    job.clips = clips;
    job.status = "done";
    job.stage = "Complete";
    console.log(`[pipeline:${jobId}] Done. ${clips.length} clips ready.`);

  } catch (err) {
    job.status = "failed";
    job.stage = "Failed";
    job.error = err.message;
    console.error(`[pipeline:${jobId}] Error:`, err);
  }
}

// Railway uses PORT env var; fall back to VIDEO_PORT for local dev
const PORT = process.env.PORT || process.env.VIDEO_PORT || 3001;
app.listen(PORT, "0.0.0.0", () => console.log(`[server] Video backend running on port ${PORT}`));
