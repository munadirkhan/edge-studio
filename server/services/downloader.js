import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { YT_DLP } from "../lib/binaries.js";

const execFileAsync = promisify(execFile);

// Write YouTube cookies from env var to a temp file
function getCookieArgs() {
  const cookies = process.env.YOUTUBE_COOKIES;
  if (!cookies) return [];
  const cookiePath = path.join(os.tmpdir(), "yt-cookies.txt");
  fs.writeFileSync(cookiePath, cookies, "utf8");
  return ["--cookies", cookiePath];
}

// Try downloading with a given player client, throw on failure
async function tryDownload(url, args, client) {
  const clientArgs = [
    "--extractor-args", `youtube:player_client=${client}`,
    ...args,
  ];
  console.log(`[downloader] Trying client: ${client}`);
  await execFileAsync(YT_DLP, clientArgs, { timeout: 5 * 60 * 1000 });
}

export async function downloadVideo(url, outputDir, jobId) {
  const outputTemplate = path.join(outputDir, `${jobId}.%(ext)s`);

  const baseArgs = [
    url,
    "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]",
    "--merge-output-format", "mp4",
    "-o", outputTemplate,
    "--no-playlist",
    "--quiet",
    "--no-warnings",
    ...getCookieArgs(),
  ];

  // Try clients in order — tv_embedded often bypasses bot checks without cookies
  const clients = ["tv_embedded", "tv", "ios", "mweb", "web", "android"];
  let lastErr;

  for (const client of clients) {
    try {
      await tryDownload(url, baseArgs, client);

      const files = fs.readdirSync(outputDir).filter(f => f.startsWith(jobId) && f.endsWith(".mp4"));
      if (files.length) {
        const filePath = path.join(outputDir, files[0]);
        console.log(`[downloader] Downloaded with client=${client}: ${filePath}`);
        return filePath;
      }
    } catch (err) {
      console.warn(`[downloader] client=${client} failed: ${err.message?.slice(0, 200)}`);
      lastErr = err;
    }
  }

  throw new Error(
    "YouTube blocked all download attempts. Add your YOUTUBE_COOKIES to Railway env vars to fix this. " +
    "Export cookies with the 'Get cookies.txt LOCALLY' Chrome extension and paste into Railway → Variables → YOUTUBE_COOKIES.\n" +
    `Last error: ${lastErr?.message?.slice(0, 300)}`
  );
}

export async function getVideoInfo(url) {
  const clients = ["ios", "mweb", "web"];
  for (const client of clients) {
    try {
      const args = [
        url,
        "--extractor-args", `youtube:player_client=${client}`,
        "--dump-json", "--no-playlist", "--quiet",
        ...getCookieArgs(),
      ];
      const { stdout } = await execFileAsync(YT_DLP, args, { timeout: 30000 });
      return JSON.parse(stdout);
    } catch {
      // try next client
    }
  }
  return {}; // non-fatal, pipeline continues without metadata
}
