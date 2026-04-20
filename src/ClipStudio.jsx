import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "./components/Toast";

// ── Constants ──────────────────────────────────────────────────────────────────

const FONTS = {
  default: { label: "DEFAULT", css: "'Impact', 'Arial Black', sans-serif", weight: 900 },
  comic:   { label: "COMIC",   css: "'Comic Sans MS', 'Chalkboard SE', cursive", weight: 700 },
};

const ASPECT_RATIOS = [
  { id: "9:16",  label: "9:16",  sub: "Shorts, Reels, TikToks", w: 1080, h: 1920, icon: "▯" },
  { id: "16:9",  label: "16:9",  sub: "YouTube",                 w: 1920, h: 1080, icon: "▭" },
];

const PIPELINE_LENGTHS = [
  { label: "30s", value: 30 },
  { label: "45s", value: 45 },
  { label: "60s", value: 60 },
];

function stageToPercent(stage = "") {
  if (stage.includes("Fetching"))     return 8;
  if (stage.includes("Downloading"))  return 22;
  if (stage.includes("Extracting"))   return 38;
  if (stage.includes("Transcribing")) return 54;
  if (stage.includes("Finding"))      return 70;
  if (stage.includes("clip"))         return 83;
  if (stage.includes("Complete"))     return 100;
  return 5;
}

// ── Accordion row ─────────────────────────────────────────────────────────────
function Section({ icon, label, badge, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.65rem",
          padding: "0.85rem 0", background: "none", border: "none",
          color: "#f0ede8", cursor: "pointer", fontFamily: "inherit",
          fontSize: "0.88rem", fontWeight: 600, transition: "opacity 0.15s",
        }}
      >
        <span style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: open ? "var(--accent-dim)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${open ? "var(--accent-border)" : "var(--border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "0.75rem", color: open ? "var(--accent)" : "#6e6a66",
          transition: "all 0.2s",
        }}>{icon}</span>
        <span style={{ color: open ? "#f0ede8" : "#b0a8a0" }}>{label}</span>
        {badge && !open && (
          <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "#5a5755", background: "rgba(255,255,255,0.04)", borderRadius: 5, padding: "0.15rem 0.5rem", border: "1px solid rgba(255,255,255,0.07)" }}>{badge}</span>
        )}
        <span style={{ marginLeft: badge && !open ? "0.25rem" : "auto", fontSize: "0.55rem", color: "#4e4b48", display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
      </button>
      {open && <div style={{ paddingBottom: "1rem" }}>{children}</div>}
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: "pointer",
        background: value ? "var(--accent)" : "rgba(255,255,255,0.1)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 2, left: value ? 22 : 2,
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s",
      }} />
    </div>
  );
}

