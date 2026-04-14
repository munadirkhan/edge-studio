import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { YT_DLP } from "../lib/binaries.js";

const execFileAsync = promisify(execFile);

export async function downloadVideo(url, outputDir, jobId) {
  const outputTemplate = path.join(outputDir, `${jobId}.%(ext)s`);

  // Download best quality mp4, max 720p to keep files manageable
  const args = [
    url,
    "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
    "--merge-output-format", "mp4",
    "-o", outputTemplate,
    "--no-playlist",
    "--quiet",
    "--no-warnings",
  ];

  console.log(`[downloader] Downloading ${url}`);
  await execFileAsync(YT_DLP, args, { timeout: 5 * 60 * 1000 });

  // Find the output file
  const files = fs.readdirSync(outputDir).filter(f => f.startsWith(jobId) && f.endsWith(".mp4"));
  if (!files.length) throw new Error("Download produced no mp4 file");

  const filePath = path.join(outputDir, files[0]);
  console.log(`[downloader] Downloaded to ${filePath}`);
  return filePath;
}

export async function getVideoInfo(url) {
  const args = [url, "--dump-json", "--no-playlist", "--quiet"];
  const { stdout } = await execFileAsync(YT_DLP, args, { timeout: 30000 });
  return JSON.parse(stdout);
}
