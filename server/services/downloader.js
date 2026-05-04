import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { YT_DLP } from "../lib/binaries.js";

const execFileAsync = promisify(execFile);

let _cookiePath = null;
function getCookieArgs() {
  const raw = process.env.YOUTUBE_COOKIES;
  if (!raw) return [];
  if (!_cookiePath) {
    _cookiePath = path.join(os.tmpdir(), "yt-cookies.txt");
    // Normalize line endings — Railway can convert \r\n, and tabs must stay as tabs
    const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd() + "\n";
    fs.writeFileSync(_cookiePath, normalized, "utf8");
    const lines = normalized.split("\n").filter(Boolean);
    console.log(`[cookies] Loaded ${lines.length} lines. First: "${lines[0]?.slice(0, 60)}"`);
    // Warn if tabs are missing (means Railway mangled the format)
    const dataLines = lines.filter(l => !l.startsWith("#"));
    const hasTabs = dataLines.some(l => l.includes("\t"));
    if (!hasTabs && dataLines.length > 0) {
      console.warn("[cookies] WARNING: No tab characters found — cookie file may be space-separated (broken). Re-export and paste carefully.");
    }
  }
  return ["--cookies", _cookiePath];
}

export function getCookieDebugInfo() {
  const raw = process.env.YOUTUBE_COOKIES;
  const proxy = process.env.YTDLP_PROXY;
  const cookieInfo = raw ? (() => {
    const lines = raw.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
    const dataLines = lines.filter(l => !l.startsWith("#"));
    return {
      hasCookies: true,
      totalLines: lines.length,
      dataLines: dataLines.length,
      hasTabs: dataLines.some(l => l.includes("\t")),
      hasNetscapeHeader: lines[0]?.includes("Netscape") ?? false,
      firstDataLine: dataLines[0]?.slice(0, 80) ?? "(none)",
      charCount: raw.length,
    };
  })() : { hasCookies: false };
  return {
    ...cookieInfo,
    proxy: proxy ? proxy.trim().replace(/:([^:@]+)@/, ":***@") : null,
    hasProxy: !!proxy,
  };
}

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Each attempt is { client, extraArgs }
const DOWNLOAD_ATTEMPTS = [
  // Impersonate real Chrome TLS fingerprint — bypasses IP-based bot detection
  { client: "web_creator", extraArgs: ["--impersonate", "chrome"] },
  { client: "web",         extraArgs: ["--impersonate", "chrome"] },
  { client: "tv_embedded", extraArgs: ["--impersonate", "chrome"] },
  // Fallback without impersonation
  { client: "web_creator" },
  { client: "tv_embedded" },
  { client: "ios" },
  { client: "tv" },
  { client: "mweb" },
  { client: "android" },
  { client: "web" },
];

// Try Cobalt API — multiple instances in case one is down or rate-limited
const COBALT_INSTANCES = [
  process.env.COBALT_API_URL,
  "https://api.cobalt.tools",
  "https://cobalt.api.timelessnesses.me",
].filter(Boolean);

