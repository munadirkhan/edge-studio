import { useState, useRef, useEffect } from "react";
import { TEMPLATES } from "./templates";
import ClipStudio from "./ClipStudio";
import { useAuth } from "./contexts/AuthContext";
import { supabase } from "./lib/supabase";
import Sidebar from "./components/Sidebar";
import ProjectsPage from "./components/ProjectsPage";
import { TermsModal, PrivacyModal } from "./components/TermsModal";
import { useToast } from "./components/Toast";
import { useProfile } from "./hooks/useProfile";
import PaywallModal from "./components/PaywallModal";

// ─── Utilities ────────────────────────────────────────────────────────────────


async function parseApiResponse(response, fallbackMessage) {
  const text = await response.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch {
      const preview = text.slice(0, 120).replace(/\s+/g, " ");
      throw new Error(`${fallbackMessage} — server returned: ${preview}`);
    }
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
  { label: "8s",    value: 8,  desc: "Hook"   },
  { label: "15s",   value: 15, desc: "Short"  },
  { label: "30s",   value: 30, desc: "Reel"   },
  { label: "45s",   value: 45, desc: "Story"  },
  { label: "1 min", value: 60, desc: "Long"   },
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
  { id: "nova",    label: "Nova",    desc: "calm · clear · focused"    },
  { id: "shimmer", label: "Shimmer", desc: "soft · warm · soothing"    },
  { id: "echo",    label: "Echo",    desc: "smooth · measured · gentle" },
  { id: "fable",   label: "Fable",   desc: "British · rich · narrative" },
  { id: "onyx",    label: "Onyx",    desc: "deep · powerful · US"      },
  { id: "alloy",   label: "Alloy",   desc: "neutral · clean · balanced" },
];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, session } = useAuth();
  const toast = useToast();
  const { exportsUsed, exportsLeft, isPro, refetch: refetchProfile } = useProfile();
  const [showPaywall, setShowPaywall] = useState(false);
  const [showTerms,   setShowTerms]   = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [mousePos, setMousePos]       = useState({ x: -1000, y: -1000 });

  useEffect(() => {
    const onMove = (e) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Handle Stripe success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "true") {
      toast.success("You're on Pro! Unlimited exports unlocked.");
      refetchProfile();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Top-level mode — null = landing page
  const [mode, setMode] = useState(null); // null | "create" | "clip"

  // Step flow
  const [step, setStep] = useState(1);

  // Step 1: content input
  const [userMessage, setUserMessage]   = useState("");
  const [jarvisIdea, setJarvisIdea]     = useState("");
  const [jarvisBusy, setJarvisBusy]     = useState(false);
  const [jarvisError, setJarvisError]   = useState("");
  const [clipDuration, setClipDuration] = useState(15);

  // Step 2: style
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [motionEffect, setMotionEffect]         = useState("zoom");
  const [motionIntensity, setMotionIntensity]   = useState("cinematic");
  const [selectedVoice, setSelectedVoice]       = useState("nova");

  // Generation
  const [generating, setGenerating]         = useState(false);
  const [generateStatus, setGenerateStatus] = useState("");
  const [bgImageEl, setBgImageEl]           = useState(null);

  // Generated content
  const [hook, setHook]         = useState("");
  const [showTextOverlay, setShowTextOverlay] = useState(true);
  const [caption, setCaption]   = useState("");
  const [hashtags, setHashtags] = useState("");

  // Voice narration
  const [voiceBuffer, setVoiceBuffer]         = useState(null);
  const [voiceStatus, setVoiceStatus]         = useState("");
  const [narrationScript, setNarrationScript] = useState("");

  // Export
  const [exportStatus, setExportStatus]     = useState("");
  const [exportProgress, setExportProgress] = useState(0);

  // Cloud save
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  // Activity log
  const [activityLog, setActivityLog] = useState([]);

  const canvasRef = useRef(null);

  // ─── Canvas ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (step >= 3 && selectedTemplate && bgImageEl) drawCanvasFrame();
  }, [step, selectedTemplate, bgImageEl, userMessage, hook, motionEffect, motionIntensity, showTextOverlay]);

  function drawCanvasFrame(elapsedMs = 0, durationMs = 0, captionWords = null) {
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

    // ── Text overlay ──────────────────────────────────────────────
    if (showTextOverlay) {
      ctx.textAlign = "center";

      if (captionWords && captionWords.length > 0 && durationMs > 0) {
        // ── Phrase-by-phrase synced captions (subtitle style) ──
        const WORDS_PER_LINE = 4;
        const lines = [];
        for (let i = 0; i < captionWords.length; i += WORDS_PER_LINE) {
          lines.push(captionWords.slice(i, i + WORDS_PER_LINE).join(" "));
        }
        const msPerLine  = durationMs / lines.length;
        const lineIdx    = Math.min(Math.floor(elapsedMs / msPerLine), lines.length - 1);
        const phrase     = lines[lineIdx] || "";

        const fontSize   = 58;
        const capY       = H * 0.80; // lower-third position

        // Pill background for readability
        ctx.font = `800 ${fontSize}px 'Arial Black', 'Impact', sans-serif`;
        const textW = ctx.measureText(phrase.toUpperCase()).width;
        const padX = 28, padY = 14;
        const pillX = W / 2 - textW / 2 - padX;
        const pillY = capY - fontSize * 0.82 - padY;
        const pillW = textW + padX * 2;
        const pillH = fontSize + padY * 2;
        const r = 12;

        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, r);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Text stroke + fill
        ctx.font = `800 ${fontSize}px 'Arial Black', 'Impact', sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.lineJoin = "round";
        ctx.strokeText(phrase.toUpperCase(), W / 2, capY);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur  = 6;
        ctx.fillText(phrase.toUpperCase(), W / 2, capY);
        ctx.shadowBlur  = 0;

      } else {
        // ── Static hook preview (non-export mode) ──
        const displayText = hook || userMessage || "Your message here";
        const words = displayText.split(" ");
        const fontSize   = words.length <= 4 ? 120 : words.length <= 7 ? 96 : 78;
        const lineHeight = fontSize * 1.22;
        const maxWidth   = W - 160;

        ctx.font = `900 ${fontSize}px 'Arial Black', 'Impact', sans-serif`;
        let tempLine = "", lines = [];
        for (const w of words) {
          const test = tempLine + w + " ";
          if (ctx.measureText(test).width > maxWidth && tempLine) {
            lines.push(tempLine.trim()); tempLine = w + " ";
          } else { tempLine = test; }
        }
        lines.push(tempLine.trim());

        const totalH = lines.length * lineHeight;
        const startY = H * 0.5 - totalH / 2 + fontSize * 0.78;

        lines.forEach((line, i) => {
          const y = startY + i * lineHeight;
          ctx.font        = `900 ${fontSize}px 'Arial Black', 'Impact', sans-serif`;
          ctx.lineWidth   = 12;
          ctx.strokeStyle = "rgba(0,0,0,0.95)";
          ctx.lineJoin    = "round";
          ctx.strokeText(line.toUpperCase(), W / 2, y);
          ctx.fillStyle   = "#ffffff";
          ctx.shadowColor = "rgba(0,0,0,0.7)";
          ctx.shadowBlur  = 16;
          ctx.fillText(line.toUpperCase(), W / 2, y);
          ctx.shadowBlur  = 0;
        });
      }
    }

    // ── EdgeStudio watermark (free users only) ────────────────
    if (!isPro) {
      const stampY = H - 80;
      ctx.save();
      ctx.translate(W / 2, stampY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = T.accentColor;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 14px 'Inter', -apple-system, sans-serif";
      ctx.letterSpacing = "0.12em";
      ctx.textAlign = "center";
      ctx.fillText("EdgeStudio", W / 2, stampY + 28);
      ctx.globalAlpha = 1;
      ctx.letterSpacing = "0em";
    }
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
    setJarvisError("");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch("/api/jarvis-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: jarvisIdea }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await parseApiResponse(res, "JARVIS failed");
      if (data.message) {
        setUserMessage(data.message);
      } else {
        setJarvisError("No response — check that OPENAI_API_KEY is set in Railway");
      }
    } catch (err) {
      if (err.name === "AbortError") {
        setJarvisError("Request timed out — Railway server may be sleeping, try again");
      } else {
        setJarvisError(err.message || "JARVIS failed");
      }
      console.error("JARVIS suggest error:", err);
    } finally {
      setJarvisBusy(false);
    }
  }

  // ─── Save to account ─────────────────────────────────────────────────────────

  async function saveToAccount() {
    if (!user || saving || !canvasRef.current) return;
    setSaving(true);
    try {
      const projectId = crypto.randomUUID();

      // Capture a 35%-scale JPEG thumbnail from the current canvas frame
      const thumb = document.createElement("canvas");
      thumb.width  = Math.round(canvasRef.current.width  * 0.35);
      thumb.height = Math.round(canvasRef.current.height * 0.35);
      thumb.getContext("2d").drawImage(canvasRef.current, 0, 0, thumb.width, thumb.height);
      const imageBlob = await new Promise(res => thumb.toBlob(res, "image/jpeg", 0.82));

      // Upload thumbnail to Supabase Storage
      const imgPath = `${user.id}/${projectId}/thumb.jpg`;
      const { error: imgErr } = await supabase.storage
        .from("project-assets")
        .upload(imgPath, imageBlob, { contentType: "image/jpeg", upsert: true });
      if (imgErr) throw new Error("Image upload failed: " + imgErr.message);
      const { data: { publicUrl: imageUrl } } = supabase.storage
        .from("project-assets").getPublicUrl(imgPath);

      // Upload audio if available
      let audioUrl = null;
      if (voiceBuffer) {
        const audioPath = `${user.id}/${projectId}/audio.mp3`;
        const audioBlob = new Blob([voiceBuffer], { type: "audio/mpeg" });
        await supabase.storage
          .from("project-assets")
          .upload(audioPath, audioBlob, { contentType: "audio/mpeg", upsert: true });
        const { data: { publicUrl } } = supabase.storage
          .from("project-assets").getPublicUrl(audioPath);
        audioUrl = publicUrl;
      }

      // Insert project row
      const { error: dbErr } = await supabase.from("projects").insert({
        id:              projectId,
        user_id:         user.id,
        hook:            hook || "",
        caption:         caption || "",
        hashtags:        hashtags || "",
        message:         userMessage || "",
        template_id:     selectedTemplate?.id   || "",
        template_name:   selectedTemplate?.name || "",
        duration:        clipDuration,
        voice:           selectedVoice,
        narration_script: narrationScript || "",
        image_url:       imageUrl,
        audio_url:       audioUrl,
      });
      if (dbErr) throw new Error(dbErr.message);
      setSaved(true);
      toast.success("Project saved to your account.");
    } catch (err) {
      toast.error("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── Main generation flow ─────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!selectedTemplate || !userMessage.trim()) return;

    setGenerating(true);
    setBgImageEl(null);
    setCaption("");
    setHook("");
    setHashtags("");
    setVoiceBuffer(null);
    setVoiceStatus("");
    setGenerateStatus("");
    setSaved(false);

    try {
      const [imgData, capData] = await Promise.all([
        generateImage(selectedTemplate.id),
        generateCaption(),
      ]);

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
        const script = await generateNarrationScript(userMessage, hookText).catch(() => hookText);
        setNarrationScript(script);
        setGenerateStatus("Generating narration audio...");
        await generateVoice(script).catch((err) => {
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
    link.download = "edge-studio.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function exportVideo() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Paywall gate ──────────────────────────────────────────────
    if (!user) {
      toast.error("Sign in to export your video.");
      return;
    }
    if (!isPro) {
      try {
        const res = await fetch("/api/exports/use", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`,
          },
        });
        const data = await res.json();
        if (res.status === 403 && data.error === "limit_reached") {
          setShowPaywall(true);
          return;
        }
        if (!res.ok) throw new Error(data.error || "Export check failed");
        refetchProfile();
      } catch (err) {
        toast.error(err.message);
        return;
      }
    }

    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) =>
      MediaRecorder.isTypeSupported(m)
    );
    if (!mimeType) { toast.error("Video export requires Chrome or Edge."); return; }

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
      a.download = "edge-studio.webm";
      a.click();
      setExportStatus("Done");
      setExportProgress(100);
    };

    recorder.start();
    audioSource?.start(0);
    setExportStatus("Recording...");

    const captionWords = (narrationScript || hook || "").split(/\s+/).filter(Boolean);
    const startTime = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      setExportProgress(Math.min(99, Math.round((elapsed / durationMs) * 100)));
      drawCanvasFrame(elapsed, durationMs, captionWords);
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
    setCaption("");
    setHook("");
    setHashtags("");
    setVoiceBuffer(null);
    setVoiceStatus("");
    setNarrationScript("");
    setGenerateStatus("");
    setExportStatus("");
    setExportProgress(0);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const accentStyle = { color: "var(--accent)" };

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%", background: "#060609" }}>

      {/* ── Sidebar ── */}
      <Sidebar mode={mode} setMode={setMode} isMobile={isMobile} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── Page content ── */}
      <div className="app-main" style={{ flex: 1, minWidth: 0, overflowY: "auto", position: "relative", display: "flex", flexDirection: "column" }}>

        {/* Mobile header */}
        <header className="mobile-header" style={{ display: isMobile ? "flex" : "none" }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ background: "none", border: "none", color: "#9a9490", cursor: "pointer", fontSize: "1.1rem", padding: "0.5rem", lineHeight: 1 }}
          >☰</button>
          <span style={{ fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.03em" }}>
            <span style={{ color: "var(--accent)" }}>Edge</span>
            <span style={{ color: "#f0ede8" }}>Studio</span>
          </span>
          <div style={{ width: 32 }} />
        </header>

        {/* Ambient glow */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
          <div style={{ position: "absolute", top: "-20%", right: "-10%", width: 600, height: 600, background: "radial-gradient(circle, rgba(201,169,110,0.04) 0%, transparent 70%)", borderRadius: "50%" }} />
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>

        {showTerms   && <TermsModal   onClose={() => setShowTerms(false)} />}
        {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
        {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} exportsUsed={exportsUsed} />}

        {/* ══ LANDING PAGE ══ */}
        {!mode && (
          <div style={{ overflowX: "hidden" }}>

            {/* Cursor spotlight */}
            <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, background: `radial-gradient(500px at ${mousePos.x}px ${mousePos.y}px, rgba(201,169,110,0.055), transparent 70%)` }} />

            {/* ── Hero ─────────────────────────────────────────────────── */}
            <div style={{ minHeight: "94vh", display: "grid", placeItems: "center", padding: "6rem 2rem 4rem", position: "relative" }}>

              {/* Dot grid */}
              <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)", backgroundSize: "26px 26px", pointerEvents: "none", maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)" }} />

              {/* Orbs */}
              <div style={{ position: "absolute", top: "5%", left: "10%", width: 560, height: 560, background: "radial-gradient(circle, rgba(201,169,110,0.08) 0%, transparent 65%)", borderRadius: "50%", pointerEvents: "none", animation: "float 8s ease-in-out infinite" }} />
              <div style={{ position: "absolute", bottom: "15%", right: "5%", width: 440, height: 440, background: "radial-gradient(circle, rgba(120,100,255,0.05) 0%, transparent 65%)", borderRadius: "50%", pointerEvents: "none", animation: "float 10s ease-in-out infinite reverse" }} />

              <div style={{ textAlign: "center", width: "100%", maxWidth: 860, position: "relative", zIndex: 1 }}>

                {/* Live badge */}
                <div className="fade-in" style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem", background: "rgba(201,169,110,0.07)", border: "1px solid var(--accent-border)", borderRadius: 24, padding: "0.38rem 1.1rem", marginBottom: "2rem", backdropFilter: "blur(8px)" }}>
                  <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.07em" }}>
                    10,000+ videos generated
                  </span>
                </div>

                {/* Headline */}
                <h1 style={{ margin: "0 0 1.5rem", fontSize: "clamp(3rem, 8vw, 6.5rem)", fontWeight: 800, letterSpacing: "-0.055em", lineHeight: 0.92, color: "#f0ede8" }}>
                  <span style={{ display: "block" }}>Create viral content</span>
                  <span style={{ display: "block", background: "linear-gradient(135deg, #c9a96e 0%, #f0d898 45%, #c9a96e 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                    in seconds.
                  </span>
                </h1>

                <p style={{ margin: "0 auto 2.75rem", fontSize: "1.08rem", color: "#9a9490", maxWidth: 500, lineHeight: 1.7, letterSpacing: "-0.01em" }}>
                  JARVIS AI turns any idea into a cinematic short — or clips your best moments from any YouTube video. TikTok-ready, Reels-ready, Shorts-ready.
                </p>

                {/* CTAs */}
                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "2.5rem" }}>
                  <button className="cta-primary" onClick={() => setMode("create")}>
                    <span style={{ fontSize: "1rem" }}>✦</span> Create with AI
                  </button>
                  <button className="cta-secondary" onClick={() => setMode("clip")}>
                    <span style={{ fontSize: "1rem" }}>✂</span> Clip a Video
                  </button>
                </div>

                {/* Platform pills */}
                <div style={{ display: "flex", gap: "0.45rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                  {["TikTok", "Instagram Reels", "YouTube Shorts", "Twitter / X"].map(p => (
                    <span key={p} style={{ fontSize: "0.68rem", fontWeight: 600, padding: "0.28rem 0.7rem", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#6e6a66", letterSpacing: "0.02em" }}>{p}</span>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: "0.7rem", color: "#4e4b48" }}>Free during beta · No credit card required</p>
              </div>
            </div>

            {/* ── Stats strip ──────────────────────────────────────────── */}
            <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.015)", backdropFilter: "blur(12px)" }}>
              <div style={{ maxWidth: 1000, margin: "0 auto", padding: "1.75rem 2rem", display: "flex", justifyContent: "space-around", gap: "1rem", flexWrap: "wrap" }}>
                {[
                  { value: "10,000+", label: "Videos generated" },
                  { value: "GPT-4o", label: "Intelligence" },
                  { value: "DALL-E 3", label: "Image model" },
                  { value: "Whisper", label: "Transcription" },
                  { value: "9:16", label: "Always vertical" },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #c9a96e, #f0d898)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{s.value}</div>
                    <div style={{ fontSize: "0.65rem", color: "#5a5755", fontWeight: 500, marginTop: "0.15rem" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Features ─────────────────────────────────────────────── */}
            <div style={{ padding: "6rem 1.5rem" }}>
              <div style={{ maxWidth: 1100, margin: "0 auto" }}>
                <div style={{ textAlign: "center", marginBottom: "4rem" }}>
                  <p style={{ margin: "0 0 0.6rem", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", color: "var(--accent)" }}>CAPABILITIES</p>
                  <h2 style={{ margin: 0, fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 800, letterSpacing: "-0.04em", color: "#f0ede8", lineHeight: 1.1 }}>
                    Everything you need to go viral
                  </h2>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1px", background: "var(--border)", borderRadius: 20, overflow: "hidden", border: "1px solid var(--border)" }}>
                  {[
                    { icon: "✦", color: "#c9a96e", bg: "rgba(201,169,110,0.08)", title: "AI Video Creator", desc: "JARVIS generates a cinematic AI background, writes your voiceover script, and records it with a deep AI voice. One prompt, one click." },
                    { icon: "✂", color: "#60a5fa", bg: "rgba(96,165,250,0.08)", title: "YouTube → Shorts", desc: "Paste any YouTube URL. EdgeStudio downloads, transcribes, and finds your most engaging moments automatically." },
                    { icon: "⚡", color: "#4ade80", bg: "rgba(74,222,128,0.08)", title: "Viral Score Engine", desc: "Every clip is scored 0-100 using GPT-4o — emotional hooks, surprise factor, shareability, and pacing all analyzed." },
                    { icon: "T", color: "#a78bfa", bg: "rgba(167,139,250,0.08)", title: "Synced Captions", desc: "Whisper AI transcribes with word-level precision. Captions animate in sync with speech — no editing required." },
                    { icon: "◉", color: "#f472b6", bg: "rgba(244,114,182,0.08)", title: "6 AI Voices", desc: "Choose from Onyx, Nova, Echo, Fable, Shimmer, or Alloy. JARVIS writes the script and delivers it at the perfect pace." },
                    { icon: "▯", color: "#fb923c", bg: "rgba(251,146,60,0.08)", title: "Caption Studio", desc: "Full caption editor with word highlighting, custom fonts, box effects, and real-time canvas preview before export." },
                  ].map((f, i) => (
                    <div
                      key={f.title}
                      className="feature-card"
                      style={{ "--card-hover-bg": f.bg }}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: f.bg, border: `1px solid ${f.color}22`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem", fontSize: "1.1rem", color: f.color, fontWeight: 800 }}>{f.icon}</div>
                      <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem", fontWeight: 700, color: "#f0ede8", letterSpacing: "-0.01em" }}>{f.title}</h3>
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "#6e6a66", lineHeight: 1.65 }}>{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── How it works ─────────────────────────────────────────── */}
            <div style={{ padding: "2rem 1.5rem 6rem" }}>
              <div style={{ maxWidth: 760, margin: "0 auto" }}>
                <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
                  <p style={{ margin: "0 0 0.6rem", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", color: "var(--accent)" }}>WORKFLOW</p>
                  <h2 style={{ margin: 0, fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 800, letterSpacing: "-0.04em", color: "#f0ede8", lineHeight: 1.1 }}>
                    Three steps to a short
                  </h2>
                </div>
                {[
                  { n: "01", title: "Input your content", desc: "Write a prompt and let JARVIS create from scratch — or paste any YouTube URL. Podcasts, interviews, vlogs, anything." },
                  { n: "02", title: "AI does the work", desc: "GPT-4o reads the transcript, scores each moment, and picks the most viral-worthy clips. DALL-E 3 generates visuals. Whisper burns captions." },
                  { n: "03", title: "Download and post", desc: "9:16 cropped, captioned, scored. Download your clips and upload directly to TikTok, Instagram Reels, or YouTube Shorts." },
                ].map((s, i) => (
                  <div key={s.n} style={{ display: "flex", gap: "2rem", padding: "2.25rem 0", borderBottom: i < 2 ? "1px solid var(--border)" : "none", alignItems: "flex-start" }}>
                    <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 14, background: "rgba(201,169,110,0.08)", border: "1px solid var(--accent-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--accent)", letterSpacing: "0.04em" }}>{s.n}</span>
                    </div>
                    <div>
                      <h3 style={{ margin: "0 0 0.45rem", fontSize: "1.05rem", fontWeight: 700, color: "#f0ede8", letterSpacing: "-0.02em" }}>{s.title}</h3>
                      <p style={{ margin: 0, fontSize: "0.875rem", color: "#7a7672", lineHeight: 1.65 }}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Powered by strip ─────────────────────────────────────── */}
            <div style={{ borderTop: "1px solid var(--border)", padding: "2rem 1.5rem" }}>
              <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", gap: "2.5rem", justifyContent: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", color: "#3a3735" }}>POWERED BY</span>
                {["GPT-4o", "DALL·E 3", "Whisper AI", "OpenAI TTS", "FFmpeg", "Supabase"].map(t => (
                  <span key={t} style={{ fontSize: "0.8rem", fontWeight: 700, color: "#4e4b48", letterSpacing: "-0.01em" }}>{t}</span>
                ))}
              </div>
            </div>

            {/* ── Final CTA ────────────────────────────────────────────── */}
            <div style={{ borderTop: "1px solid var(--border)", padding: "7rem 1.5rem", textAlign: "center", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, background: "radial-gradient(circle, rgba(201,169,110,0.07) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <p style={{ margin: "0 0 0.6rem", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", color: "var(--accent)" }}>GET STARTED</p>
                <h2 style={{ margin: "0 0 1rem", fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 800, letterSpacing: "-0.05em", color: "#f0ede8", lineHeight: 1.05 }}>
                  Start creating now.
                </h2>
                <p style={{ margin: "0 0 2.5rem", fontSize: "0.95rem", color: "#6e6a66" }}>Free during beta. No credit card. Takes 30 seconds.</p>
                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                  <button className="cta-primary" onClick={() => setMode("create")}>
                    ✦ Create with AI →
                  </button>
                  <button className="cta-secondary" onClick={() => setMode("clip")}>
                    ✂ Clip a Video
                  </button>
                </div>
                <div style={{ marginTop: "3rem", display: "flex", gap: "1.5rem", justifyContent: "center" }}>
                  <button onClick={() => setShowTerms(true)} style={{ background: "none", border: "none", color: "#3a3735", fontSize: "0.7rem", cursor: "pointer", fontFamily: "inherit" }}>Terms of Service</button>
                  <button onClick={() => setShowPrivacy(true)} style={{ background: "none", border: "none", color: "#3a3735", fontSize: "0.7rem", cursor: "pointer", fontFamily: "inherit" }}>Privacy Policy</button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ══ APP ══ */}
        {mode && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "1rem" : "2rem 1.5rem", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 280px", gap: "1.5rem" }}>

          {/* ── Content area ── */}
          <div style={{ minWidth: 0 }}>

            {/* CLIP MODE */}
            {mode === "clip" && <ClipStudio />}

            {/* PROJECTS MODE */}
            {mode === "projects" && <ProjectsPage />}

            {/* STEP 1: Message */}
            {mode === "create" && step === 1 && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

                {/* JARVIS idea box */}
                <div className="glass-card" style={{ padding: "1.25rem", borderColor: jarvisBusy ? "rgba(74,222,128,0.25)" : "var(--border)", boxShadow: jarvisBusy ? "0 0 0 1px rgba(74,222,128,0.1), 0 4px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)" : undefined, transition: "border-color 0.3s, box-shadow 0.3s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
                    <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: jarvisBusy ? "#4ade80" : "#4ade80", display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6e6a66", letterSpacing: "0.1em" }}>JARVIS AI</span>
                    <span style={{ marginLeft: "auto", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ade80", borderRadius: 5, padding: "0.15rem 0.45rem" }}>
                      {jarvisBusy ? "THINKING" : "ONLINE"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.6rem" }}>
                    <input
                      className="input-base"
                      style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}
                      placeholder="Describe your idea — discipline, sacrifice, mindset..."
                      value={jarvisIdea}
                      onChange={(e) => setJarvisIdea(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleJarvisSuggest()}
                    />
                    <button
                      className="btn-accent"
                      style={{ padding: "0.75rem 1.2rem", fontSize: "0.8rem", whiteSpace: "nowrap", flexShrink: 0 }}
                      onClick={handleJarvisSuggest}
                      disabled={!jarvisIdea.trim() || jarvisBusy}
                    >
                      {jarvisBusy ? "…" : "Fill →"}
                    </button>
                  </div>
                  {jarvisError ? (
                    <p style={{ margin: "0.55rem 0 0", fontSize: "0.7rem", color: "#f87171" }}>✕ {jarvisError}</p>
                  ) : (
                    <p style={{ margin: "0.55rem 0 0", fontSize: "0.7rem", color: "#6e6a66" }}>
                      {jarvisBusy ? "Crafting your message…" : "JARVIS will write your script — or type your own below."}
                    </p>
                  )}
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
                    <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: userMessage.length > 450 ? "#f87171" : "#4e4b48" }}>
                      {userMessage.length}<span style={{ color: "#3a3836" }}>/500</span>
                    </span>
                  </div>
                  <textarea
                    className="input-base"
                    style={{ padding: "0.85rem 1rem", fontSize: "0.9rem", resize: "none", lineHeight: 1.65 }}
                    rows={5}
                    maxLength={500}
                    placeholder="Write what you want your audience to feel, believe, or do..."
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                  />
                  {!userMessage && (
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.68rem", color: "#4e4b48" }}>
                      Pro tip: speak directly to the viewer — "You need to hear this..."
                    </p>
                  )}
                </div>

                {/* Duration picker */}
                <div className="glass-card" style={{ padding: "1.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: 8, background: "var(--surface-hover)",
                      border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.7rem", fontWeight: 700, color: "#6b6568", flexShrink: 0,
                    }}>2</span>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Video Duration</span>
                  </div>
                  <div className="duration-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
                    {DURATIONS.map((d) => {
                      const isActive = clipDuration === d.value;
                      return (
                        <button
                          key={d.value}
                          onClick={() => setClipDuration(d.value)}
                          style={{
                            padding: "0.7rem 0.25rem",
                            borderRadius: 10,
                            border: `1px solid ${isActive ? "var(--accent-border)" : "var(--border)"}`,
                            background: isActive ? "var(--accent-dim)" : "rgba(255,255,255,0.02)",
                            color: isActive ? "var(--accent)" : "#6b6568",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textAlign: "center",
                            transition: "all 0.15s",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "0.2rem",
                          }}
                        >
                          <span style={{ fontSize: "1rem", fontWeight: 800, letterSpacing: "-0.03em" }}>{d.label}</span>
                          <span style={{ fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.04em", opacity: 0.7 }}>{d.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  className="btn-accent"
                  style={{ width: "100%", padding: "1rem", fontSize: "0.95rem", fontWeight: 700, letterSpacing: "-0.01em", boxShadow: userMessage.trim() ? "0 4px 24px rgba(201,169,110,0.2)" : undefined }}
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
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: 8, background: "var(--accent-dim)",
                      border: "1px solid var(--accent-border)", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.7rem", fontWeight: 700, ...accentStyle, flexShrink: 0,
                    }}>3</span>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Visual Style</span>
                    {selectedTemplate && (
                      <span style={{ marginLeft: "auto", fontSize: "0.68rem", fontWeight: 600, color: "var(--accent)" }}>
                        {selectedTemplate.preview} {selectedTemplate.name}
                      </span>
                    )}
                  </div>
                  <div className="template-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.65rem" }}>
                    {TEMPLATES.map((t) => {
                      const isSel = selectedTemplate?.id === t.id;
                      return (
                        <div
                          key={t.id}
                          className={`template-card${isSel ? " selected" : ""}`}
                          style={{ background: isSel ? undefined : t.bg, padding: "1.1rem 0.6rem", gap: "0.55rem" }}
                          onClick={() => setSelectedTemplate(t)}
                        >
                          <span style={{ fontSize: 32 }}>{t.preview}</span>
                          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: isSel ? "var(--accent)" : t.textColor }}>
                            {t.name}
                          </span>
                          {isSel && (
                            <span style={{ fontSize: "0.6rem", ...accentStyle, fontWeight: 700, letterSpacing: "0.06em" }}>✓ SELECTED</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Motion + Voice row */}
                <div className="motion-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                  {[
                    { label: "Motion", icon: "4", items: MOTION_EFFECTS, value: motionEffect, setValue: setMotionEffect },
                    { label: "Intensity", icon: "5", items: MOTION_INTENSITIES, value: motionIntensity, setValue: setMotionIntensity },
                    {
                      label: "Voice",
                      icon: "6",
                      custom: (
                        <select
                          className="input-base"
                          style={{ padding: "0.55rem 0.75rem", fontSize: "0.8rem" }}
                          value={selectedVoice}
                          onChange={(e) => setSelectedVoice(e.target.value)}
                        >
                          {VOICES.map((v) => (
                            <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>
                          ))}
                        </select>
                      ),
                    },
                  ].map(({ label, icon, items, value, setValue, custom }) => (
                    <div key={label} className="glass-card" style={{ padding: "1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: 6, background: "var(--surface-hover)",
                          border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.6rem", fontWeight: 700, color: "#6b6568", flexShrink: 0,
                        }}>{icon}</span>
                        <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 700, color: "#6b6568", letterSpacing: "0.06em" }}>
                          {label.toUpperCase()}
                        </p>
                      </div>
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
                    onClick={() => { if (!selectedTemplate) return; setStep(3); handleGenerate(); }}
                    disabled={!selectedTemplate}
                  >
                    ✦ Generate Video →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Generating */}
            {mode === "create" && step === 3 && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div className="glass-card" style={{ padding: "2rem" }}>
                  {generating ? (
                    /* Animated generating state */
                    <div>
                      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                        <div className="generating-ring" />
                        <p style={{ margin: "1.25rem 0 0.25rem", fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
                          {generateStatus || "Starting…"}
                        </p>
                        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                          This takes 20–40 seconds
                        </p>
                      </div>
                      {/* Stage checklist */}
                      <div style={{ maxWidth: 340, margin: "0 auto" }}>
                        {[
                          { key: "Generating background image...", label: "Generating background image" },
                          { key: "Writing your content...",        label: "Writing hook & caption"       },
                          { key: "Writing narration script...",    label: "Writing narration script"     },
                          { key: "Generating narration audio...",  label: "Recording AI voice"           },
                        ].map(({ key, label }, i) => {
                          const stages = [
                            "Generating background image...",
                            "Writing your content...",
                            "Writing narration script...",
                            "Generating narration audio...",
                          ];
                          const currentIdx = stages.indexOf(generateStatus);
                          const isDone   = currentIdx > i || generateStatus === "Ready to export!";
                          const isActive = currentIdx === i;
                          return (
                            <div
                              key={key}
                              className="generating-stage-row"
                              style={{ opacity: isDone || isActive ? 1 : 0.35 }}
                            >
                              <div style={{
                                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                background: isDone ? "rgba(74,222,128,0.12)" : isActive ? "var(--accent-dim)" : "rgba(255,255,255,0.04)",
                                border: `1px solid ${isDone ? "rgba(74,222,128,0.35)" : isActive ? "var(--accent-border)" : "var(--border)"}`,
                                transition: "all 0.3s",
                              }}>
                                {isDone
                                  ? <span style={{ fontSize: "0.6rem", color: "#4ade80", fontWeight: 800 }}>✓</span>
                                  : isActive
                                    ? <span className="generating-stage-dot" />
                                    : null
                                }
                              </div>
                              <span style={{
                                fontSize: "0.82rem",
                                color: isDone ? "var(--text-tertiary)" : isActive ? "var(--text-primary)" : "var(--text-muted)",
                                fontWeight: isActive ? 600 : 400,
                              }}>
                                {label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : generateStatus?.startsWith("Error") ? (
                    /* Error state with retry */
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>✕</div>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.95rem", fontWeight: 600, color: "#f87171" }}>Generation failed</p>
                      <p style={{ margin: "0 0 1.5rem", fontSize: "0.82rem", color: "var(--text-tertiary)", lineHeight: 1.55 }}>
                        {generateStatus.replace("Error: ", "")}
                      </p>
                      <button
                        className="btn-accent"
                        style={{ padding: "0.75rem 2rem", fontSize: "0.875rem" }}
                        onClick={handleGenerate}
                      >
                        ↻ Try again
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  className="btn-ghost"
                  style={{ padding: "0.9rem", fontSize: "0.875rem" }}
                  onClick={() => !generating && setStep(2)}
                  disabled={generating}
                >
                  ← Back to style picker
                </button>
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
                        <p style={{ margin: "0.15rem 0 0", fontSize: "0.68rem", color: "#6e6a66" }}>
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
                        {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>)}
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
                        <span style={{ flex: 1, fontSize: "0.75rem", color: "#6e6a66" }}>
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
                        style={{ flex: 2, padding: "0.75rem", fontSize: "0.85rem", position: "relative" }}
                        onClick={exportVideo}
                      >
                        {voiceBuffer ? "↓ Video + Voice" : "↓ Video"}
                        {user && !isPro && (
                          <span style={{ position: "absolute", top: -7, right: -7, fontSize: "0.55rem", fontWeight: 800, background: exportsLeft === 0 ? "#f87171" : "#c9a96e", color: "#0a0806", borderRadius: 9, padding: "0.15rem 0.35rem", lineHeight: 1 }}>
                            {exportsLeft === 0 ? "0 left" : `${exportsLeft} left`}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Save to Account */}
                    {user ? (
                      <button
                        onClick={saveToAccount}
                        disabled={saving || saved}
                        style={{
                          width: "100%", padding: "0.75rem", fontSize: "0.85rem", fontWeight: 600,
                          borderRadius: 10, border: `1px solid ${saved ? "rgba(74,222,128,0.35)" : "var(--accent-border)"}`,
                          background: saved ? "rgba(74,222,128,0.08)" : "var(--accent-dim)",
                          color: saved ? "#4ade80" : "var(--accent)",
                          cursor: saving || saved ? "default" : "pointer",
                          fontFamily: "inherit", transition: "all 0.2s",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                        }}
                      >
                        {saving ? (
                          <><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(201,169,110,0.3)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite" }} /> Saving…</>
                        ) : saved ? (
                          <>✓ Saved to Account — view in Projects</>
                        ) : (
                          <>☁ Save to Account</>
                        )}
                      </button>
                    ) : (
                      <p style={{ margin: 0, fontSize: "0.72rem", color: "#5a5755", textAlign: "center" }}>
                        Sign in to save projects to your account
                      </p>
                    )}

                    {/* Progress */}
                    {exportProgress > 0 && (
                      <div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${exportProgress}%` }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.4rem" }}>
                          <span style={{ fontSize: "0.7rem", color: "#8a8480" }}>{exportStatus}</span>
                          <span style={{ fontSize: "0.7rem", color: "#8a8480" }}>{exportProgress}%</span>
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
                      <p style={{ margin: "0 0 0.85rem", fontSize: "0.85rem", fontWeight: 600, lineHeight: 1.5, color: "#e8e0d0" }}>{hook}</p>
                      <button
                        className="btn-ghost"
                        style={{ width: "100%", padding: "0.45rem 0.75rem", fontSize: "0.72rem", borderRadius: 8, fontFamily: "inherit" }}
                        onClick={() => navigator.clipboard.writeText(hook)}
                      >
                        Copy Hook
                      </button>
                    </div>
                  )}
                  {caption && (
                    <div className="glass-card" style={{ padding: "1rem" }}>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.65rem", fontWeight: 700, color: "#8a8480", letterSpacing: "0.08em" }}>CAPTION</p>
                      <p style={{ margin: "0 0 0.85rem", fontSize: "0.82rem", lineHeight: 1.6, color: "#c0b8b0", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{caption}</p>
                      <button
                        className="btn-ghost"
                        style={{ width: "100%", padding: "0.45rem 0.75rem", fontSize: "0.72rem", borderRadius: 8, fontFamily: "inherit" }}
                        onClick={() => navigator.clipboard.writeText(caption)}
                      >
                        Copy Caption
                      </button>
                    </div>
                  )}
                  {hashtags && (
                    <div className="glass-card" style={{ padding: "1rem", gridColumn: "1 / -1" }}>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.65rem", fontWeight: 700, color: "#8a8480", letterSpacing: "0.08em" }}>HASHTAGS</p>
                      <p style={{ margin: "0 0 0.85rem", fontSize: "0.82rem", color: "#a09888", lineHeight: 1.7 }}>{hashtags}</p>
                      <button
                        className="btn-ghost"
                        style={{ padding: "0.45rem 0.85rem", fontSize: "0.72rem", borderRadius: 8, fontFamily: "inherit" }}
                        onClick={() => navigator.clipboard.writeText(hashtags)}
                      >
                        Copy Hashtags
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
          <aside style={{ display: isMobile ? "none" : "flex", flexDirection: "column", gap: "1rem", minWidth: 0 }}>

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
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.65rem", fontWeight: 700, color: "#6e6a66", letterSpacing: "0.08em" }}>SESSION</p>
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
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.65rem", fontWeight: 700, color: "#6e6a66", letterSpacing: "0.08em" }}>ACTIVITY</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: 220, overflowY: "auto" }}>
                {activityLog.length === 0 ? (
                  <p style={{ fontSize: "0.75rem", color: "#6e6a66", margin: 0 }}>No activity yet</p>
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
                        <p style={{ margin: 0, fontSize: "0.65rem", color: "#6e6a66" }}>{entry.timestamp}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Duration reminder */}
            {step >= 1 && (
              <div className="glass-card" style={{ padding: "1rem" }}>
                <p style={{ margin: "0 0 0.3rem", fontSize: "0.65rem", fontWeight: 700, color: "#6e6a66", letterSpacing: "0.08em" }}>CLIP LENGTH</p>
                <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, ...accentStyle, letterSpacing: "-0.02em" }}>
                  {clipDuration >= 60 ? "1 min" : `${clipDuration}s`}
                </p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.68rem", color: "#6e6a66" }}>
                  {clipDuration <= 15 ? "Punchy — great for hooks" : clipDuration <= 30 ? "Balanced — story + hook" : "Long form — full impact"}
                </p>
              </div>
            )}
          </aside>
        </div>
        )}

        </div>
      </div>
    </div>
  );
}
