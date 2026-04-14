import { useState, useRef, useEffect } from "react";
import { TEMPLATES } from "./templates";
import ClipStudio from "./ClipStudio";
import AuthModal from "./components/AuthModal";
import { useAuth } from "./contexts/AuthContext";

// ─── Utilities ────────────────────────────────────────────────────────────────


async function parseApiResponse(response, fallbackMessage) {
  const text = await response.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch { throw new Error(`${fallbackMessage} (non-JSON response)`); }
  }
  if (!response.ok) throw new Error(data.error || `${fallbackMessage} (${response.status})`);
  return data;
}

function timeoutAfter(ms, label) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
  );
}

function generateLogEntry(templateName, status) {
  return {
    id: Date.now(),
    timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
    template: templateName,
    status,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATIONS = [
  { label: "8s",    value: 8  },
  { label: "15s",   value: 15 },
  { label: "30s",   value: 30 },
  { label: "45s",   value: 45 },
  { label: "1 min", value: 60 },
];

const MOTION_EFFECTS = [
  { id: "zoom",     label: "Zoom"   },
  { id: "pan",      label: "Pan"    },
  { id: "parallax", label: "Wave"   },
  { id: "none",     label: "Static" },
];

const MOTION_INTENSITIES = [
  { id: "subtle",    label: "Subtle"    },
  { id: "cinematic", label: "Cinematic" },
];

const VOICES = [
  { id: "onyx",    label: "Onyx — deep, US"         },
  { id: "fable",   label: "Fable — deep, British"   },
  { id: "echo",    label: "Echo — warm"             },
  { id: "nova",    label: "Nova — clear"            },
  { id: "shimmer", label: "Shimmer — bright"        },
  { id: "alloy",   label: "Alloy — neutral"         },
];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, signOut } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Top-level mode
  const [mode, setMode] = useState("create"); // "create" | "clip"

  // Step flow
  const [step, setStep] = useState(1);

  // Step 1: content input
  const [userMessage, setUserMessage]   = useState("");
  const [jarvisIdea, setJarvisIdea]     = useState("");
  const [jarvisBusy, setJarvisBusy]     = useState(false);
  const [clipDuration, setClipDuration] = useState(15);

  // Step 2: style
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [motionEffect, setMotionEffect]         = useState("zoom");
  const [motionIntensity, setMotionIntensity]   = useState("cinematic");
  const [selectedVoice, setSelectedVoice]       = useState("onyx");

  // Generation
  const [generating, setGenerating]         = useState(false);
  const [generateStatus, setGenerateStatus] = useState("");
  const [bgImageEl, setBgImageEl]           = useState(null);
  const [, setRawGeneratedImage] = useState("");
  const [, setImageDebug]         = useState("");

  // Generated content
  const [hook, setHook]         = useState("");
  const [showTextOverlay, setShowTextOverlay] = useState(true);
  const [caption, setCaption]   = useState("");
  const [hashtags, setHashtags] = useState("");

  // Voice narration
  const [voiceBuffer, setVoiceBuffer] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState("");

  // Export
  const [exportStatus, setExportStatus]     = useState("");
  const [exportProgress, setExportProgress] = useState(0);

  // Activity log
  const [activityLog, setActivityLog] = useState([]);

  const canvasRef = useRef(null);

  // ─── Canvas ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (step >= 3 && selectedTemplate && bgImageEl) drawCanvasFrame();
  }, [step, selectedTemplate, bgImageEl, userMessage, hook, motionEffect, motionIntensity, showTextOverlay]);

  function drawCanvasFrame(elapsedMs = 0, durationMs = 0) {
    const canvas = canvasRef.current;
    if (!canvas || !selectedTemplate) return;

    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const T = selectedTemplate;
    const progress = durationMs > 0 ? Math.max(0, Math.min(1, elapsedMs / durationMs)) : 0;
    const isCinematic = motionIntensity === "cinematic";

    // Background + motion
    if (bgImageEl) {
      let scale = 1, offsetX = 0, offsetY = 0;
      if (motionEffect === "zoom") {
        scale = 1 + (isCinematic ? 0.28 : 0.16) * progress;
      } else if (motionEffect === "pan") {
        scale = isCinematic ? 1.14 : 1.08;
        offsetX = isCinematic ? -72 + 144 * progress : -40 + 80 * progress;
      } else if (motionEffect === "parallax") {
        const cycles = isCinematic ? 2.2 : 1.2;
        scale = isCinematic ? 1.18 : 1.12;
        offsetX = isCinematic ? -90 + 180 * progress : -24 + 48 * progress;
        offsetY = Math.sin(progress * Math.PI * 2 * cycles) * (isCinematic ? 10 : 6);
      }
      const dW = W * scale, dH = H * scale;
      ctx.drawImage(bgImageEl, (W - dW) / 2 + offsetX, (H - dH) / 2 + offsetY, dW, dH);
      // Cinematic vignette
      const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.78);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.72)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
      // Top fade
      const topFade = ctx.createLinearGradient(0, 0, 0, H * 0.3);
      topFade.addColorStop(0, "rgba(0,0,0,0.55)");
      topFade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = topFade;
      ctx.fillRect(0, 0, W, H);
      // Bottom fade
      const botFade = ctx.createLinearGradient(0, H * 0.65, 0, H);
      botFade.addColorStop(0, "rgba(0,0,0,0)");
      botFade.addColorStop(1, "rgba(0,0,0,0.8)");
      ctx.fillStyle = botFade;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = T.bg;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Text overlay (hook text, vertically centered) ──────────
    if (showTextOverlay) {
      // Use hook when available (short + punchy), fall back to trimmed message
      const displayText = hook || userMessage || "Your message here";

      // Dynamic font size: bigger when fewer words
      const wordCount = displayText.split(" ").length;
      const fontSize = wordCount <= 6 ? 110 : wordCount <= 10 ? 90 : 76;
      const lineHeight = fontSize * 1.28;
      const maxWidth = W - 200;

      ctx.font = `900 ${fontSize}px 'Cinzel', 'Georgia', serif`;
      ctx.textAlign = "center";

      // Measure and wrap lines
      const words = displayText.split(" ");
      let tempLine = "", measuredLines = [];
      for (const word of words) {
        const test = tempLine + word + " ";
        if (ctx.measureText(test).width > maxWidth && tempLine !== "") {
          measuredLines.push(tempLine.trim());
          tempLine = word + " ";
        } else {
          tempLine = test;
        }
      }
      measuredLines.push(tempLine.trim());

      const blockH = measuredLines.length * lineHeight;
      const centerY = H * 0.5;
      const startY = centerY - blockH / 2 + fontSize * 0.78;

      // Soft dark backdrop behind text block
      const padX = 80, padY = 40;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - maxWidth / 2 - padX, startY - fontSize - padY, maxWidth + padX * 2, blockH + padY * 2, 18);
      ctx.fill();

      // Thin accent rule above
      ctx.fillStyle = T.accentColor;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(W / 2 - 48, startY - fontSize - padY + 10, 96, 2);
      ctx.globalAlpha = 1;

      // Text with layered shadow for depth
      ctx.textAlign = "center";
      measuredLines.forEach((line, i) => {
        const y = startY + i * lineHeight;
        // Hard shadow
        ctx.fillStyle = "rgba(0,0,0,0.9)";
        ctx.shadowColor = "transparent";
        ctx.fillText(line, W / 2 + 3, y + 3);
        // Soft glow
        ctx.fillStyle = T.textColor;
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 28;
        ctx.fillText(line, W / 2, y);
        ctx.shadowBlur = 0;
      });

      // Thin accent rule below
      ctx.fillStyle = T.accentColor;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(W / 2 - 32, startY + measuredLines.length * lineHeight - lineHeight * 0.1 + 12, 64, 2);
      ctx.globalAlpha = 1;
    }

    // ── AURA watermark ────────────────────────────────────────
    // Watermark strip at bottom
    const stampY = H - 110;

    // Diamond mark
    ctx.save();
    ctx.translate(W / 2, stampY);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = T.accentColor;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();

    // "AURA" text
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = T.textColor;
    ctx.font = "700 22px 'Inter', sans-serif";
    ctx.letterSpacing = "0.22em";
    ctx.textAlign = "center";
    ctx.fillText("A  U  R  A", W / 2, stampY + 36);
    ctx.globalAlpha = 0.25;
    ctx.font = "400 16px 'Inter', sans-serif";
    ctx.fillText("EdgeStudio", W / 2, stampY + 62);
    ctx.globalAlpha = 1;
    ctx.letterSpacing = "0em";
  }

  // ─── Image generation ────────────────────────────────────────────────────────

  async function generateImage(templateId) {
    setGenerateStatus("Generating background image...");
    const res = await Promise.race([
      fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      }),
      timeoutAfter(90000, "Image generation"),
    ]);
    const data = await parseApiResponse(res, "Image generation failed");
    if (!data?.image) throw new Error("No image returned");
    return { image: data.image, source: "backend" };
  }

  // ─── Caption generation ──────────────────────────────────────────────────────

  async function generateCaption() {
    setGenerateStatus("Writing your content...");
    const res = await fetch("/api/generate-caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage }),
    });
    return parseApiResponse(res, "Caption generation failed");
  }

  // ─── Narration script generation ─────────────────────────────────────────────

  async function generateNarrationScript(message, hook) {
    const res = await fetch("/api/generate-narration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, hook, clipDuration }),
    });
    const data = await parseApiResponse(res, "Narration script failed");
    return data.script || hook;
  }

  // ─── Voice generation ────────────────────────────────────────────────────────

  async function generateVoice(text) {
    setVoiceStatus("Generating narration...");
    setVoiceBuffer(null);
    const res = await fetch("/api/generate-voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: selectedVoice }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Voice generation failed");
    }
    const buf = await res.arrayBuffer();
    setVoiceBuffer(buf);
    setVoiceStatus("Narration ready");
    return buf;
  }

  function previewVoice() {
    if (!voiceBuffer) return;
    const blob = new Blob([voiceBuffer], { type: "audio/mpeg" });
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  }

  // ─── JARVIS idea auto-fill ────────────────────────────────────────────────────

  async function handleJarvisSuggest() {
    if (!jarvisIdea.trim() || jarvisBusy) return;
    setJarvisBusy(true);
    try {
      const res  = await fetch("/api/jarvis-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: jarvisIdea }),
      });
      const data = await parseApiResponse(res, "JARVIS failed");
      if (data.message) setUserMessage(data.message);
    } catch (err) {
      console.error("JARVIS suggest error:", err);
    } finally {
      setJarvisBusy(false);
    }
  }

  // ─── Main generation flow ─────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!selectedTemplate || !userMessage.trim()) return;

    setGenerating(true);
    setBgImageEl(null);
    setRawGeneratedImage("");
    setImageDebug("");
    setCaption("");
    setHook("");
    setHashtags("");
    setVoiceBuffer(null);
    setVoiceStatus("");
    setGenerateStatus("");

    try {
      const [imgData, capData] = await Promise.all([
        generateImage(selectedTemplate.id),
        generateCaption(),
      ]);

      setRawGeneratedImage(imgData.image);
      setImageDebug(imgData.source);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => setBgImageEl(img);
      img.src = imgData.image;

      const hookText = capData?.hook || "";
      setHook(hookText);
      setCaption(capData?.caption || "");
      setHashtags(capData?.hashtags || "");

      if (hookText) {
        setGenerateStatus("Writing narration script...");
        const narrationScript = await generateNarrationScript(userMessage, hookText).catch(() => hookText);
        setGenerateStatus("Generating narration audio...");
        await generateVoice(narrationScript).catch((err) => {
          console.warn("Voice non-fatal:", err.message);
          setVoiceStatus("Narration unavailable");
        });
      }

      setActivityLog((prev) => [generateLogEntry(selectedTemplate.name, "success"), ...prev].slice(0, 12));
      setGenerateStatus("Ready to export!");
      setStep(4);
    } catch (err) {
      console.error(err);
      setGenerateStatus(`Error: ${err.message}`);
      setActivityLog((prev) => [generateLogEntry(selectedTemplate?.name || "—", "error"), ...prev].slice(0, 12));
    } finally {
      setGenerating(false);
    }
  }

  // ─── Export ───────────────────────────────────────────────────────────────────

  function downloadPNG() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "aura.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function exportVideo() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) =>
      MediaRecorder.isTypeSupported(m)
    );
    if (!mimeType) { alert("Video export requires Chrome or Edge."); return; }

    setExportStatus("Preparing...");
    setExportProgress(0);

    const baseDuration = clipDuration * 1000;
    let durationMs = baseDuration;

    const videoStream = canvas.captureStream(30);
    let recordStream = videoStream;
    let audioCtx = null;
    let audioSource = null;

    if (voiceBuffer) {
      try {
        audioCtx = new AudioContext();
        const audioBuffer = await audioCtx.decodeAudioData(voiceBuffer.slice(0));
        durationMs = Math.max(baseDuration, Math.ceil(audioBuffer.duration * 1000) + 400);
        const destination = audioCtx.createMediaStreamDestination();
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(destination);
        recordStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...destination.stream.getAudioTracks(),
        ]);
      } catch (err) {
        console.warn("Audio setup failed, video only:", err.message);
        audioCtx = null;
      }
    }

    const recorder = new MediaRecorder(recordStream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      audioCtx?.close();
      const blob = new Blob(chunks, { type: mimeType });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "aura.webm";
      a.click();
      setExportStatus("Done");
      setExportProgress(100);
    };

    recorder.start();
    audioSource?.start(0);
    setExportStatus("Recording...");

    const startTime = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      setExportProgress(Math.min(99, Math.round((elapsed / durationMs) * 100)));
      drawCanvasFrame(elapsed, durationMs);
    }, 33);

    setTimeout(() => { clearInterval(interval); recorder.stop(); }, durationMs);
  }

  // ─── Reset ────────────────────────────────────────────────────────────────────

  function resetAll() {
    setStep(1);
    setUserMessage("");
    setJarvisIdea("");
    setSelectedTemplate(null);
    setBgImageEl(null);
    setRawGeneratedImage("");
    setImageDebug("");
    setCaption("");
    setHook("");
    setHashtags("");
    setVoiceBuffer(null);
    setVoiceStatus("");
    setGenerateStatus("");
    setExportStatus("");
    setExportProgress(0);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const accentStyle = { color: "var(--accent)" };

  return (
    <div style={{ minHeight: "100vh", background: "#060609" }}>

      {/* Ambient glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0,
      }}>
        <div style={{
          position: "absolute", top: "-20%", right: "-10%",
          width: 600, height: 600,
          background: "radial-gradient(circle, rgba(201,169,110,0.04) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
        <div style={{
          position: "absolute", bottom: "-10%", left: "-10%",
          width: 500, height: 500,
          background: "radial-gradient(circle, rgba(100,120,200,0.04) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
      </div>

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ── Header ── */}
        <header style={{
          borderBottom: "1px solid var(--border)",
          padding: "1rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backdropFilter: "blur(20px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(6,6,9,0.9)",
        }}>
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
            <span style={accentStyle}>Edge</span>
            <span style={{ color: "#f0ede8" }}>Studio</span>
          </h1>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              <span style={{ fontSize: "0.65rem", color: "#4a4745", letterSpacing: "0.05em" }}>JARVIS ONLINE</span>
            </div>
            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontSize: "0.7rem", color: "#5a5755", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
                <button onClick={signOut} style={{ fontSize: "0.7rem", padding: "0.3rem 0.65rem", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "#5a5755", cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
              </div>
            ) : (
              <button onClick={() => setShowAuthModal(true)} className="btn-accent" style={{ fontSize: "0.75rem", padding: "0.38rem 0.9rem" }}>Sign in</button>
            )}
          </div>
        </header>

        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

        {/* ── Hero ── */}
        <div style={{ textAlign: "center", padding: "3.5rem 1.5rem 2rem", borderBottom: "1px solid var(--border)" }}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", color: "#5a5755" }}>AI SHORT-FORM VIDEO CREATOR</p>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: "#f0ede8" }}>
            Turn any idea or video<br />
            <span style={accentStyle}>into viral shorts</span>
          </h2>
          <p style={{ margin: "0 0 2.5rem", fontSize: "0.95rem", color: "#5a5755", maxWidth: 480, marginInline: "auto" }}>
            Generate AI-narrated motivational clips with one prompt, or drop a YouTube link and let JARVIS find the best moments automatically.
          </p>

          {/* Big mode switcher */}
          <div style={{ display: "inline-flex", gap: "0.75rem", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 16, padding: "0.4rem" }}>
            {[
              { id: "create", label: "✦ Create", desc: "AI-generated clips" },
              { id: "clip",   label: "✂  Clip",  desc: "YouTube → Shorts" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  padding: "0.85rem 2.5rem", borderRadius: 12, border: "none",
                  background: mode === tab.id ? "var(--accent)" : "transparent",
                  color: mode === tab.id ? "#0a0806" : "#6b6568",
                  cursor: "pointer", fontFamily: "inherit", transition: "all 0.18s",
                }}
              >
                <span style={{ fontSize: "1rem", fontWeight: 800, letterSpacing: "-0.01em" }}>{tab.label}</span>
                <span style={{ fontSize: "0.65rem", fontWeight: 500, marginTop: 2, opacity: 0.7 }}>{tab.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Main layout ── */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem", display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem" }}>

          {/* ── Content area ── */}
          <div style={{ minWidth: 0 }}>

            {/* CLIP MODE */}
            {mode === "clip" && <ClipStudio />}

            {/* STEP 1: Message */}
            {mode === "create" && step === 1 && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

                {/* JARVIS idea box */}
                <div className="glass-card" style={{ padding: "1.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
                    <span style={{ ...accentStyle, fontSize: "1rem" }}>✦</span>
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#a09888", letterSpacing: "0.06em" }}>ASK JARVIS</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.6rem" }}>
                    <input
                      className="input-base"
                      style={{ padding: "0.7rem 1rem", fontSize: "0.875rem" }}
                      placeholder="Describe your idea — discipline, sacrifice, grinding..."
                      value={jarvisIdea}
                      onChange={(e) => setJarvisIdea(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleJarvisSuggest()}
                    />
                    <button
                      className="btn-accent"
                      style={{ padding: "0.7rem 1.1rem", fontSize: "0.8rem", whiteSpace: "nowrap", flexShrink: 0 }}
                      onClick={handleJarvisSuggest}
                      disabled={!jarvisIdea.trim() || jarvisBusy}
                    >
                      {jarvisBusy ? "..." : "Fill →"}
                    </button>
                  </div>
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.7rem", color: "#4a4745" }}>
                    JARVIS will craft your message — or write your own below.
                  </p>
                </div>

                {/* Message textarea */}
                <div className="glass-card" style={{ padding: "1.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: 8, background: "var(--accent-dim)",
                      border: "1px solid var(--accent-border)", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.7rem", fontWeight: 700, ...accentStyle, flexShrink: 0,
                    }}>1</span>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Your Message</span>
                  </div>
                  <textarea
                    className="input-base"
                    style={{ padding: "0.85rem 1rem", fontSize: "0.9rem", resize: "none", lineHeight: 1.6 }}
                    rows={5}
                    placeholder="The message that drives your video..."
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                  />
                </div>

                {/* Duration picker */}
                <div className="glass-card" style={{ padding: "1.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: 8, background: "var(--surface-hover)",
                      border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.7rem", fontWeight: 700, color: "#6b6568", flexShrink: 0,
                    }}>⏱</span>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Video Duration</span>
                  </div>
                  <div style={{ display: "flex" }}>
                    {DURATIONS.map((d) => (
                      <button
                        key={d.value}
                        className={`segment-btn${clipDuration === d.value ? " active" : ""}`}
                        onClick={() => setClipDuration(d.value)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.7rem", color: "#4a4745" }}>
                    Narration auto-extends if longer than selected duration.
                  </p>
                </div>

                <button
                  className="btn-accent"
                  style={{ width: "100%", padding: "0.9rem", fontSize: "0.95rem" }}
                  onClick={() => userMessage.trim() && setStep(2)}
                  disabled={!userMessage.trim()}
                >
                  Choose Visual Style →
                </button>
              </div>
            )}

            {/* STEP 2: Style */}
            {mode === "create" && step === 2 && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

                {/* Template grid */}
                <div className="glass-card" style={{ padding: "1.25rem" }}>
                  <p style={{ margin: "0 0 1rem", fontSize: "0.75rem", fontWeight: 700, color: "#6b6568", letterSpacing: "0.06em" }}>
                    VISUAL STYLE
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.65rem" }}>
                    {TEMPLATES.map((t) => (
                      <div
                        key={t.id}
                        className={`template-card${selectedTemplate?.id === t.id ? " selected" : ""}`}
                        style={{ background: selectedTemplate?.id === t.id ? undefined : t.bg }}
                        onClick={() => setSelectedTemplate(t)}
                      >
                        <span style={{ fontSize: 26 }}>{t.preview}</span>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: selectedTemplate?.id === t.id ? "var(--accent)" : t.textColor, opacity: 0.9 }}>
                          {t.name}
                        </span>
                        {selectedTemplate?.id === t.id && (
                          <span style={{ fontSize: "0.65rem", ...accentStyle, fontWeight: 700 }}>✓ Selected</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Motion + Voice row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                  {[
                    { label: "Motion", items: MOTION_EFFECTS, value: motionEffect, setValue: setMotionEffect },
                    { label: "Intensity", items: MOTION_INTENSITIES, value: motionIntensity, setValue: setMotionIntensity },
                    {
                      label: "Voice",
                      custom: (
                        <select
                          className="input-base"
                          style={{ padding: "0.55rem 0.75rem", fontSize: "0.8rem" }}
                          value={selectedVoice}
                          onChange={(e) => setSelectedVoice(e.target.value)}
                        >
                          {VOICES.map((v) => (
                            <option key={v.id} value={v.id}>{v.label}</option>
                          ))}
                        </select>
                      ),
                    },
                  ].map(({ label, items, value, setValue, custom }) => (
                    <div key={label} className="glass-card" style={{ padding: "1rem" }}>
                      <p style={{ margin: "0 0 0.7rem", fontSize: "0.7rem", fontWeight: 700, color: "#6b6568", letterSpacing: "0.06em" }}>
                        {label.toUpperCase()}
                      </p>
                      {custom || (
                        <div style={{ display: "flex", flexWrap: "wrap" }}>
                          {items.map((item) => (
                            <button
                              key={item.id}
                              className={`segment-btn${value === item.id ? " active" : ""}`}
                              onClick={() => setValue(item.id)}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button className="btn-ghost" style={{ flex: 1, padding: "0.85rem", fontSize: "0.875rem" }} onClick={() => setStep(1)}>← Back</button>
                  <button
                    className="btn-accent"
                    style={{ flex: 2, padding: "0.85rem", fontSize: "0.875rem" }}
                    onClick={() => selectedTemplate && setStep(3)}
                    disabled={!selectedTemplate}
                  >
                    Generate →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Generating */}
            {mode === "create" && step === 3 && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div className="glass-card" style={{ padding: "2rem", textAlign: "center" }}>
                  <p style={{ fontSize: "0.75rem", color: "#5a5755", margin: "0 0 0.5rem", letterSpacing: "0.06em" }}>READY TO GENERATE</p>
                  <p style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: selectedTemplate?.accentColor || "var(--accent)" }}>
                    {selectedTemplate?.preview} {selectedTemplate?.name}
                  </p>
                  {generateStatus && (
                    <p style={{ marginTop: "1.25rem", fontSize: "0.85rem", color: generateStatus.startsWith("Error") ? "#f87171" : "#a09888" }}>
                      {generateStatus}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button className="btn-ghost" style={{ flex: 1, padding: "0.85rem", fontSize: "0.875rem" }} onClick={() => setStep(2)}>← Back</button>
                  <button
                    className="btn-accent"
                    style={{ flex: 2, padding: "0.85rem", fontSize: "0.875rem" }}
                    onClick={handleGenerate}
                    disabled={generating}
                  >
                    {generating ? "✦ Generating..." : "✦ Generate"}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Export */}
            {mode === "create" && step === 4 && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

                {/* Canvas preview */}
                <div className="glass-card" style={{ overflow: "hidden" }}>
                  <div style={{ background: "#030304", display: "flex", alignItems: "center", justifyContent: "center", maxHeight: 420 }}>
                    <canvas
                      ref={canvasRef}
                      width={1080}
                      height={1920}
                      style={{ width: "auto", height: "100%", maxHeight: 420 }}
                    />
                  </div>

                  {/* Export controls */}
                  <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>

                    {/* Text overlay toggle */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "0.85rem", borderBottom: "1px solid var(--border)" }}>
                      <div>
                        <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "#a09888" }}>Text on video</p>
                        <p style={{ margin: "0.15rem 0 0", fontSize: "0.68rem", color: "#4a4745" }}>
                          {showTextOverlay ? "Shows hook text — or turn off to add text natively in TikTok" : "Clean background — add text in TikTok/Reels editor"}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowTextOverlay((v) => !v)}
                        style={{
                          width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                          background: showTextOverlay ? "var(--accent)" : "rgba(255,255,255,0.1)",
                          position: "relative", transition: "background 0.2s", flexShrink: 0,
                        }}
                      >
                        <span style={{
                          position: "absolute", top: 3, left: showTextOverlay ? 23 : 3,
                          width: 18, height: 18, borderRadius: "50%",
                          background: showTextOverlay ? "#0a0806" : "#6b6568",
                          transition: "left 0.2s",
                        }} />
                      </button>
                    </div>

                    {/* Voice row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", paddingBottom: "0.85rem", borderBottom: "1px solid var(--border)" }}>
                      <select
                        className="input-base"
                        style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", flex: "0 0 auto", width: "auto" }}
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                      >
                        {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                      </select>
                      {voiceBuffer ? (
                        <button
                          className="btn-ghost"
                          style={{ flex: 1, padding: "0.5rem 1rem", fontSize: "0.8rem" }}
                          onClick={previewVoice}
                        >
                          ▶ Preview Narration
                        </button>
                      ) : (
                        <span style={{ flex: 1, fontSize: "0.75rem", color: "#4a4745" }}>
                          {voiceStatus || "No narration"}
                        </span>
                      )}
                    </div>

                    {/* Export buttons */}
                    <div style={{ display: "flex", gap: "0.65rem" }}>
                      <button
                        className="btn-ghost"
                        style={{ flex: 1, padding: "0.75rem", fontSize: "0.85rem" }}
                        onClick={downloadPNG}
                      >
                        ↓ PNG
                      </button>
                      <button
                        className="btn-accent"
                        style={{ flex: 2, padding: "0.75rem", fontSize: "0.85rem" }}
                        onClick={exportVideo}
                      >
                        {voiceBuffer ? "↓ Video + Voice" : "↓ Video"}
                      </button>
                    </div>

                    {/* Progress */}
                    {exportProgress > 0 && (
                      <div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${exportProgress}%` }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.4rem" }}>
                          <span style={{ fontSize: "0.7rem", color: "#5a5755" }}>{exportStatus}</span>
                          <span style={{ fontSize: "0.7rem", color: "#5a5755" }}>{exportProgress}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Generated content */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  {hook && (
                    <div className="glass-card" style={{ padding: "1rem", borderColor: "var(--accent-border)" }}>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.65rem", fontWeight: 700, ...accentStyle, letterSpacing: "0.08em" }}>HOOK</p>
                      <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", fontWeight: 600, lineHeight: 1.5, color: "#e8e0d0" }}>{hook}</p>
                      <button
                        style={{ background: "none", border: "none", padding: 0, fontSize: "0.7rem", color: "#5a5755", cursor: "pointer" }}
                        onClick={() => navigator.clipboard.writeText(hook)}
                      >
                        Copy
                      </button>
                    </div>
                  )}
                  {caption && (
                    <div className="glass-card" style={{ padding: "1rem" }}>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.65rem", fontWeight: 700, color: "#6b6568", letterSpacing: "0.08em" }}>CAPTION</p>
                      <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", lineHeight: 1.6, color: "#c0b8b0", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{caption}</p>
                      <button
                        style={{ background: "none", border: "none", padding: 0, fontSize: "0.7rem", color: "#5a5755", cursor: "pointer" }}
                        onClick={() => navigator.clipboard.writeText(caption)}
                      >
                        Copy
                      </button>
                    </div>
                  )}
                  {hashtags && (
                    <div className="glass-card" style={{ padding: "1rem", gridColumn: "1 / -1" }}>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.65rem", fontWeight: 700, color: "#6b6568", letterSpacing: "0.08em" }}>HASHTAGS</p>
                      <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", color: "#a09888", lineHeight: 1.7 }}>{hashtags}</p>
                      <button
                        style={{ background: "none", border: "none", padding: 0, fontSize: "0.7rem", color: "#5a5755", cursor: "pointer" }}
                        onClick={() => navigator.clipboard.writeText(hashtags)}
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button className="btn-ghost" style={{ flex: 1, padding: "0.85rem", fontSize: "0.875rem" }} onClick={resetAll}>New Project</button>
                  <button className="btn-ghost" style={{ flex: 1, padding: "0.85rem", fontSize: "0.875rem" }} onClick={() => setStep(3)}>Regenerate</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Sidebar ── */}
          <aside style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0 }}>

            {/* JARVIS status */}
            <div className="glass-card" style={{ padding: "1.1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
                <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a09888", letterSpacing: "0.04em" }}>JARVIS</span>
              </div>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b6568", lineHeight: 1.55 }}>
                {step === 1 ? "Ready. Drop an idea above or write your own message."
                  : step === 2 ? "Choose your visual style and motion settings."
                  : step === 3 ? generating ? "Generating your content..." : "Hit generate when ready."
                  : "Content ready. Export or regenerate."}
              </p>
            </div>

            {/* Stats */}
            <div className="glass-card" style={{ padding: "1.1rem" }}>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.65rem", fontWeight: 700, color: "#4a4745", letterSpacing: "0.08em" }}>SESSION</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "0.78rem", color: "#6b6568" }}>Generated</span>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, ...accentStyle }}>{activityLog.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.78rem", color: "#6b6568" }}>Success</span>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#4ade80" }}>
                  {activityLog.length === 0 ? "—"
                    : Math.round((activityLog.filter((i) => i.status === "success").length / activityLog.length) * 100) + "%"}
                </span>
              </div>
            </div>

            {/* Activity log */}
            <div className="glass-card" style={{ padding: "1.1rem" }}>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.65rem", fontWeight: 700, color: "#4a4745", letterSpacing: "0.08em" }}>ACTIVITY</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: 220, overflowY: "auto" }}>
                {activityLog.length === 0 ? (
                  <p style={{ fontSize: "0.75rem", color: "#3a3735", fontStyle: "italic", margin: 0 }}>No activity yet</p>
                ) : (
                  activityLog.map((entry) => (
                    <div key={entry.id} style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      padding: "0.4rem 0.6rem", borderRadius: 8,
                      background: entry.status === "success" ? "rgba(74,222,128,0.05)" : "rgba(248,113,113,0.05)",
                      border: `1px solid ${entry.status === "success" ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)"}`,
                    }}>
                      <span style={{ fontSize: "0.7rem", fontWeight: 700, color: entry.status === "success" ? "#4ade80" : "#f87171", flexShrink: 0 }}>
                        {entry.status === "success" ? "✓" : "✕"}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: "0.72rem", color: "#a09888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.template}</p>
                        <p style={{ margin: 0, fontSize: "0.65rem", color: "#4a4745" }}>{entry.timestamp}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Duration reminder */}
            {step >= 1 && (
              <div className="glass-card" style={{ padding: "1rem" }}>
                <p style={{ margin: "0 0 0.3rem", fontSize: "0.65rem", fontWeight: 700, color: "#4a4745", letterSpacing: "0.08em" }}>CLIP LENGTH</p>
                <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, ...accentStyle, letterSpacing: "-0.02em" }}>
                  {clipDuration >= 60 ? "1 min" : `${clipDuration}s`}
                </p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.68rem", color: "#4a4745" }}>
                  {clipDuration <= 15 ? "Punchy — great for hooks" : clipDuration <= 30 ? "Balanced — story + hook" : "Long form — full impact"}
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
