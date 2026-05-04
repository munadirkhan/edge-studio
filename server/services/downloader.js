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
    const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd() + "\n";
    fs.writeFileSync(_cookiePath, normalized, "utf8");
    const lines = normalized.split("\n").filter(Boolean);
    console.log(`[cookies] Loaded ${lines.length} lines. First: "${lines[0]?.slice(0, 60)}"`);
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
  { client: "web_creator", extraArgs: ["--impersonate", "chrome"] },
  { client: "web",         extraArgs: ["--impersonate", "chrome"] },
  { client: "tv_embedded", extraArgs: ["--impersonate", "chrome"] },
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

// Invidious instances — run on non-GCP infrastructure, proxy YouTube CDN URLs
// CDN URLs they return (googlevideo.com) are not IP-locked and work from Railway
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://yt.artemislena.eu",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://iv.datura.network",
  "https://invidious.privacydev.net",
  "https://invidious.flokinet.to",
];

function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

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

// Invidious API → get signed YouTube CDN URL → download directly.
// Invidious runs on non-GCP IPs so it successfully extracts URLs from YouTube.
// The returned googlevideo.com CDN URLs are not IP-locked — they work from Railway.
async function tryDownloadViaInvidious(url, outputDir, jobId) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Could not extract YouTube video ID");

  let lastErr;
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`[invidious] Trying ${instance} for ${videoId}`);
      const apiRes = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": BROWSER_UA },
      });
      if (!apiRes.ok) {
        lastErr = new Error(`API HTTP ${apiRes.status}`);
        console.warn(`[invidious] ${instance} API → ${apiRes.status}`);
        continue;
      }

      const data = await apiRes.json();
      if (data.error) {
        lastErr = new Error(data.error);
        console.warn(`[invidious] ${instance} API error: ${data.error}`);
        continue;
      }

      // formatStreams = combined video+audio streams (up to 720p), prefer these
      const combined = (data.formatStreams || [])
        .filter(f => f.url && f.container === "mp4")
        .sort((a, b) => (parseInt(b.resolution) || 0) - (parseInt(a.resolution) || 0));

      const best = combined[0];
      if (!best?.url) {
        lastErr = new Error("No combined mp4 format available");
        console.warn(`[invidious] ${instance}: no combined mp4`);
        continue;
      }

      console.log(`[invidious] ${instance} → ${best.qualityLabel || best.quality} ${best.container}, downloading CDN URL`);
      const dlRes = await fetch(best.url, {
        signal: AbortSignal.timeout(5 * 60 * 1000),
        headers: { "User-Agent": BROWSER_UA, "Referer": "https://www.youtube.com/" },
      });

      if (!dlRes.ok) {
        lastErr = new Error(`CDN HTTP ${dlRes.status}`);
        console.warn(`[invidious] CDN responded ${dlRes.status}`);
        continue;
      }

      const outputPath = path.join(outputDir, `${jobId}.mp4`);
      fs.writeFileSync(outputPath, Buffer.from(await dlRes.arrayBuffer()));
      const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
      console.log(`[invidious] ✓ Downloaded via ${instance} — ${sizeMB} MB`);
      return outputPath;
    } catch (err) {
      console.warn(`[invidious] ${instance} failed: ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr || new Error("All Invidious instances failed");
}

// Try yt-dlp pointed at an Invidious URL — yt-dlp has a built-in Invidious extractor
// that fetches formats via the Invidious API (bypassing YouTube bot detection on extraction)
async function tryDownloadViaInvidiousYtDlp(url, outputDir, jobId) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Could not extract YouTube video ID");

  const outputTemplate = path.join(outputDir, `${jobId}.%(ext)s`);
  let lastErr;

  for (const instance of INVIDIOUS_INSTANCES) {
    const invUrl = `${instance}/watch?v=${videoId}`;
    try {
      console.log(`[invidious-ytdlp] Trying ${instance}`);
      const args = [
        invUrl,
        "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]",
        "--merge-output-format", "mp4",
        "-o", outputTemplate,
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        "--socket-timeout", "30",
      ];
      await execFileAsync(YT_DLP, args, { timeout: 5 * 60 * 1000 });

      const files = fs.readdirSync(outputDir).filter(f => f.startsWith(jobId) && f.endsWith(".mp4"));
      if (files.length) {
        console.log(`[invidious-ytdlp] ✓ Downloaded via ${instance}`);
        return path.join(outputDir, files[0]);
      }
    } catch (err) {
      console.warn(`[invidious-ytdlp] ${instance} failed: ${err.message?.slice(0, 120)}`);
      lastErr = err;
    }
  }
  throw lastErr || new Error("All Invidious yt-dlp attempts failed");
}

export async function downloadVideo(url, outputDir, jobId) {
  // 1. Try Invidious API (free, non-GCP, no auth needed)
  try {
    return await tryDownloadViaInvidious(url, outputDir, jobId);
  } catch (err) {
    console.warn(`[downloader] Invidious API failed (${err.message}), trying Invidious via yt-dlp`);
  }

  // 2. Try yt-dlp pointed at Invidious URL (uses yt-dlp's Invidious extractor)
  try {
    return await tryDownloadViaInvidiousYtDlp(url, outputDir, jobId);
  } catch (err) {
    console.warn(`[downloader] Invidious yt-dlp failed (${err.message}), trying Cobalt`);
  }

  // 3. Try Cobalt
  if (process.env.COBALT_ENABLED !== "false") {
    try {
      return await tryDownloadViaCobalt(url, outputDir, jobId);
    } catch (err) {
      console.warn(`[downloader] Cobalt failed (${err.message}), falling back to direct yt-dlp`);
    }
  }

  // 4. Direct yt-dlp (likely blocked from Railway GCP, kept as last resort)
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

  throw new Error(
    `YouTube download failed from all methods. ` +
    `To fix: add a residential proxy — set YTDLP_PROXY in Railway env vars ` +
    `(Webshare Static Residential, $2.99/mo at webshare.io).`
  );
}

export async function getVideoInfo(url) {
  const videoId = extractVideoId(url);

  // Try Invidious first — reliable from non-GCP infra
  if (videoId) {
    for (const instance of INVIDIOUS_INSTANCES) {
      try {
        const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,thumbnails`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.error) continue;
        return {
          title: data.title,
          uploader: data.author,
          duration: data.lengthSeconds,
          thumbnail: data.thumbnails?.[0]?.url,
        };
      } catch {
        // try next
      }
    }
  }

  // Fall back to yt-dlp
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