async function tryDownloadViaCobalt(url, outputDir, jobId) {
  let lastErr;
  for (const instance of COBALT_INSTANCES) {
    try {
      console.log(`[cobalt] Trying ${instance}`);
      const headers = { "Content-Type": "application/json", "Accept": "application/json" };
      if (process.env.COBALT_API_KEY) headers["Authorization"] = `Api-Key ${process.env.COBALT_API_KEY}`;

      const response = await fetch(instance, {
        method: "POST",
        headers,
        body: JSON.stringify({ url, videoQuality: "720", filenameStyle: "basic" }),
        signal: AbortSignal.timeout(20000),
      });
      const text = await response.text();
      console.log(`[cobalt] ${instance} → HTTP ${response.status}: ${text.slice(0, 120)}`);
      if (!response.ok) { lastErr = new Error(`HTTP ${response.status}: ${text.slice(0, 80)}`); continue; }

      const data = JSON.parse(text);
      if (!data.url) { lastErr = new Error(`No url in response (status=${data.status})`); continue; }

      const fileResponse = await fetch(data.url, { signal: AbortSignal.timeout(5 * 60 * 1000) });
      if (!fileResponse.ok) { lastErr = new Error(`Download HTTP ${fileResponse.status}`); continue; }

      const outputPath = path.join(outputDir, `${jobId}.mp4`);
      fs.writeFileSync(outputPath, Buffer.from(await fileResponse.arrayBuffer()));
      console.log(`[cobalt] ✓ Downloaded via ${instance}`);
      return outputPath;
    } catch (err) {
      console.warn(`[cobalt] ${instance} failed: ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr || new Error("All Cobalt instances failed");
}

export async function downloadVideo(url, outputDir, jobId) {
  // Try Cobalt first (no cookies/proxy needed)
  if (process.env.COBALT_ENABLED !== "false") {
    try {
      return await tryDownloadViaCobalt(url, outputDir, jobId);
    } catch (err) {
      console.warn(`[downloader] Cobalt failed (${err.message}), falling back to yt-dlp`);
    }
  }

  const outputTemplate = path.join(outputDir, `${jobId}.%(ext)s`);
  const cookieArgs = getCookieArgs();

  const proxyArgs = process.env.YTDLP_PROXY
    ? ["--proxy", process.env.YTDLP_PROXY.trim()]
    : [];

  if (proxyArgs.length) {
    console.log(`[downloader] Using proxy: ${process.env.YTDLP_PROXY.trim().replace(/:([^:@]+)@/, ":***@")}`);
  }

  const baseArgs = [
    url,
    "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]",
    "--merge-output-format", "mp4",
    "-o", outputTemplate,
    "--no-playlist",
    "--quiet",
    "--no-warnings",
    "--add-header", `User-Agent:${BROWSER_UA}`,
    "--add-header", "Accept-Language:en-US,en;q=0.9",
    "--socket-timeout", "30",
    ...cookieArgs,
    ...proxyArgs,
  ];

  let lastErr;

  for (const { client, extraArgs = [] } of DOWNLOAD_ATTEMPTS) {
    try {
      const args = [
        "--extractor-args", `youtube:player_client=${client}`,
        ...extraArgs,
        ...baseArgs,
      ];
      console.log(`[downloader] Trying client: ${client}`);
      await execFileAsync(YT_DLP, args, { timeout: 5 * 60 * 1000 });

      const files = fs.readdirSync(outputDir).filter(f => f.startsWith(jobId) && f.endsWith(".mp4"));
      if (files.length) {
        console.log(`[downloader] ✓ Downloaded with client=${client}`);
        return path.join(outputDir, files[0]);
      }
    } catch (err) {
      console.warn(`[downloader] client=${client} failed: ${err.message?.slice(0, 120)}`);
      lastErr = err;
    }
  }

  const hasCookies = cookieArgs.length > 0;
  throw new Error(
    hasCookies
      ? `YouTube blocked all clients even with cookies. The cookie file may be expired — re-export and update YOUTUBE_COOKIES in Railway.`
      : `NEEDS_COOKIES`
  );
}

export async function getVideoInfo(url) {
  const proxyArgs = process.env.YTDLP_PROXY ? ["--proxy", process.env.YTDLP_PROXY.trim()] : [];
  const clients = ["web_creator", "ios", "mweb", "web"];
  for (const client of clients) {
    try {
      const args = [
        url,
        "--extractor-args", `youtube:player_client=${client}`,
        "--dump-json", "--no-playlist", "--quiet",
        "--add-header", `User-Agent:${BROWSER_UA}`,
        ...getCookieArgs(),
        ...proxyArgs,
      ];
      const { stdout } = await execFileAsync(YT_DLP, args, { timeout: 30000 });
      return JSON.parse(stdout);
    } catch {
      // try next client
    }
  }
  return {}; // non-fatal
}

