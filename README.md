# EdgeStudio

AI-powered short-form video studio. Paste a YouTube link and get viral-scored 9:16 clips with burned captions in minutes. Or describe an idea and JARVIS generates a cinematic video with AI background art, voiceover, and hooks — ready to post.

---

## What It Does

### Clip Studio (YouTube → Shorts)
1. Paste any YouTube URL
2. Backend downloads the video with yt-dlp
3. FFmpeg extracts audio, Whisper AI transcribes it with word-level timestamps
4. GPT-4o reads the full transcript and finds the most viral moments (scored 0–100 on hook strength, emotion, pacing, shareability)
5. FFmpeg crops each moment to 9:16 (1080×1920), burns captions from the transcript, and generates a thumbnail
6. You see each clip with its viral score, hook, caption, and a download button

### Create Studio (AI Video Generator)
1. Type a rough idea → JARVIS (GPT-4o-mini) turns it into a punchy 12-word video message
2. Write your message and choose a visual template, motion effect, and AI voice
3. DALL-E 3 generates a cinematic background image
4. GPT-4o writes a voiceover script and hook text
5. OpenAI TTS records the narration with the chosen voice
6. HTML5 Canvas renders the video (background + text overlay + motion effect) and MediaRecorder exports it as WebM

---

## Architecture

```
Frontend (React + Vite) → Vercel
Backend (Express.js)    → Railway
Database (Supabase)     → PostgreSQL + Auth
```

### Frontend — `src/`
- **`App.jsx`** — Main app. Manages mode (`null` = landing, `"clip"` = Clip Studio, `"create"` = Create Studio), all state, canvas rendering, and export
- **`ClipStudio.jsx`** — Clip results UI. Shows clip cards with viral score, hook, caption, thumbnail, and download button
- **`components/Sidebar.jsx`** — Left nav (Home, Clip, Create, Projects, Feedback, Sign in/out). Always visible
- **`components/ExportQueue.jsx`** — Floating download queue (bottom-right). Tracks real download progress via ReadableStream. Mounted in `main.jsx` so it persists across views
- **`components/CopyrightModal.jsx`** — Two-checkbox copyright confirmation before any clip download
- **`components/AuthModal.jsx`** — Google OAuth + email/password + guest mode via Supabase
- **`components/FeedbackModal.jsx`** — Sends feedback to Supabase `feedback` table
- **`components/TermsModal.jsx`** — Terms of service and privacy policy
- **`contexts/AuthContext.jsx`** — Supabase auth context (user, signIn, signOut, session)
- **`templates.js`** — Visual template definitions (background color, text color, accent color)
- **`index.css`** — Global styles, CSS variables, Apple SF font stack, glass-card/btn-accent utilities

### Backend — `server/`
- **`index.js`** — Express server. Manages an in-memory job store. Routes:
  - `POST /video/process` — starts the full pipeline async, returns a `jobId`
  - `GET /video/status/:id` — poll for job progress and clips
  - `GET /video/jobs` — last 20 jobs
  - `GET /clips/:jobId/:filename` — serves output video files
  - `POST /api/jarvis-suggest` — takes a rough idea, returns a punchy video message via GPT-4o-mini
  - `GET /health` — Railway health check
- **`services/downloader.js`** — yt-dlp wrapper. Downloads up to 720p MP4. Uses `--extractor-args youtube:player_client=android,web` to bypass YouTube bot detection. Supports `YOUTUBE_COOKIES` env var for authenticated downloads
- **`services/transcriber.js`** — FFmpeg audio extraction + OpenAI Whisper transcription with segment timestamps
- **`services/moments.js`** — GPT-4o finds the N best viral moments from the transcript. Returns start/end times, viral score (0–100), hook, caption, title, reason
- **`services/clipper.js`** — FFmpeg clip creation:
  - Crops to 9:16: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`
  - Encodes with libx264 ultrafast, yuv420p, AAC audio
  - Burns SRT captions with `subtitles` filter
  - EdgeStudio watermark via `drawtext` (falls back gracefully if unavailable)
  - Generates JPEG thumbnail at 30% into the clip
- **`lib/binaries.js`** — OS-aware binary paths. Uses `ffmpeg.exe`/`yt-dlp.exe` on Windows, system PATH on Linux (Railway)

### Supabase — `supabase/schema.sql`
Three tables:
- **`feedback`** — User feedback submissions (public insert, service-role read)
- **`jobs`** — Video processing jobs linked to `auth.users`
- **`clips`** — Individual clips linked to jobs and users

All tables have Row Level Security — users only see their own data. Backend uses the service role key to bypass RLS for writes.

---

## Full Pipeline Flow

```
User pastes YouTube URL
        ↓
POST /video/process  →  jobId returned instantly
        ↓
[async] yt-dlp downloads video (720p MP4)
        ↓
FFmpeg strips audio to MP3
        ↓
Whisper API transcribes (segments with timestamps)
        ↓
GPT-4o finds N viral moments in transcript
        ↓
For each moment:
  FFmpeg clips + crops to 9:16
  SRT built from transcript segments
  FFmpeg burns captions into clip
  FFmpeg grabs thumbnail frame
        ↓
job.status = "done", clips array populated
        ↓
Frontend polls /video/status/:id → renders results
        ↓
User clicks Download → CopyrightModal → ExportQueue
ExportQueue fetches clip with ReadableStream → progress bar → save file
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- Python 3 + `pip install yt-dlp` (or drop `yt-dlp.exe` in `server/`)
- FFmpeg on PATH (or drop `ffmpeg.exe`/`ffprobe.exe` in `server/`)

### Frontend
```bash
cd edge-studio
npm install
npm run dev         # http://localhost:5173
```

### Backend
```bash
cd edge-studio/server
npm install
node index.js       # http://localhost:3001
```

### Environment Variables

**Frontend** (`.env` in project root or Vercel dashboard):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE=http://localhost:3001   # omit in prod (Vercel rewrites handle it)
```

**Backend** (`.env` in project root, loaded by `server/index.js`):
```
OPENAI_API_KEY=sk-...
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
YOUTUBE_COOKIES=                      # optional: Netscape-format cookies for age-restricted videos
VIDEO_PORT=3001                       # local only, Railway uses PORT automatically
```

---

## Deployment

### Frontend → Vercel
- Connect the repo to Vercel, set the framework to Vite
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel environment variables
- `vercel.json` rewrites proxy `/video/*`, `/clips/*`, `/api/*`, and `/health` to Railway

### Backend → Railway
- Railway builds using the `Dockerfile` (Ubuntu + ffmpeg via apt + yt-dlp via pip)
- Set `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Railway environment variables
- Railway injects `PORT` automatically — server binds to `0.0.0.0:PORT`
- Health check: `GET /health` → `{ ok: true }`

### Database → Supabase
- Run `supabase/schema.sql` in the Supabase SQL Editor
- Enable Google OAuth in Supabase Auth → Providers
- Add your Vercel domain to the Supabase Auth allowed redirect URLs

---

## Stack Summary

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, HTML5 Canvas, MediaRecorder, Web Audio API |
| Backend | Node.js, Express |
| AI | OpenAI GPT-4o, GPT-4o-mini, Whisper, DALL-E 3, TTS |
| Video | yt-dlp, FFmpeg (libx264, AAC, subtitles filter) |
| Auth | Supabase (Google OAuth, email, guest) |
| Database | Supabase PostgreSQL with RLS |
| Frontend hosting | Vercel |
| Backend hosting | Railway (Dockerfile) |
