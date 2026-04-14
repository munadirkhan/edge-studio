import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === "win32";

// On Windows (local dev) use bundled .exe files
// On Linux (Railway) use system binaries installed via Dockerfile
export const FFMPEG  = IS_WIN ? path.join(__dirname, "..", "ffmpeg.exe")  : "ffmpeg";
export const FFPROBE = IS_WIN ? path.join(__dirname, "..", "ffprobe.exe") : "ffprobe";
export const YT_DLP  = IS_WIN ? path.join(__dirname, "..", "yt-dlp.exe")  : "yt-dlp";
