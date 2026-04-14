import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { FFMPEG } from "../lib/binaries.js";

// Clip + reframe to 9:16 vertical + burn captions
export async function createClip({ videoPath, start, end, outputDir, jobId, rank, captionText }) {
  const outputPath = path.join(outputDir, `${jobId}_clip${rank}.mp4`);
  const duration = end - start;

  // Two-pass: first clip + vertical crop, then burn captions if provided
  await new Promise((resolve, reject) => {
    // vf: crop to 9:16 centered, scale to 1080x1920
    // Scale to fill 1080x1920 (cover), then crop — works for any aspect ratio
    const vfCrop = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";

    const args = [
      "-ss", String(start),
      "-i", videoPath,
      "-t", String(duration),
      "-vf", vfCrop,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ];

    execFile(FFMPEG, args, { timeout: 5 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err) {
        console.error("[clipper] ffmpeg error:", stderr);
        reject(new Error("FFmpeg clip failed: " + stderr.slice(-300)));
      } else {
        resolve();
      }
    });
  });

  console.log(`[clipper] Created clip ${rank}: ${outputPath}`);
  return outputPath;
}

// Font presets available on Windows
export const CAPTION_FONTS = {
  impact:    { name: "Impact",       label: "Impact",      bold: 0 },
  bebas:     { name: "Arial Black",  label: "Arial Black", bold: 1 },
  clean:     { name: "Segoe UI",     label: "Segoe UI",    bold: 1 },
  cinematic: { name: "Trebuchet MS", label: "Trebuchet",   bold: 1 },
};

// Add burned-in captions using subtitles filter + EdgeStudio watermark
export async function addCaptions({ videoPath, srtPath, outputPath, fontKey = "impact" }) {
  return new Promise((resolve, reject) => {
    const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const font = CAPTION_FONTS[fontKey] || CAPTION_FONTS.impact;

    // Captions: smaller size, bottom-center with margin, chosen font
    const subFilter = `subtitles='${escapedSrt}':force_style='FontName=${font.name},FontSize=13,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1,Bold=${font.bold},Alignment=2,MarginV=80'`;

    // Watermark: top-right corner, semi-transparent
    const watermark = `drawtext=text='EDGE STUDIO':fontsize=26:fontcolor=white@0.25:x=w-tw-28:y=28`;

    execFile(FFMPEG, [
      "-i", videoPath,
      "-vf", `${subFilter},${watermark}`,
      "-c:a", "copy",
      "-y",
      outputPath,
    ], { timeout: 3 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err) {
        // Fallback: try without watermark (drawtext might not be available)
        execFile(FFMPEG, [
          "-i", videoPath,
          "-vf", subFilter,
          "-c:a", "copy",
          "-y",
          outputPath,
        ], { timeout: 3 * 60 * 1000 }, (err2, _s, stderr2) => {
          if (err2) reject(new Error("Caption burn failed: " + stderr2.slice(-300)));
          else resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

// Grab a thumbnail frame from the middle of a clip
export function generateThumbnail({ videoPath, start, end, outputPath }) {
  const seekTo = start + Math.round((end - start) * 0.3);
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, [
      "-ss", String(seekTo),
      "-i", videoPath,
      "-vframes", "1",
      "-vf", "scale=640:-1",
      "-y",
      outputPath,
    ], { timeout: 15000 }, (err) => (err ? reject(err) : resolve()));
  });
}

// Generate SRT file from transcript segments within a time window
export function buildSRT(segments, clipStart, clipEnd) {
  const clipped = segments.filter((s) => s.end > clipStart && s.start < clipEnd);

  return clipped
    .map((seg, i) => {
      const start = Math.max(0, seg.start - clipStart);
      const end = Math.min(clipEnd - clipStart, seg.end - clipStart);
      return `${i + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${seg.text.trim()}\n`;
    })
    .join("\n");
}

function srtTime(s) {
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  const ms = Math.round((s % 1) * 1000).toString().padStart(3, "0");
  return `${h}:${m}:${sec},${ms}`;
}
