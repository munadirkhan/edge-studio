import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { FFMPEG } from "../lib/binaries.js";

const execFileAsync = promisify(execFile);
let _openai;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// Extract audio from video using ffmpeg
export async function extractAudio(videoPath, outputDir, jobId) {
  const audioPath = path.join(outputDir, `${jobId}_audio.mp3`);

  await new Promise((resolve, reject) => {
    execFile(FFMPEG, [
      "-i", videoPath,
      "-vn",
      "-ar", "16000",
      "-ac", "1",
      "-b:a", "64k",
      "-y",
      audioPath,
    ], (err) => (err ? reject(err) : resolve()));
  });

  console.log(`[transcriber] Audio extracted to ${audioPath}`);
  return audioPath;
}

// Transcribe with Whisper — returns segments with timestamps
export async function transcribeAudio(audioPath) {
  console.log(`[transcriber] Transcribing ${audioPath}`);

  const fileStats = fs.statSync(audioPath);
  const fileSizeMB = fileStats.size / (1024 * 1024);
  console.log(`[transcriber] Audio file size: ${fileSizeMB.toFixed(1)}MB`);

  const transcription = await getOpenAI().audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  console.log(`[transcriber] Got ${transcription.segments?.length || 0} segments`);
  return transcription;
}
