import { useState, useRef, useEffect } from "react";
import OpenAI from "openai";
import { TEMPLATES } from "./templates";

const browserOpenAI = import.meta.env.VITE_OPENAI_API_KEY
  ? new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true,
    })
  : null;

// Fallback prompts for DALL-E
const FALLBACK_PROMPTS = {
  night_sky: "Moody midnight scene with deep blue tones, cinematic lighting, dramatic atmosphere, no people",
  desert_dawn: "Golden sunrise with warm amber light, cinematic depth, inspirational atmosphere, no people",
  geometric: "Moody geometric neon pattern with cyan accents, cinematic lighting, modern texture, no people",
  garden: "Serene peaceful environment with golden sunlight, calming visualization, no people",
  architecture: "Grand cinematic interior with dramatic shadows, luxury modern design, no people",
};

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth && line !== "") {
      lines.push(line.trim());
      line = word + " ";
    } else {
      line = test;
    }
  }
  lines.push(line.trim());
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return lines.length;
}

async function parseApiResponse(response, fallbackMessage) {
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${fallbackMessage} (non-JSON response)`);
    }
  }
  if (!response.ok) {
    throw new Error(data.error || `${fallbackMessage} (${response.status})`);
  }
  return data;
}

function timeoutAfter(ms, label) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
}

async function fetchWithTimeout(url, ms, label) {
  return Promise.race([fetch(url), timeoutAfter(ms, label)]);
}

function generateLogEntry(templateName, status) {
  return {
    id: Date.now(),
    timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
    template: templateName,
    status,
    icon: status === "success" ? "✓" : status === "error" ? "✕" : "◐",
  };
}

export default function App() {
  // ================ STATE MANAGEMENT ================
  const [step, setStep] = useState(1);
  const [userMessage, setUserMessage] = useState("");
  const [reference, setReference] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [motionEffect, setMotionEffect] = useState("zoom");
  const [motionIntensity, setMotionIntensity] = useState("cinematic");

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState("");
  const [bgImageEl, setBgImageEl] = useState(null);
  const [rawGeneratedImage, setRawGeneratedImage] = useState("");
  const [imageDebug, setImageDebug] = useState("");

  // Generated content
  const [hook, setHook] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");

  // Video export
  const [exportStatus, setExportStatus] = useState("");
  const [exportProgress, setExportProgress] = useState(0);

  // Activity log
  const [activityLog, setActivityLog] = useState([]);

  const canvasRef = useRef(null);

  // ================ CANVAS RENDERING ================
  useEffect(() => {
    if (step >= 3 && selectedTemplate && bgImageEl) {
      drawCanvasFrame();
    }
  }, [step, selectedTemplate, bgImageEl, userMessage, reference, motionEffect, motionIntensity]);

  function drawCanvasFrame(elapsedMs = 0, durationMs = 0) {
    const canvas = canvasRef.current;
    if (!canvas || !selectedTemplate) return;

    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const T = selectedTemplate;
    const motionProgress = durationMs > 0 ? Math.max(0, Math.min(1, elapsedMs / durationMs)) : 0;
    const isCinematic = motionIntensity === "cinematic";

    // Draw background with motion
    if (bgImageEl) {
      let scale = 1;
      let offsetX = 0;
      let offsetY = 0;

      if (motionEffect === "zoom") {
        scale = 1 + (isCinematic ? 0.28 : 0.16) * motionProgress;
      } else if (motionEffect === "pan") {
        scale = isCinematic ? 1.14 : 1.08;
        offsetX = isCinematic ? -72 + 144 * motionProgress : -40 + 80 * motionProgress;
      } else if (motionEffect === "parallax") {
        const waveCycles = isCinematic ? 2.2 : 1.2;
        scale = isCinematic ? 1.18 : 1.12;
        offsetX = isCinematic ? -90 + 180 * motionProgress : -24 + 48 * motionProgress;
        offsetY = Math.sin(motionProgress * Math.PI * 2 * waveCycles) * (isCinematic ? 10 : 6);
      }

      const drawW = W * scale;
      const drawH = H * scale;
      const baseX = (W - drawW) / 2;
      const baseY = (H - drawH) / 2;
      ctx.drawImage(bgImageEl, baseX + offsetX, baseY + offsetY, drawW, drawH);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = T.bg;
      ctx.fillRect(0, 0, W, H);
    }

    // Title bar
    ctx.fillStyle = T.accentColor;
    ctx.fillRect(80, 120, W - 160, 4);
    ctx.font = "bold 48px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = T.textColor;
    ctx.fillText("EdgeStudio", W / 2, 90);

    // Main message
    ctx.fillStyle = T.textColor;
    ctx.font = "bold 72px 'Inter', sans-serif";
    ctx.textAlign = "center";
    const messageLineCount = wrapText(ctx, userMessage || "Your message here", W / 2, 320, W - 160, 90);

    // Divider
    const dividerY = 320 + messageLineCount * 90 + 40;
    ctx.fillStyle = T.accentColor;
    ctx.fillRect(W / 2 - 80, dividerY, 160, 3);

    // Reference text (if provided)
    if (reference) {
      ctx.fillStyle = T.textColor;
      ctx.font = "italic 48px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(reference, W / 2, dividerY + 120);
    }

    // Footer
    ctx.fillStyle = T.accentColor;
    ctx.fillRect(80, H - 200, W - 160, 4);
    ctx.fillStyle = T.textColor;
    ctx.font = "32px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Create · Share · Inspire", W / 2, H - 130);
    ctx.font = "24px 'Inter', sans-serif";
    ctx.fillText("EdgeStudio.app", W / 2, H - 60);
  }

  // ================ IMAGE GENERATION ================
  async function generateImageWithDiagnostics(templateId) {
    const prompt = FALLBACK_PROMPTS[templateId] || "Beautiful cinematic motivational background";
    const failures = [];

    // Try backend first
    try {
      setGenerateStatus("Generating via backend API...");
      const imgRes = await Promise.race([
        fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId }),
        }),
        timeoutAfter(90000, "Backend image"),
      ]);

      const imgData = await parseApiResponse(imgRes, "Backend image failed");
      if (imgData?.image) {
        return { image: imgData.image, source: "backend" };
      }
      failures.push("backend no image");
    } catch (err) {
      failures.push(`backend: ${err.message}`);
    }

    // Fallback to browser DALL-E
    if (!browserOpenAI) {
      throw new Error(`No OpenAI key. ${failures.join(" | ")}`);
    }

    try {
      setGenerateStatus("Generating via DALL-E 3...");
      const response = await Promise.race([
        browserOpenAI.images.generate({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: "1024x1792",
          quality: "standard",
          response_format: "b64_json",
        }),
        timeoutAfter(90000, "DALL-E 3"),
      ]);

      const b64 = response?.data?.[0]?.b64_json;
      if (b64) {
        return { image: `data:image/png;base64,${b64}`, source: "dall-e-3" };
      }
      failures.push("dall-e-3 no b64");
    } catch (err) {
      failures.push(`dall-e-3: ${err.message}`);
    }

    throw new Error(`Image generation failed. ${failures.join(" | ")}`);
  }

  // ================ CAPTION GENERATION ================
  async function generateCaption() {
    try {
      setGenerateStatus("Generating caption via API...");
      const res = await fetch("/api/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          translation: userMessage,
          quote: userMessage,
          reference: reference,
        }),
      });

      const data = await parseApiResponse(res, "Caption API failed");
      return data;
    } catch (err) {
      // Fallback
      if (!browserOpenAI) {
        throw new Error(`Caption generation failed: ${err.message}`);
      }

      setGenerateStatus("Generating caption via GPT-4o...");
      const completion = await browserOpenAI.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a social media expert for motivational creators. Write high-retention short-form content.",
          },
          {
            role: "user",
            content: `Message: "${userMessage}"\nReference: ${reference || "EdgeStudio"}\n\nReturn EXACTLY:\nHOOK: [punchy opening under 12 words]\nCAPTION: [2-3 sincere reflection sentences]\nHASHTAGS: [8 relevant hashtags]`,
          },
        ],
        max_tokens: 300,
      });

      const raw = completion.choices?.[0]?.message?.content || "";
      return {
        hook: raw.match(/HOOK:\s*(.+)/)?.[1]?.trim() || "",
        caption: raw.match(/CAPTION:\s*([\s\S]+?)(?=HASHTAGS:|$)/)?.[1]?.trim() || "",
        hashtags: raw.match(/HASHTAGS:\s*(.+)/)?.[1]?.trim() || "",
      };
    }
  }

  // ================ MAIN GENERATION FLOW ================
  async function handleGenerate() {
    if (!selectedTemplate || !userMessage.trim()) return;

    setGenerating(true);
    setBgImageEl(null);
    setRawGeneratedImage("");
    setImageDebug("");
    setCaption("");
    setHook("");
    setHashtags("");
    setGenerateStatus("");

    try {
      // Generate image
      setGenerateStatus("Generating background image...");
      const imgData = await generateImageWithDiagnostics(selectedTemplate.id);
      setRawGeneratedImage(imgData.image);
      setImageDebug(imgData.source);

      // Load image to canvas
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => setBgImageEl(img);
      img.src = imgData.image;

      // Generate caption
      setGenerateStatus("Generating social content...");
      const capData = await generateCaption();

      setHook(capData?.hook || "");
      setCaption(capData?.caption || "");
      setHashtags(capData?.hashtags || "");

      // Log success
      setActivityLog((prev) => [
        generateLogEntry(selectedTemplate.name, "success"),
        ...prev,
      ].slice(0, 10));

      setGenerateStatus("Ready to export!");
      setStep(4);
    } catch (err) {
      console.error(err);
      setGenerateStatus(`Error: ${err.message}`);

      // Log error
      setActivityLog((prev) => [
        generateLogEntry(selectedTemplate?.name || "Unknown", "error"),
        ...prev,
      ].slice(0, 10));
    } finally {
      setGenerating(false);
    }
  }

  // ================ EXPORT FUNCTIONS ================
  function downloadPNG() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "edgestudio.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function exportVideo() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) =>
      MediaRecorder.isTypeSupported(m)
    );

    if (!mimeType) {
      alert("Video export requires Chrome or Edge browser.");
      return;
    }

    setExportStatus("Preparing video...");
    setExportProgress(0);

    const durationMs = 8000; // 8 seconds
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "edgestudio.webm";
      a.click();
      setExportStatus("Export complete!");
      setExportProgress(100);
    };

    recorder.start();
    setExportStatus("Recording...");

    const startTime = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const percent = Math.min(99, Math.round((elapsed / durationMs) * 100));
      setExportProgress(percent);
      drawCanvasFrame(elapsed, durationMs);
    }, 33);

    setTimeout(() => {
      clearInterval(interval);
      recorder.stop();
    }, durationMs);
  }

  // ================ MOTION OPTIONS ================
  const MOTION_EFFECTS = [
    { id: "zoom", label: "Zoom" },
    { id: "pan", label: "Pan" },
    { id: "parallax", label: "Wave" },
    { id: "none", label: "Static" },
  ];

  const MOTION_INTENSITIES = [
    { id: "subtle", label: "Subtle" },
    { id: "cinematic", label: "Cinematic" },
  ];

  // ================ RENDER ================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-50 font-sans">
      {/* Accent gradient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-slate-700/50 backdrop-blur-sm sticky top-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">
                <span className="text-cyan-400">Edge</span>
                <span className="text-slate-100">Studio</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">AI-Powered Short-Form Creator</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold" style={{ color: selectedTemplate?.accentColor || "#00d4ff" }}>
                ⚡
              </div>
              <p className="text-xs text-slate-500">Phase 2: Prompt-Native</p>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

            {/* ================ MAIN CONTENT ================ */}
            <div className="lg:col-span-3 space-y-6">

              {/* STEP 1: Input */}
              {step === 1 && (
                <div className="space-y-6">
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="w-8 h-8 flex items-center justify-center bg-cyan-500/20 rounded-lg text-cyan-400 font-bold">1</span>
                      <h2 className="text-xl font-bold">Your Message</h2>
                    </div>
                    <textarea
                      className="w-full bg-slate-900/60 border border-slate-600/50 rounded-lg p-4 text-base resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/50 leading-relaxed"
                      rows={5}
                      placeholder="Enter your core message, quote, or motivation for this video..."
                      value={userMessage}
                      onChange={(e) => setUserMessage(e.target.value)}
                    />
                    <p className="text-xs text-slate-500 mt-2">Be specific and authentic for best results.</p>
                  </div>

                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="w-8 h-8 flex items-center justify-center bg-slate-700 rounded-lg text-slate-400 font-bold">+</span>
                      <h3 className="text-lg font-semibold">Reference (Optional)</h3>
                    </div>
                    <input
                      type="text"
                      className="w-full bg-slate-900/60 border border-slate-600/50 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      placeholder="e.g. 'Discipline Daily', 'Day 23' or leave blank"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={() => {
                      if (userMessage.trim()) setStep(2);
                    }}
                    disabled={!userMessage.trim()}
                    className="w-full bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-bold py-3 rounded-lg transition-colors"
                  >
                    Choose Template →
                  </button>
                </div>
              )}

              {/* STEP 2: Template Selection */}
              {step === 2 && (
                <div className="space-y-6">
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <h2 className="text-lg font-bold mb-4">Select a Visual Style</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {TEMPLATES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTemplate(t)}
                          className={`rounded-lg border-2 p-4 flex flex-col items-center gap-2 transition-all ${
                            selectedTemplate?.id === t.id
                              ? "border-cyan-500 shadow-lg shadow-cyan-500/20 bg-slate-700/50"
                              : "border-slate-600/30 hover:border-slate-500/50"
                          }`}
                          style={{ background: t.bg }}
                        >
                          <span style={{ fontSize: 28 }}>{t.preview}</span>
                          <span className="text-xs font-semibold text-slate-200">{t.name}</span>
                          {selectedTemplate?.id === t.id && (
                            <span className="text-xs bg-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded font-bold">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Motion</label>
                      <select
                        value={motionEffect}
                        onChange={(e) => setMotionEffect(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600/50 rounded text-sm p-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      >
                        {MOTION_EFFECTS.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Intensity</label>
                      <select
                        value={motionIntensity}
                        onChange={(e) => setMotionIntensity(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600/50 rounded text-sm p-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      >
                        {MOTION_INTENSITIES.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold py-3 rounded-lg transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={() => {
                        if (selectedTemplate) setStep(3);
                      }}
                      disabled={!selectedTemplate}
                      className="flex-1 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-slate-900 font-bold py-3 rounded-lg transition-colors"
                    >
                      Generate →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Generation Status */}
              {step === 3 && (
                <div className="space-y-6">
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 text-center">
                    <p className="text-sm text-slate-400 mb-2">Ready to Generate</p>
                    <p
                      className="text-xl font-bold"
                      style={{ color: selectedTemplate?.accentColor || "#00d4ff" }}
                    >
                      {selectedTemplate?.preview} {selectedTemplate?.name}
                    </p>
                  </div>

                  {generateStatus && (
                    <div
                      className={`rounded-lg p-4 text-sm ${
                        generateStatus.startsWith("Error")
                          ? "bg-red-950/50 border border-red-700/50 text-red-300"
                          : "bg-cyan-950/50 border border-cyan-700/50 text-cyan-300"
                      }`}
                    >
                      {generateStatus}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(2)}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold py-3 rounded-lg transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="flex-1 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-slate-900 font-bold py-3 rounded-lg transition-colors"
                    >
                      {generating ? "✦ Generating..." : "✦ Generate"}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Results */}
              {step === 4 && (
                <div className="space-y-6">
                  {/* Preview Canvas */}
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                    <div className="aspect-video md:aspect-auto flex items-center justify-center bg-slate-900 max-h-96">
                      <canvas
                        ref={canvasRef}
                        width={1080}
                        height={1920}
                        className="w-auto h-full max-h-96"
                      />
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex gap-2">
                        <button
                          onClick={downloadPNG}
                          className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold py-2 rounded transition-colors text-sm"
                        >
                          📥 PNG
                        </button>
                        <button
                          onClick={exportVideo}
                          className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-slate-900 font-bold py-2 rounded transition-colors text-sm"
                        >
                          🎬 Video
                        </button>
                      </div>
                      {exportProgress > 0 && (
                        <div className="space-y-1">
                          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-cyan-500 transition-all duration-300"
                              style={{ width: `${exportProgress}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>{exportStatus}</span>
                            <span>{exportProgress}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Generated Image */}
                  {rawGeneratedImage && (
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Background (DALL-E)</p>
                      <img
                        src={rawGeneratedImage}
                        alt="Generated background"
                        className="w-full rounded-lg border border-slate-600/50"
                      />
                      <p className="text-xs text-slate-500 mt-2">Source: {imageDebug || "pending"}</p>
                    </div>
                  )}

                  {/* Generated Content */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {hook && (
                      <div className="bg-cyan-950/40 border border-cyan-700/50 rounded-lg p-4">
                        <p className="text-xs font-bold text-cyan-400 uppercase tracking-wide mb-2">Hook</p>
                        <p className="text-sm text-cyan-100 font-semibold leading-snug mb-3">{hook}</p>
                        <button
                          onClick={() => navigator.clipboard.writeText(hook)}
                          className="text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    )}

                    {caption && (
                      <div className="bg-slate-700/40 border border-slate-600/50 rounded-lg p-4">
                        <p className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">Caption</p>
                        <p className="text-sm text-slate-200 leading-relaxed mb-3 line-clamp-4">{caption}</p>
                        <button
                          onClick={() => navigator.clipboard.writeText(caption)}
                          className="text-xs text-slate-400/70 hover:text-slate-300 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    )}

                    {hashtags && (
                      <div className="bg-slate-700/40 border border-slate-600/50 rounded-lg p-4 sm:col-span-2">
                        <p className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">Hashtags</p>
                        <p className="text-sm text-cyan-300 mb-3">{hashtags}</p>
                        <button
                          onClick={() => navigator.clipboard.writeText(hashtags)}
                          className="text-xs text-slate-400/70 hover:text-slate-300 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setStep(1);
                        setUserMessage("");
                        setReference("");
                        setSelectedTemplate(null);
                        setBgImageEl(null);
                        setRawGeneratedImage("");
                        setImageDebug("");
                        setCaption("");
                        setHook("");
                        setHashtags("");
                        setGenerateStatus("");
                        setExportStatus("");
                        setExportProgress(0);
                      }}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold py-3 rounded-lg transition-colors"
                    >
                      New Project
                    </button>
                    <button
                      onClick={() => setStep(3)}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold py-3 rounded-lg transition-colors"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ================ ACTIVITY SIDEBAR ================ */}
            <aside className="space-y-6">
              {/* Agent Status */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-sm font-bold">JARVIS Agent</p>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {step === 1
                    ? "Ready to analyze your message"
                    : step === 2
                    ? "Template selected"
                    : step === 3
                    ? generating
                      ? "Generating content..."
                      : "Ready to generate"
                    : "Content ready to export"}
                </p>
              </div>

              {/* Generation Stats */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Stats</p>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Content Generated</span>
                  <span className="text-cyan-300 font-bold">{activityLog.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Success Rate</span>
                  <span className="text-green-300 font-bold">
                    {activityLog.length === 0
                      ? "—"
                      : Math.round(
                          ((activityLog.filter((item) => item.status === "success").length / activityLog.length) *
                            100)
                        ) + "%"}
                  </span>
                </div>
              </div>

              {/* Activity Log */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Activity Log</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {activityLog.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No activity yet</p>
                  ) : (
                    activityLog.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-start gap-2 text-xs p-2 rounded ${
                          entry.status === "success"
                            ? "bg-green-950/30 border border-green-700/30"
                            : entry.status === "error"
                            ? "bg-red-950/30 border border-red-700/30"
                            : "bg-slate-700/30"
                        }`}
                      >
                        <span
                          className={`font-bold flex-shrink-0 ${
                            entry.status === "success"
                              ? "text-green-400"
                              : entry.status === "error"
                              ? "text-red-400"
                              : "text-slate-400"
                          }`}
                        >
                          {entry.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-300 truncate">{entry.template}</p>
                          <p className="text-slate-500">{entry.timestamp}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Quick Tips */}
              <div className="bg-cyan-950/30 border border-cyan-700/30 rounded-xl p-4">
                <p className="text-xs font-bold text-cyan-400 uppercase tracking-wide mb-2">✨ Tips</p>
                <ul className="text-xs text-slate-300 space-y-1">
                  <li>• Be specific with your message</li>
                  <li>• Use authentic language</li>
                  <li>• Cinematic for drama</li>
                  <li>• Subtle for minimalism</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}


