import { useState, useRef, useEffect } from "react";

const CLIP_COUNTS  = [1, 2, 3, 4, 5];
const CLIP_LENGTHS = [
  { label: "30s", value: 30 },
  { label: "45s", value: 45 },
  { label: "60s", value: 60 },
];
const CAPTION_FONTS = [
  { key: "impact",    label: "Impact" },
  { key: "bebas",     label: "Arial Black" },
  { key: "clean",     label: "Segoe UI" },
  { key: "cinematic", label: "Trebuchet" },
];

function scoreColor(score) {
  if (score >= 80) return "#4ade80";
  if (score >= 65) return "#c9a96e";
  return "#f87171";
}

function fmtTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function stageToPercent(stage = "") {
  if (stage.includes("Fetching"))      return 8;
  if (stage.includes("Downloading"))   return 22;
  if (stage.includes("Extracting"))    return 38;
  if (stage.includes("Transcribing"))  return 54;
  if (stage.includes("Finding"))       return 70;
  if (stage.includes("clip 1"))        return 76;
  if (stage.includes("clip 2"))        return 83;
  if (stage.includes("clip 3"))        return 89;
  if (stage.includes("clip"))          return 82;
  if (stage.includes("Complete"))      return 100;
  return 5;
}

export default function ClipStudio() {
  const [url, setUrl]               = useState("");
  const [clipCount, setClipCount]   = useState(3);
  const [clipLength, setClipLength] = useState(60);
  const [fontKey, setFontKey]       = useState("impact");
  const [jobId, setJobId]           = useState(null);
  const [job, setJob]               = useState(null);
  const [error, setError]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sortBy, setSortBy]         = useState("score"); // "score" | "time"
  const [playingClip, setPlayingClip] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/video/status/${jobId}`);
        if (!res.ok) return;
        let data;
        try { data = await res.json(); } catch { return; }
        setJob(data);
        if (data.status === "done" || data.status === "failed") {
          clearInterval(pollRef.current);
        }
      } catch {}
    }, 2500);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  async function handleSubmit() {
    if (!url.trim() || submitting) return;
    setError("");
    setJob(null);
    setJobId(null);
    setPlayingClip(null);
    setSubmitting(true);
    try {
      const res  = await fetch("/video/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), clipCount, clipDuration: clipLength, fontKey }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error("Backend unavailable — run: cd server && node index.js"); }
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setJobId(data.jobId);
      setJob({ status: "queued", stage: "Starting...", clips: [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const isRunning = job && (job.status === "queued" || job.status === "running");
  const isDone    = job?.status === "done";
  const isFailed  = job?.status === "failed";

  const sortedClips = isDone && job.clips
    ? [...job.clips].sort((a, b) =>
        sortBy === "score" ? b.viralScore - a.viralScore : a.start - b.start
      )
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* ── Input ── */}
      <div className="glass-card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
          <span style={{ color: "var(--accent)", fontSize: "1rem" }}>✂</span>
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>Video to Shorts</span>
          {isDone && (
            <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "#5a5755" }}>
              {job.clips.length} clips extracted
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1rem" }}>
          <input
            className="input-base"
            style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", flex: 1 }}
            placeholder="Paste YouTube URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <button
            className="btn-accent"
            style={{ padding: "0.75rem 1.25rem", fontSize: "0.85rem", flexShrink: 0 }}
            onClick={handleSubmit}
            disabled={!url.trim() || submitting || isRunning}
          >
            {submitting || isRunning ? "Processing..." : "Process →"}
          </button>
        </div>

        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: "0 0 0.45rem", fontSize: "0.65rem", fontWeight: 700, color: "#5a5755", letterSpacing: "0.06em" }}>CLIPS</p>
            <div style={{ display: "flex" }}>
              {CLIP_COUNTS.map((n) => (
                <button key={n} className={`segment-btn${clipCount === n ? " active" : ""}`} onClick={() => setClipCount(n)}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ margin: "0 0 0.45rem", fontSize: "0.65rem", fontWeight: 700, color: "#5a5755", letterSpacing: "0.06em" }}>MAX LENGTH</p>
            <div style={{ display: "flex" }}>
              {CLIP_LENGTHS.map((l) => (
                <button key={l.value} className={`segment-btn${clipLength === l.value ? " active" : ""}`} onClick={() => setClipLength(l.value)}>{l.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ margin: "0 0 0.45rem", fontSize: "0.65rem", fontWeight: 700, color: "#5a5755", letterSpacing: "0.06em" }}>CAPTION FONT</p>
            <div style={{ display: "flex" }}>
              {CAPTION_FONTS.map((f) => (
                <button key={f.key} className={`segment-btn${fontKey === f.key ? " active" : ""}`} onClick={() => setFontKey(f.key)}>{f.label}</button>
              ))}
            </div>
          </div>
        </div>

        {error && <p style={{ margin: "0.75rem 0 0", fontSize: "0.8rem", color: "#f87171" }}>{error}</p>}
      </div>

      {/* ── Progress ── */}
      {isRunning && (
        <div className="glass-card" style={{ padding: "1.25rem" }}>
          {job.title && <p style={{ margin: "0 0 0.6rem", fontSize: "0.82rem", fontWeight: 600, color: "#a09888" }}>{job.title}</p>}
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.75rem" }}>
            <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: "0.85rem", color: "#c0b8b0" }}>{job.stage}</span>
          </div>
          <div className="progress-bar" style={{ height: 3 }}>
            <div className="progress-fill" style={{ width: stageToPercent(job.stage) + "%" }} />
          </div>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.68rem", color: "#4a4745" }}>
            2–5 min depending on video length.
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {isFailed && (
        <div className="glass-card" style={{ padding: "1.25rem", borderColor: "rgba(248,113,113,0.2)" }}>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#f87171" }}>Pipeline failed: {job.error}</p>
        </div>
      )}

      {/* ── Results ── */}
      {isDone && sortedClips.length > 0 && (
        <>
          {/* Sort bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>All Moments</span>
              <span style={{ fontSize: "0.72rem", color: "#5a5755", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.15rem 0.5rem" }}>
                {sortedClips.length}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.68rem", color: "#5a5755" }}>Sort by</span>
              <button
                onClick={() => setSortBy("score")}
                style={{
                  fontSize: "0.72rem", fontWeight: 600, padding: "0.3rem 0.65rem", borderRadius: 6, border: "1px solid var(--border)",
                  background: sortBy === "score" ? "var(--accent-dim)" : "transparent",
                  color: sortBy === "score" ? "var(--accent)" : "#6b6568",
                  cursor: "pointer", fontFamily: "inherit",
                  borderColor: sortBy === "score" ? "var(--accent-border)" : "var(--border)",
                }}
              >Viral Score</button>
              <button
                onClick={() => setSortBy("time")}
                style={{
                  fontSize: "0.72rem", fontWeight: 600, padding: "0.3rem 0.65rem", borderRadius: 6, border: "1px solid var(--border)",
                  background: sortBy === "time" ? "var(--accent-dim)" : "transparent",
                  color: sortBy === "time" ? "var(--accent)" : "#6b6568",
                  cursor: "pointer", fontFamily: "inherit",
                  borderColor: sortBy === "time" ? "var(--accent-border)" : "var(--border)",
                }}
              >Timestamp</button>
            </div>
          </div>

          {/* Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
            {sortedClips.map((clip) => (
              <ClipCard
                key={clip.rank}
                clip={clip}
                playing={playingClip === clip.rank}
                onPlay={() => setPlayingClip(playingClip === clip.rank ? null : clip.rank)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ClipCard({ clip, playing, onPlay }) {
  const color = scoreColor(clip.viralScore);
  const [copied, setCopied] = useState(false);

  function copyCaption() {
    navigator.clipboard.writeText(clip.caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="glass-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Thumbnail / video */}
      <div style={{ position: "relative", aspectRatio: "9/16", background: "#0a0a0f", overflow: "hidden", maxHeight: 280 }}>
        {playing ? (
          <video
            src={clip.downloadUrl}
            autoPlay
            controls
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : clip.thumbnailUrl ? (
          <img
            src={clip.thumbnailUrl}
            alt={clip.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#3a3735", fontSize: "2rem" }}>▶</div>
        )}

        {/* Play button overlay */}
        {!playing && (
          <button
            onClick={onPlay}
            style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)",
              border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.5)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.3)"}
          >
            <div style={{
              width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.9)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: "1rem", marginLeft: 3, color: "#0a0a0f" }}>▶</span>
            </div>
          </button>
        )}

        {/* Viral score badge */}
        <div style={{
          position: "absolute", bottom: 8, left: 8,
          background: "rgba(0,0,0,0.85)", border: `2px solid ${color}`,
          borderRadius: "50%", width: 42, height: 42,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column",
        }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 800, color, lineHeight: 1 }}>{clip.viralScore}</span>
        </div>

        {/* Duration badge */}
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "rgba(0,0,0,0.75)", borderRadius: 5,
          padding: "0.2rem 0.45rem", fontSize: "0.65rem", fontWeight: 600, color: "#f0ede8",
        }}>
          {clip.duration}s
        </div>

        {/* Rank badge */}
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: "var(--accent)", borderRadius: 5,
          padding: "0.2rem 0.45rem", fontSize: "0.62rem", fontWeight: 800, color: "#0a0806",
        }}>
          #{clip.rank}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.82rem", lineHeight: 1.35, color: "#f0ede8" }}>
          {clip.title}
        </p>

        <p style={{ margin: 0, fontSize: "0.72rem", color: "#5a5755", lineHeight: 1.4 }}>
          {fmtTime(clip.start)} → {fmtTime(clip.end)}
        </p>

        <p style={{ margin: 0, fontSize: "0.72rem", color: "#7a7472", lineHeight: 1.45, fontStyle: "italic" }}>
          {clip.reason}
        </p>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "auto", paddingTop: "0.5rem" }}>
          <a
            href={clip.downloadUrl}
            download
            style={{
              flex: 1, padding: "0.55rem 0", fontSize: "0.75rem", fontWeight: 700,
              textAlign: "center", textDecoration: "none",
              background: "var(--accent)", color: "#0a0806",
              borderRadius: 8,
            }}
          >
            ↓ Download
          </a>
          <button
            onClick={copyCaption}
            style={{
              flex: 1, padding: "0.55rem 0", fontSize: "0.75rem", fontWeight: 600,
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
              color: copied ? "#4ade80" : "#8a8580", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {copied ? "Copied!" : "Copy Caption"}
          </button>
        </div>
      </div>
    </div>
  );
}
