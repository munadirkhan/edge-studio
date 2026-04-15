import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });
import express from "express";
import cors from "cors";
import fs from "fs";
import { v4 as uuid } from "uuid";

import multer from "multer";
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

// ── POST /video/upload ────────────────────────────────────────────────────────
// Upload a local video file instead of downloading from YouTube
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const jobId = req.jobId;
      const dir = path.join(UPLOADS_DIR, jobId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, _file, cb) => cb(null, `${req.jobId}.mp4`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (_req, f, cb) => {
    if (f.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only video files allowed"));
  },
});

app.post("/video/upload", (req, _res, next) => {
  const jobId = uuid();
  req.jobId = jobId;
  next();
}, upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No video file received" });

  const { clipCount = 3, clipDuration = 60, fontKey = "impact" } = req.body;
  const videoPath = req.file.path;
  const jobId = req.jobId;

  const job = {
    id: jobId,
    status: "queued",
    stage: "Starting...",
    url: req.file.originalname,
    clips: [],
    error: null,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);
  res.json({ jobId });

  // Run pipeline starting from transcription (skip download)
  runPipelineFromFile(job, { videoPath, clipCount: Number(clipCount), clipDuration: Number(clipDuration), fontKey }).catch((err) => {
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

// ── POST /api/generate-image ─────────────────────────────────────────────────
app.post("/api/generate-image", async (req, res) => {
  const { templateId } = req.body;
  const TEMPLATE_PROMPTS = {
    forest:    "Serene ancient forest at blue hour, towering trees with soft god rays filtering through mist, anime illustration style, Studio Ghibli inspired, deep greens and ethereal light, vertical 9:16, ultra detailed, cinematic",
    ocean:     "Calm ocean at sunset, glowing horizon reflecting on still water, illustrated style, dreamy atmospheric haze, soft blues and golds, vertical 9:16, ultra detailed, cinematic peaceful",
    moonlight: "Full moon rising over quiet mountain village, glowing night sky with stars, anime illustration style, blue and silver tones, warm lights in windows below, vertical 9:16, ultra detailed, serene cinematic",
    sakura:    "Cherry blossom path at dusk, petals drifting gently, soft pink and purple sky, illustrated anime style, tranquil Japanese garden, vertical 9:16, ultra detailed, calming cinematic",
    city:      "Peaceful rain-slicked city street at night, glowing streetlights reflected in puddles, illustrated style, warm amber and blue tones, quiet and atmospheric, vertical 9:16, ultra detailed, cinematic",
    gym:       "Lone figure silhouetted against dramatic dawn light on a mountain summit, illustrated cinematic style, inspirational atmosphere, deep contrast, vertical 9:16, ultra detailed, motivational",
  };
  const prompt = TEMPLATE_PROMPTS[templateId] || TEMPLATE_PROMPTS.city;
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1792",
      response_format: "b64_json",
    });
    const image = `data:image/png;base64,${response.data[0].b64_json}`;
    res.json({ image });
  } catch (err) {
    console.error("generate-image error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/generate-caption ───────────────────────────────────────────────
app.post("/api/generate-caption", async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a viral short-form content expert. Given a message/theme, return JSON with:
- hook: a 6-10 word punchy opening line for the video overlay (ALL CAPS style, bold statement)
- caption: a 2-3 sentence TikTok/Reels caption with emojis
- hashtags: 8-10 relevant hashtags as a single string`,
        },
        { role: "user", content: message },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.8,
    });
    const data = JSON.parse(completion.choices[0].message.content);
    res.json(data);
  } catch (err) {
    console.error("generate-caption error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/generate-narration ─────────────────────────────────────────────
app.post("/api/generate-narration", async (req, res) => {
  const { message, hook, clipDuration = 30 } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const words = Math.round(clipDuration * 2.5); // ~2.5 words/sec for narration pace
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Write a spoken narration script for a ${clipDuration}-second motivational short video. Around ${words} words. Direct, powerful, cinematic delivery. No stage directions. Just the words to be spoken.`,
        },
        { role: "user", content: `Theme: ${message}\nOpening hook: ${hook}` },
      ],
      max_tokens: 200,
      temperature: 0.75,
    });
    res.json({ script: completion.choices[0].message.content.trim() });
  } catch (err) {
    console.error("generate-narration error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/generate-voice ─────────────────────────────────────────────────
app.post("/api/generate-voice", async (req, res) => {
  const { text, voice = "onyx" } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });
  const VALID_VOICES = ["onyx", "fable", "echo", "nova", "shimmer", "alloy"];
  const safeVoice = VALID_VOICES.includes(voice) ? voice : "onyx";
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: safeVoice,
      input: text,
      response_format: "mp3",
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("generate-voice error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jarvis-suggest ─────────────────────────────────────────────────
// Takes a rough idea and returns a punchy video message
app.post("/api/jarvis-suggest", async (req, res) => {
  const { idea } = req.body;
  if (!idea?.trim()) return res.status(400).json({ error: "idea required" });

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are JARVIS, an AI that writes punchy, cinematic short-form video messages. Given a rough idea, write ONE short, powerful message (max 12 words) that would work as the text overlay on a motivational or viral short video. Bold, direct, no fluff. Return ONLY the message text, nothing else.",
        },
        { role: "user", content: idea },
      ],
      max_tokens: 60,
      temperature: 0.85,
    });

    const message = completion.choices[0]?.message?.content?.trim() || "";
    res.json({ message });
  } catch (err) {
    console.error("jarvis-suggest error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /video/jobs ───────────────────────────────────────────────────────────
app.get("/video/jobs", (_req, res) => {
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

    // Clean up uploads (source video + audio) — outputs stay for download
    fs.rm(jobUploads, { recursive: true, force: true }, () => {});

  } catch (err) {
    job.status = "failed";
    job.stage = "Failed";
    job.error = err.message;
    console.error(`[pipeline:${jobId}] Error:`, err);
    // Clean up both dirs on failure
    fs.rm(jobUploads, { recursive: true, force: true }, () => {});
    fs.rm(jobOutputs, { recursive: true, force: true }, () => {});
  }

  // Keep jobs map lean — drop entries older than 2 hours
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const [id, j] of jobs.entries()) {
    if (Date.now() - j.createdAt > TWO_HOURS) jobs.delete(id);
  }
}

// Same as runPipeline but skips the download step (file already on disk)
async function runPipelineFromFile(job, { videoPath, clipCount, clipDuration, fontKey = "impact" }) {
  const { id: jobId } = job;
  const jobOutputs = path.join(OUTPUTS_DIR, jobId);
  fs.mkdirSync(jobOutputs, { recursive: true });

  try {
    job.status = "running";

    job.stage = "Extracting audio...";
    const jobUploads = path.dirname(videoPath);
    const audioPath = await extractAudio(videoPath, jobUploads, jobId);

    job.stage = "Transcribing with Whisper...";
    const transcription = await transcribeAudio(audioPath);
    const videoDuration = transcription.segments?.slice(-1)[0]?.end ?? 600;

    job.stage = "Finding viral moments...";
    const moments = await findViralMoments(transcription, videoDuration, clipCount, clipDuration);

    job.stage = "Creating clips...";
    const clips = [];

    for (const moment of moments) {
      job.stage = `Creating clip ${moment.rank} of ${moments.length}...`;
      const rawClipPath = await createClip({ videoPath, start: moment.start, end: moment.end, outputDir: jobOutputs, jobId, rank: moment.rank });

      const srtContent = buildSRT(transcription.segments || [], moment.start, moment.end);
      const srtPath = path.join(jobOutputs, `${jobId}_clip${moment.rank}.srt`);
      fs.writeFileSync(srtPath, srtContent, "utf8");

      let finalClipPath = rawClipPath;
      if (srtContent.trim()) {
        const captionedPath = rawClipPath.replace(".mp4", "_captioned.mp4");
        try { await addCaptions({ videoPath: rawClipPath, srtPath, outputPath: captionedPath, fontKey }); finalClipPath = captionedPath; }
        catch (e) { console.warn(`[upload-pipeline] caption failed:`, e.message); }
      }

      const thumbPath = path.join(jobOutputs, `${jobId}_clip${moment.rank}_thumb.jpg`);
      try { await generateThumbnail({ videoPath, start: moment.start, end: moment.end, outputPath: thumbPath }); } catch {}

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
        downloadUrl: `/clips/${jobId}/${path.basename(finalClipPath)}`,
        thumbnailUrl: fs.existsSync(thumbPath) ? `/clips/${jobId}/${path.basename(thumbPath)}` : null,
      });
    }

    job.clips = clips;
    job.status = "done";
    job.stage = "Complete";
    fs.rm(jobUploads, { recursive: true, force: true }, () => {});
  } catch (err) {
    job.status = "failed";
    job.stage = "Failed";
    job.error = err.message;
    console.error(`[upload-pipeline:${jobId}] Error:`, err);
  }

  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const [id, j] of jobs.entries()) {
    if (Date.now() - j.createdAt > TWO_HOURS) jobs.delete(id);
  }
}

// Railway uses PORT env var; fall back to VIDEO_PORT for local dev
const PORT = process.env.PORT || process.env.VIDEO_PORT || 3001;
app.listen(PORT, "0.0.0.0", () => console.log(`[server] Video backend running on port ${PORT}`));
