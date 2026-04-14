import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { YT_DLP } from "../lib/binaries.js";

const execFileAsync = promisify(execFile);

// Write YouTube cookies from env var to a temp file (optional but helps bypass bot detection)
function getCookieArgs() {
  const cookies = process.env.YOUTUBE_COOKIES;
  if (!cookies) return [];
  const cookiePath = path.join(os.tmpdir(), "yt-cookies.txt");
  fs.writeFileSync(cookiePath, cookies, "utf8");
  return ["--cookies", cookiePath];
}

// Base yt-dlp args that bypass YouTube bot detection
function baseArgs() {
  return [
    // Use Android client — bypasses bot check without needing cookies
    "--extractor-args", "youtube:player_client=android,web",
    "--user-agent", "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36",
    ...getCookieArgs(),
  ];
}

export async function downloadVideo(url, outputDir, jobId) {
  const outputTemplate = path.join(outputDir, `${jobId}.%(ext)s`);

  const args = [
    url,
    ...baseArgs(),
    "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]",
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
  const args = [url, ...baseArgs(), "--dump-json", "--no-playlist", "--quiet"];
  const { stdout } = await execFileAsync(YT_DLP, args, { timeout: 30000 });
  return JSON.parse(stdout);
}
