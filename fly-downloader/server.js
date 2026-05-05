import express from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { v4 as uuid } from "uuid";

const execFileAsync = promisify(execFile);
const app = express();
app.use(express.json());

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

app.get("/health", (_, res) => res.json({ ok: true, service: "fly-downloader" }));

app.post("/download", async (req, res) => {
  const secret = process.env.PROXY_SECRET;
  if (secret && req.headers["x-proxy-secret"] !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  const jobId = uuid();
  const tmpDir = path.join(os.tmpdir(), jobId);
  fs.mkdirSync(tmpDir, { recursive: true });

  const outputTemplate = path.join(tmpDir, "video.%(ext)s");
  console.log(`[fly-dl] Downloading: ${url}`);

  const ATTEMPTS = [
    { client: "web_creator", extra: ["--impersonate", "chrome"] },
    { client: "ios" },
    { client: "tv_embedded" },
    { client: "web" },
    { client: "android" },
  ];

  let lastErr;
  for (const { client, extra = [] } of ATTEMPTS) {
    try {
      await execFileAsync("yt-dlp", [
        "--extractor-args", `youtube:player_client=${client}`,
        ...extra,
        url,
        "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]",
        "--merge-output-format", "mp4",
        "-o", outputTemplate,
        "--no-playlist", "--quiet", "--no-warnings",
        "--socket-timeout", "30",
        "--add-header", `User-Agent:${BROWSER_UA}`,
      ], { timeout: 5 * 60 * 1000 });

      const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".mp4"));
      if (files.length) {
        const filePath = path.join(tmpDir, files[0]);
        const stat = fs.statSync(filePath);
        console.log(`[fly-dl] ✓ client=${client} ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

        res.set("Content-Type", "video/mp4");
        res.set("Content-Length", stat.size);
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        stream.on("close", () => fs.rmSync(tmpDir, { recursive: true, force: true }));
        return;
      }
    } catch (err) {
      console.warn(`[fly-dl] client=${client} failed: ${err.message?.slice(0, 100)}`);
      lastErr = err;
    }
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  res.status(500).json({ error: lastErr?.message?.slice(0, 200) || "All clients failed" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[fly-dl] Running on :${PORT}`));