// ── Slider row ────────────────────────────────────────────────────────────────
function SliderRow({ label, value, min = 0, max = 100, onChange, unit = "%" }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem" }}>
        <span style={{ fontSize: "0.75rem", color: "#7a7672", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, minWidth: 38, textAlign: "right" }}>{value}{unit}</span>
      </div>
      <div style={{ position: "relative", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, var(--accent), #e0c080)", borderRadius: 2, transition: "width 0.05s" }} />
        <input
          type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: "absolute", top: "50%", left: 0, width: "100%", transform: "translateY(-50%)", opacity: 0, cursor: "pointer", height: 20, margin: 0 }}
        />
        <div style={{ position: "absolute", top: "50%", left: `${pct}%`, transform: "translate(-50%, -50%)", width: 14, height: 14, borderRadius: "50%", background: "var(--accent)", border: "2px solid #060609", boxShadow: "0 0 6px rgba(201,169,110,0.5)", pointerEvents: "none", transition: "left 0.05s" }} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClipStudio() {
  const toast = useToast();

  // ── Video state ──────────────────────────────────────────────────────────
  const [videoSrc, setVideoSrc]         = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [dragOver, setDragOver]         = useState(false);
  const fileInputRef                    = useRef(null);

  // ── Pipeline state ───────────────────────────────────────────────────────
  const [pipelineUrl, setPipelineUrl]   = useState("");
  const [pipelineClipCount, setPipelineClipCount] = useState(3);
  const [pipelineLength, setPipelineLength] = useState(60);
  const [jobId, setJobId]               = useState(null);
  const [job, setJob]                   = useState(null);
  const [pipelineError, setPipelineError] = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadFileRef                   = useRef(null);
  const pollRef                         = useRef(null);

  // ── Editor state ─────────────────────────────────────────────────────────
  const [title, setTitle]               = useState("");
  const [titleY, setTitleY]             = useState(20);
  const [subtitle, setSubtitle]         = useState("");
  const [subtitleY, setSubtitleY]       = useState(80);
  const [videoPos, setVideoPos]         = useState(50);
  const [videoScale, setVideoScale]     = useState(100);

  // ── Style state ──────────────────────────────────────────────────────────
  const [font, setFont]                 = useState("default");
  const [textColor, setTextColor]       = useState("#ffffff");
  const [wordHighlight, setWordHighlight] = useState(false);
  const [highlightColor, setHighlightColor] = useState("#ffff00");
  const [boxHighlight, setBoxHighlight] = useState(false);
  const [rotEffect, setRotEffect]       = useState(false);
  const [scaleEffect, setScaleEffect]   = useState(false);
  const [aspectRatio, setAspectRatio]   = useState("9:16");

  // ── Responsive ───────────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Export state ─────────────────────────────────────────────────────────
  const [exporting, setExporting]       = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const rafRef     = useRef(null);
  const wordIdxRef = useRef(0);

  const ar = ASPECT_RATIOS.find(r => r.id === aspectRatio) || ASPECT_RATIOS[0];

  // ── Poll pipeline job ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/video/status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data) return;
        setJob(data);
        if (data.status === "done" || data.status === "failed") clearInterval(pollRef.current);
      } catch {}
    }, 2500);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  // ── Canvas draw loop ──────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // ── Draw video frame with crop/fit ────────────────────────────────────
    if (video.readyState >= 2) {
      const vW = video.videoWidth;
      const vH = video.videoHeight;
      const scale = Math.max(W / vW, H / vH) * (videoScale / 100);
      const dW = vW * scale;
      const dH = vH * scale;
      const panX = (videoPos - 50) / 50; // -1 to 1
      const offX = (W - dW) / 2 + panX * (dW - W) * 0.3;
      const offY = (H - dH) / 2;
      ctx.drawImage(video, offX, offY, dW, dH);
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    const fontCss  = FONTS[font]?.css || FONTS.default.css;
    const fontW    = FONTS[font]?.weight || 900;
    const currentT = video.currentTime || 0;

    function drawText(text, yPct, isCaption) {
      if (!text.trim()) return;
      const words  = text.toUpperCase().split(" ");
      const totalW = words.length;
      const wps    = videoDuration > 0 ? totalW / videoDuration : 1;
      const curWi  = Math.min(Math.floor(currentT * wps), totalW - 1);

      const fontSize = Math.round(W * (isCaption ? 0.058 : 0.072));
      ctx.font       = `${fontW} ${fontSize}px ${fontCss}`;
      ctx.textAlign  = "center";

      // Measure for line-wrapping
      const maxW = W * 0.88;
      const lines = [];
      let line = "";
      let lineWords = [];
      const lineWordMap = [];

      for (let i = 0; i < words.length; i++) {
        const test = line + (line ? " " : "") + words[i];
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line);
          lineWordMap.push(lineWords.slice());
          line = words[i];
          lineWords = [i];
        } else {
          line = test;
          lineWords.push(i);
        }
      }
      if (line) { lines.push(line); lineWordMap.push(lineWords.slice()); }

      const lineH  = fontSize * 1.28;
      const totalH = lines.length * lineH;
      const startY = H * (yPct / 100) - totalH / 2 + fontSize * 0.78;

      lines.forEach((ln, li) => {
        const y = startY + li * lineH;
        const wordsInLine = lineWordMap[li];

        if (wordHighlight) {
          // Draw each word individually for highlight
          const parts = ln.split(" ");
          const totalLineW = ctx.measureText(ln).width;
          let x = W / 2 - totalLineW / 2;
          parts.forEach((word, wi) => {
            const globalIdx = wordsInLine[wi];
            const wW = ctx.measureText(word).width;
            const highlighted = globalIdx === curWi;

            if (boxHighlight && highlighted) {
              ctx.globalAlpha = 0.9;
              ctx.fillStyle = highlightColor;
              ctx.fillRect(x - 4, y - fontSize * 0.88, wW + 8, fontSize * 1.1);
              ctx.globalAlpha = 1;
            }

            // Stroke
            ctx.lineWidth   = fontSize * 0.12;
            ctx.strokeStyle = "rgba(0,0,0,0.85)";
            ctx.lineJoin    = "round";
            ctx.textAlign   = "left";
            ctx.strokeText(word, x, y);

            // Fill
            ctx.fillStyle  = highlighted ? highlightColor : textColor;
            ctx.shadowColor = "rgba(0,0,0,0.6)";
            ctx.shadowBlur  = 6;
            ctx.fillText(word, x, y);
            ctx.shadowBlur  = 0;

            x += wW + ctx.measureText(" ").width;
          });
          ctx.textAlign = "center";
        } else {
          // Simple centered draw
          ctx.lineWidth   = fontSize * 0.1;
          ctx.strokeStyle = "rgba(0,0,0,0.85)";
          ctx.lineJoin    = "round";
          ctx.strokeText(ln, W / 2, y);
          ctx.fillStyle  = textColor;
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur  = 6;
          ctx.fillText(ln, W / 2, y);
          ctx.shadowBlur  = 0;
        }
      });
    }

    drawText(title, titleY, false);
    drawText(subtitle, subtitleY, true);

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [title, titleY, subtitle, subtitleY, videoPos, videoScale, font, textColor,
      wordHighlight, highlightColor, boxHighlight, videoDuration, aspectRatio]);

  // ── Start/stop draw loop when video source changes ────────────────────────
  useEffect(() => {
    if (!videoSrc) return;
    const startLoop = () => { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(drawFrame); };
    startLoop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoSrc, drawFrame]);

  // ── Handle file drop/select ───────────────────────────────────────────────
  function handleFile(file) {
    if (!file || !file.type.startsWith("video/")) return;
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    uploadFileRef.current = file;
    setPipelineError("");
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer?.files?.[0]);
  }

  // ── Load clip from pipeline results into editor ───────────────────────────
  function loadClipIntoEditor(clip) {
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoSrc(clip.downloadUrl);
    setTitle(clip.title || "");
    setSubtitle(clip.caption?.split("\n")?.[0] || "");
  }

  // ── Pipeline submit ───────────────────────────────────────────────────────
  async function handlePipelineSubmit() {
    if (submitting || !pipelineUrl.trim()) return;
    setSubmitting(true); setPipelineError(""); setJob(null); setJobId(null);
    try {
      const res  = await fetch("/video/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pipelineUrl.trim(), clipCount: pipelineClipCount, clipDuration: pipelineLength }),
      });
      const data = await res.json().catch(() => { throw new Error("Backend unavailable"); });
      if (!res.ok || data.error) throw new Error(data.error || "Failed to start");
      setJobId(data.jobId);
      setJob({ status: "queued", stage: "Starting...", clips: [] });
    } catch (err) { setPipelineError(err.message); }
    finally { setSubmitting(false); }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport() {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video || exporting) return;

    const mimeType = ["video/webm;codecs=vp9", "video/webm"].find(m => MediaRecorder.isTypeSupported(m));
    if (!mimeType) { toast.error("Video export requires Chrome or Edge."); return; }

    setExporting(true); setExportProgress(0);

    video.currentTime = 0;
    await new Promise(r => setTimeout(r, 100));

    let audioCtx, destination;
    const videoStream = canvas.captureStream(30);
    let finalStream = videoStream;

    try {
      audioCtx    = new AudioContext();
      destination = audioCtx.createMediaStreamDestination();
      audioCtx.createMediaElementSource(video).connect(destination);
      audioCtx.createMediaElementSource(video)?.connect(audioCtx.destination);
      finalStream = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
    } catch {}

    const recorder = new MediaRecorder(finalStream, { mimeType });
    const chunks   = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      audioCtx?.close();
      const blob = new Blob(chunks, { type: mimeType });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "edge-studio-clip.webm";
      a.click();
      setExporting(false); setExportProgress(0);
      video.pause();
    };

    recorder.start();
    video.play();

    const dur = video.duration * 1000 || 30000;
    const t0  = Date.now();
    const prog = setInterval(() => setExportProgress(Math.min(99, Math.round(((Date.now() - t0) / dur) * 100))), 250);
    setTimeout(() => { clearInterval(prog); recorder.stop(); }, dur + 300);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const isRunning = job && (job.status === "queued" || job.status === "running");
  const isDone    = job?.status === "done";
  const isFailed  = job?.status === "failed";

  // Preview dimensions (scale canvas to fit column)
  const previewH    = isMobile ? (aspectRatio === "9:16" ? 300 : 180) : (aspectRatio === "9:16" ? 500 : 280);
  const previewW    = aspectRatio === "9:16" ? Math.round(previewH * 9 / 16) : Math.round(previewH * 16 / 9);

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "1rem" : "1.5rem", minHeight: isMobile ? "auto" : "80vh", alignItems: "flex-start" }}>

      {/* ════ LEFT CONTROLS ════════════════════════════════════════════════ */}
      <div style={{ width: isMobile ? "100%" : 380, flexShrink: 0, display: "flex", flexDirection: "column", gap: "0" }}>

        {/* ── Step 1: Input ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: "1.25rem" }}>
          <p style={{ margin: "0 0 0.6rem", fontSize: "0.62rem", fontWeight: 700, color: "#6e6a66", letterSpacing: "0.09em" }}>STEP 1</p>
          <div className="glass-card" style={{ padding: "1.25rem" }}>

            {/* ── Primary: YouTube URL ── */}
            <div style={{ marginBottom: "1.1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.65rem" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", flexShrink: 0 }} />
                <span style={{ fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.02em", color: "#f0ede8" }}>Paste a YouTube URL</span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  className="input-base"
                  style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", flex: 1 }}
                  placeholder="https://youtube.com/watch?v=..."
                  value={pipelineUrl}
                  onChange={e => setPipelineUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handlePipelineSubmit()}
                />
                <button
                  className="btn-accent"
                  style={{ padding: "0.75rem 1.1rem", fontSize: "0.85rem", flexShrink: 0, borderRadius: 10 }}
                  onClick={handlePipelineSubmit}
                  disabled={!pipelineUrl.trim() || submitting || isRunning}
                >
                  {submitting || isRunning ? "..." : "Go →"}
                </button>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.55rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.65rem", color: "#5a5755" }}>Clips:</span>
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setPipelineClipCount(n)} style={{
                    fontSize: "0.65rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit",
                    background: pipelineClipCount === n ? "var(--accent)" : "rgba(255,255,255,0.06)",
                    color: pipelineClipCount === n ? "#0a0806" : "#6e6a66",
                    transition: "all 0.15s",
                  }}>{n}</button>
                ))}
                <span style={{ fontSize: "0.65rem", color: "#5a5755", marginLeft: "0.25rem" }}>Length:</span>
                {PIPELINE_LENGTHS.map(l => (
                  <button key={l.value} onClick={() => setPipelineLength(l.value)} style={{
                    fontSize: "0.65rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit",
                    background: pipelineLength === l.value ? "var(--accent)" : "rgba(255,255,255,0.06)",
                    color: pipelineLength === l.value ? "#0a0806" : "#6e6a66",
                    transition: "all 0.15s",
                  }}>{l.label}</button>
                ))}
              </div>
            </div>

            {/* Pipeline status */}
            {isRunning && (
              <div style={{ marginBottom: "0.85rem", padding: "0.75rem", borderRadius: 8, background: "rgba(201,169,110,0.05)", border: "1px solid var(--accent-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                  <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
                  <span style={{ fontSize: "0.75rem", color: "#c9a96e" }}>{job.stage}</span>
                </div>
                <div className="progress-bar" style={{ height: 3 }}>
                  <div className="progress-fill" style={{ width: stageToPercent(job.stage) + "%" }} />
                </div>
              </div>
            )}
            {isFailed && <p style={{ margin: "0 0 0.85rem", fontSize: "0.72rem", color: "#f87171" }}>{job.error?.slice(0, 140)}</p>}
            {isDone && job.clips?.length > 0 && (
              <div style={{ marginBottom: "0.85rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <p style={{ margin: "0 0 0.3rem", fontSize: "0.65rem", color: "#6e6a66", fontWeight: 700, letterSpacing: "0.06em" }}>CLIPS READY — click to load</p>
                {job.clips.map(clip => (
                  <button key={clip.rank} onClick={() => loadClipIntoEditor(clip)}
                    style={{ textAlign: "left", padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.03)", color: "#c0b8b0", cursor: "pointer", fontFamily: "inherit", fontSize: "0.75rem", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "#c0b8b0"; }}
                  >#{clip.rank} — {clip.title} <span style={{ opacity: 0.4 }}>{clip.duration}s</span></button>
                ))}
              </div>
            )}
            {pipelineError && <p style={{ margin: "0 0 0.85rem", fontSize: "0.7rem", color: "#f87171" }}>{pipelineError.slice(0, 140)}</p>}

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0.25rem 0 1rem" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: "0.65rem", color: "#3a3735", fontWeight: 600 }}>OR UPLOAD A FILE</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            {/* ── Secondary: File upload ── */}
            <input ref={fileInputRef} type="file" accept="video/*" style={{ display: "none" }}
              onChange={e => handleFile(e.target.files?.[0])} />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{
                border: `1.5px dashed ${dragOver ? "var(--accent)" : videoSrc ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 10, padding: "1.1rem", textAlign: "center",
                background: dragOver ? "var(--accent-dim)" : videoSrc ? "rgba(74,222,128,0.04)" : "transparent",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {videoSrc ? (
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#4ade80", fontWeight: 600 }}>✓ Video loaded — click to replace</p>
              ) : (
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#4e4b48" }}>↑ Click to upload or drag and drop · MP4, WebM (max 200MB)</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Step 2: Text & Position ───────────────────────────────────── */}
        <div style={{ marginBottom: "1.25rem" }}>
          <p style={{ margin: "0 0 0.6rem", fontSize: "0.62rem", fontWeight: 700, color: "#6e6a66", letterSpacing: "0.09em" }}>STEP 2</p>
          <div className="glass-card" style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.1rem" }}>
              <span style={{ fontSize: "0.8rem" }}>Tt</span>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>Text Overlays</p>
            </div>

            {/* Title row */}
            <div style={{ marginBottom: "0.5rem" }}>
              <label style={{ fontSize: "0.68rem", color: "#6e6a66", fontWeight: 700, letterSpacing: "0.06em", display: "block", marginBottom: "0.35rem" }}>TITLE</label>
              <input
                className="input-base"
                style={{ padding: "0.65rem 0.9rem", fontSize: "0.88rem", marginBottom: "0.55rem" }}
                placeholder="Bold hook text at the top..."
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
              <SliderRow label="Vertical position" value={titleY} min={5} max={50} onChange={setTitleY} />
            </div>

            <div style={{ height: 1, background: "var(--border)", margin: "0.5rem 0 1rem" }} />

            {/* Subtitle row */}
            <div style={{ marginBottom: "0.5rem" }}>
              <label style={{ fontSize: "0.68rem", color: "#6e6a66", fontWeight: 700, letterSpacing: "0.06em", display: "block", marginBottom: "0.35rem" }}>SUBTITLE / CAPTION</label>
              <textarea
                className="input-base"
                style={{ padding: "0.65rem 0.9rem", fontSize: "0.85rem", resize: "none", minHeight: 56, marginBottom: "0.55rem" }}
                placeholder="Supporting text near the bottom..."
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
              />
              <SliderRow label="Vertical position" value={subtitleY} min={50} max={95} onChange={setSubtitleY} />
            </div>

            <div style={{ height: 1, background: "var(--border)", margin: "0.5rem 0 1rem" }} />

            {/* Video framing */}
            <label style={{ fontSize: "0.68rem", color: "#6e6a66", fontWeight: 700, letterSpacing: "0.06em", display: "block", marginBottom: "0.8rem" }}>VIDEO FRAMING</label>
            <SliderRow label="Vertical pan" value={videoPos} onChange={setVideoPos} />
            <SliderRow label="Scale" value={videoScale} min={80} max={200} onChange={setVideoScale} />
          </div>
        </div>

        {/* ── Step 3: Caption Style ─────────────────────────────────────── */}
        <div style={{ marginBottom: "1.25rem" }}>
          <p style={{ margin: "0 0 0.6rem", fontSize: "0.62rem", fontWeight: 700, color: "#6e6a66", letterSpacing: "0.09em" }}>STEP 3</p>
          <div className="glass-card" style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <span style={{ fontSize: "0.8rem" }}>CC</span>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>Caption Style</p>
            </div>

            <Section icon="T" label="Font & Color" badge={FONTS[font]?.label}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
                {Object.entries(FONTS).map(([key, f]) => (
                  <button
                    key={key}
                    onClick={() => setFont(key)}
                    style={{
                      padding: "0.85rem 0.5rem", borderRadius: 10,
                      border: `1.5px solid ${font === key ? "var(--accent)" : "var(--border)"}`,
                      background: font === key ? "rgba(201,169,110,0.08)" : "rgba(255,255,255,0.02)",
                      color: font === key ? "var(--accent)" : "#9a9490",
                      cursor: "pointer", fontFamily: f.css, fontWeight: f.weight,
                      fontSize: "1rem", letterSpacing: "0.04em", transition: "all 0.15s",
                    }}
                  >{f.label}</button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.65rem 0.85rem", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.82rem", color: "#9a9490", fontWeight: 500 }}>Caption color</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: textColor, border: "1px solid rgba(255,255,255,0.15)" }} />
                  <span style={{ fontSize: "0.72rem", color: "#6e6a66" }}>{textColor.toUpperCase()}</span>
                  <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                    style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", background: "none" }} />
                </div>
              </div>
            </Section>

            <Section icon="◈" label="Word Highlight" badge={wordHighlight ? (boxHighlight ? "Box" : "Word") : "Off"}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.7rem 0" }}>
                  <div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Word Highlighting</span>
                    <p style={{ margin: "0.15rem 0 0", fontSize: "0.68rem", color: "#5a5755" }}>Colour the current word as audio plays</p>
                  </div>
                  <Toggle value={wordHighlight} onChange={setWordHighlight} />
                </div>
                {wordHighlight && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0.85rem", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", marginBottom: "0.65rem" }}>
                    <span style={{ fontSize: "0.82rem", color: "#9a9490", fontWeight: 500 }}>Highlight color</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, background: highlightColor, border: "1px solid rgba(255,255,255,0.15)" }} />
                      <input type="color" value={highlightColor} onChange={e => setHighlightColor(e.target.value)}
                        style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", background: "none" }} />
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.7rem 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Box Highlight</span>
                    <p style={{ margin: "0.15rem 0 0", fontSize: "0.68rem", color: "#5a5755" }}>Dark box behind highlighted word</p>
                  </div>
                  <Toggle value={boxHighlight} onChange={v => { setBoxHighlight(v); if (v) setWordHighlight(true); }} />
                </div>
              </div>
            </Section>

            <Section icon="✦" label="Effects" badge={[rotEffect && "Rotation", scaleEffect && "Scale"].filter(Boolean).join(" · ") || "None"}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.7rem 0" }}>
                  <div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Rotation</span>
                    <p style={{ margin: "0.15rem 0 0", fontSize: "0.68rem", color: "#5a5755" }}>Slight tilt on each word pop</p>
                  </div>
                  <Toggle value={rotEffect} onChange={setRotEffect} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.7rem 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Scale Bounce</span>
                    <p style={{ margin: "0.15rem 0 0", fontSize: "0.68rem", color: "#5a5755" }}>Word pops in with a scale effect</p>
                  </div>
                  <Toggle value={scaleEffect} onChange={setScaleEffect} />
                </div>
              </div>
            </Section>

            {/* Caption preview — dark background like a real video */}
            <div style={{ marginTop: "1rem", borderRadius: 10, background: "linear-gradient(135deg, #0d0d1a 0%, #1a0d0d 100%)", height: 100, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.5) 100%)" }} />
              <span style={{
                position: "relative",
                fontFamily: FONTS[font]?.css, fontWeight: FONTS[font]?.weight,
                fontSize: "1.5rem", letterSpacing: "0.04em",
                color: wordHighlight || boxHighlight ? highlightColor : textColor,
                textShadow: "0 2px 12px rgba(0,0,0,0.9)",
                background: boxHighlight ? "rgba(0,0,0,0.75)" : "transparent",
                padding: boxHighlight ? "0.15rem 0.55rem" : 0,
                borderRadius: boxHighlight ? 5 : 0,
              }}>
                PREVIEW TEXT
              </span>
            </div>
          </div>
        </div>

        {/* ── Step 4: Aspect Ratio ──────────────────────────────────────── */}
        <div style={{ marginBottom: "1.25rem" }}>
          <p style={{ margin: "0 0 0.6rem", fontSize: "0.62rem", fontWeight: 700, color: "#6e6a66", letterSpacing: "0.09em" }}>STEP 4</p>
          <div className="glass-card" style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.1rem" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>Canvas Size</p>
              <span style={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.08em", background: "var(--accent-dim)", border: "1px solid var(--accent-border)", color: "var(--accent)", borderRadius: 5, padding: "0.15rem 0.4rem" }}>BETA</span>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {ASPECT_RATIOS.map(r => {
                const isSel = aspectRatio === r.id;
                const is916 = r.id === "9:16";
                return (
                  <button
                    key={r.id}
                    onClick={() => setAspectRatio(r.id)}
                    style={{
                      flex: 1, padding: "1.25rem 0.75rem", borderRadius: 12,
                      border: `1.5px solid ${isSel ? "var(--accent)" : "var(--border)"}`,
                      background: isSel ? "rgba(201,169,110,0.07)" : "rgba(255,255,255,0.02)",
                      cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: "0.85rem",
                    }}
                  >
                    {/* CSS proportional rectangle */}
                    <div style={{
                      width: is916 ? 28 : 54,
                      height: is916 ? 50 : 30,
                      borderRadius: 4,
                      border: `2px solid ${isSel ? "var(--accent)" : "#4e4b48"}`,
                      background: isSel ? "rgba(201,169,110,0.15)" : "rgba(255,255,255,0.04)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                      flexShrink: 0,
                    }}>
                      {isSel && <div style={{ width: "40%", height: "40%", borderRadius: "50%", background: "var(--accent)", opacity: 0.6 }} />}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: "1rem", color: isSel ? "var(--accent)" : "#f0ede8", letterSpacing: "-0.02em" }}>{r.label}</div>
                      <div style={{ fontSize: "0.62rem", color: "#5a5755", marginTop: "0.2rem" }}>{r.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Export button ─────────────────────────────────────────────── */}
        {videoSrc && (
          <div style={{ marginTop: "0.5rem" }}>
            <button
              className="btn-accent"
              style={{ width: "100%", padding: "1.1rem", fontSize: "1rem", borderRadius: 12, fontWeight: 800, letterSpacing: "-0.01em", boxShadow: exporting ? "none" : "0 4px 28px rgba(201,169,110,0.25)", position: "relative", overflow: "hidden" }}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem" }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(10,8,6,0.3)", borderTopColor: "#0a0806", animation: "spin 0.8s linear infinite" }} />
                  Exporting {exportProgress}%
                </span>
              ) : "↓ Export Video"}
            </button>
            {exporting && (
              <div style={{ marginTop: "0.5rem" }}>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${exportProgress}%` }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════ RIGHT PREVIEW ════════════════════════════════════════════════ */}
      <div style={{ flex: 1, minWidth: 0, position: isMobile ? "static" : "sticky", top: "1rem" }}>
        <div className="glass-card" style={{ padding: "1.25rem" }}>
          <p style={{ margin: "0 0 1rem", fontWeight: 700, fontSize: "0.95rem", color: "#9a9490" }}>Preview</p>

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "#0a0a0f", borderRadius: 12, overflow: "hidden",
            minHeight: isMobile ? 180 : 300,
          }}>
            {videoSrc ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                {/* Hidden video element drives the canvas */}
                <video
                  ref={videoRef}
                  src={videoSrc}
                  loop
                  playsInline
                  onLoadedMetadata={e => setVideoDuration(e.target.duration)}
                  style={{ display: "none" }}
                />
                {/* Canvas shows the composited output */}
                <canvas
                  ref={canvasRef}
                  width={ar.w}
                  height={ar.h}
                  style={{ width: previewW, height: previewH, display: "block" }}
                />
                {/* Play/pause overlay */}
                <button
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    v.paused ? v.play() : v.pause();
                  }}
                  style={{
                    position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
                    background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 20,
                    padding: "0.4rem 1rem", color: "#fff", cursor: "pointer",
                    fontSize: "0.75rem", fontWeight: 600,
                  }}
                >
                  ▶ / ⏸
                </button>
              </div>
            ) : (
              <div style={{ padding: "3rem 2rem", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "2rem", opacity: 0.15 }}>▶</p>
                <p style={{ margin: "0.75rem 0 0", fontSize: "0.85rem", color: "#4e4b48" }}>Upload a video to see preview</p>
              </div>
            )}
          </div>

          {/* Clips from pipeline */}
          {isDone && job.clips?.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.68rem", color: "#6e6a66", fontWeight: 600, letterSpacing: "0.06em" }}>
                AI CLIPS — click to load
              </p>
              <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
                {job.clips.map(clip => (
                  <button
                    key={clip.rank}
                    onClick={() => loadClipIntoEditor(clip)}
                    style={{
                      flexShrink: 0, padding: "0.5rem 0.85rem", borderRadius: 8,
                      border: "1px solid var(--border)", background: "rgba(255,255,255,0.03)",
                      color: "#c0b8b0", cursor: "pointer", fontFamily: "inherit", fontSize: "0.75rem",
                      transition: "all 0.15s", whiteSpace: "nowrap",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "#c0b8b0"; }}
                  >
                    #{clip.rank} {clip.duration}s
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
