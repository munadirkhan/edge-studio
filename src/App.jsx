import { useState, useRef, useEffect } from "react";
import OpenAI from "openai";
import { TEMPLATES } from "./templates";

const browserOpenAI = import.meta.env.VITE_OPENAI_API_KEY
  ? new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true,
    })
  : null;

// Fallback prompts for browser-direct DALL-E (if backend /api is unavailable)
const FALLBACK_PROMPTS = {
  night_sky: "A breathtaking starry night sky over vast desert sand dunes, deep navy blue atmosphere, hundreds of bright stars and a glowing moon, golden light on sand, rich and detailed, no people",
  desert_dawn: "Golden sunrise over layered desert sand dunes, warm amber and orange light rays, rich texture in sand, atmospheric depth, beautiful and detailed, no people",
  geometric: "Intricate Islamic geometric mosaic tiles, deep teal and gold colors, ornate tessellation pattern, polished marble surface, beautiful symmetrical design, detailed and rich",
  garden: "Lush peaceful garden with flowing water fountain, green plants and white flowers, golden sunlight filtering through leaves, serene and beautiful, no people",
  architecture: "Grand Islamic architecture interior, ornate marble arches, geometric carvings, warm golden light streaming through windows, rich detail and depth, no people",
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
  return Promise.race([
    fetch(url),
    timeoutAfter(ms, label),
  ]);
}

function buildLocalHabibiSuggestion(userText) {
  const text = (userText || "").toLowerCase();
  if (
    text.includes("passed away") ||
    text.includes("pass away") ||
    text.includes("death") ||
    text.includes("died") ||
    text.includes("lost") ||
    text.includes("funeral") ||
    text.includes("janazah") ||
    text.includes("grandfather") ||
    text.includes("grandmother") ||
    text.includes("father") ||
    text.includes("mother") ||
    text.includes("brother") ||
    text.includes("sister")
  )
    return { surahNo: "2", ayahNo: "156", reason: "Surah Al-Baqarah 2:156 reminds us we belong to Allah and return to Him.", tip: "Use a gentle, consoling tone and keep visuals calm." };
  if (text.includes("sad") || text.includes("depress") || text.includes("grief"))
    return { surahNo: "94", ayahNo: "5", reason: "Surah Ash-Sharh brings hope and relief after hardship.", tip: "Pair it with calming visuals for maximum impact." };
  if (text.includes("anxious") || text.includes("worry") || text.includes("stress") || text.includes("fear"))
    return { surahNo: "13", ayahNo: "28", reason: "Surah Ar-Ra'd 13:28 brings peace of heart through remembrance.", tip: "Use a slow reveal with reflective caption." };
  if (text.includes("forgive") || text.includes("guilt") || text.includes("mercy"))
    return { surahNo: "39", ayahNo: "53", reason: "Surah Az-Zumar speaks of Allah's boundless mercy.", tip: "Lead with mercy-focused wording so the audience feels invited." };
  if (text.includes("sick") || text.includes("ill") || text.includes("surgery") || text.includes("heal"))
    return { surahNo: "26", ayahNo: "80", reason: "Surah Ash-Shu'araa 26:80 — Allah is the ultimate Healer.", tip: "Embrace healing — remind viewers Allah is the ultimate doctor." };
  return { surahNo: "112", ayahNo: "1", reason: "Surah Al-Ikhlas is short, clear, and excellent for reflective content.", tip: "Great for concise clips because each ayah is strong." };
}

function waitForAudioEnd(audioEl, fallbackSeconds) {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, Math.max(1000, Math.round((fallbackSeconds + 0.5) * 1000)));

    function cleanup() {
      clearTimeout(timeoutId);
      audioEl.removeEventListener("ended", onEnded);
      audioEl.removeEventListener("error", onEnded);
    }

    function onEnded() {
      cleanup();
      resolve();
    }

    audioEl.addEventListener("ended", onEnded);
    audioEl.addEventListener("error", onEnded);
  });
}

function loadAudioDuration(url) {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.crossOrigin = "anonymous";

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 5000);

    function cleanup() {
      clearTimeout(timeoutId);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("error", onError);
      audio.src = "";
    }

    function onLoadedMetadata() {
      const d = Number(audio.duration);
      cleanup();
      resolve(Number.isFinite(d) && d > 0 ? d : null);
    }

    function onError() {
      cleanup();
      resolve(null);
    }

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("error", onError);
    audio.src = url;
  });
}

// Generate stars once so they don't move when typing
const STATIC_STARS = Array.from({ length: 80 }, (_, i) => ({
  id: i,
  top: Math.random() * 100,
  left: Math.random() * 100,
  size: Math.random() * 2 + 0.5,
  dur: (Math.random() * 4 + 2).toFixed(1),
  delay: (Math.random() * 5).toFixed(1),
  op: (Math.random() * 0.5 + 0.2).toFixed(2),
}));

function Stars() {
  const stars = STATIC_STARS;
  return (
    <div className="stars-bg">
      {stars.map((s) => (
        <div
          key={s.id}
          className="star"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            "--dur": `${s.dur}s`,
            "--delay": `${s.delay}s`,
            "--max-op": s.op,
          }}
        />
      ))}
    </div>
  );
}

function StepIndicator({ step }) {
  const labels = ["Verse", "Template", "Generate", "Export"];
  return (
    <div className="flex items-center justify-center gap-0 py-5">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={
              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all " +
              (step > i + 1
                ? "bg-amber-400 border-amber-400 text-black"
                : step === i + 1
                ? "bg-amber-500 border-amber-400 text-black shadow-[0_0_12px_rgba(251,191,36,0.6)]"
                : "bg-transparent border-slate-600 text-slate-500")
            }>{i + 1}</div>
            <span className={"text-xs font-semibold " + (step === i + 1 ? "text-amber-400" : step > i + 1 ? "text-amber-600" : "text-slate-600")}>
              {label}
            </span>
          </div>
          {i < 3 && (
            <div className={"h-px w-16 sm:w-24 mx-1 mb-5 " + (step > i + 1 ? "step-line-active" : "step-line-inactive")} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const MOTION_EFFECTS = [
    { id: "none", label: "None" },
    { id: "zoom", label: "Zoom In" },
    { id: "pan", label: "Slow Pan" },
    { id: "parallax", label: "Parallax" },
  ];
  const MOTION_INTENSITIES = [
    { id: "subtle", label: "Subtle" },
    { id: "cinematic", label: "Cinematic" },
  ];

  const [step, setStep] = useState(1);
  const [ayah, setAyah] = useState("");
  const [translation, setTranslation] = useState("");
  const [surah, setSurah] = useState("");
  const [surahNumber, setSurahNumber] = useState("112");
  const [ayahNumber, setAyahNumber] = useState("1");
  const [reciterId, setReciterId] = useState("1");
  const [clipSeconds, setClipSeconds] = useState(8);
  const [motionEffect, setMotionEffect] = useState("none");
  const [motionIntensity, setMotionIntensity] = useState("cinematic");
  const [quranLines, setQuranLines] = useState([]);
  const [lineStartAyahNo, setLineStartAyahNo] = useState(1);
  const [recitationUrl, setRecitationUrl] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [exportProgress, setExportProgress] = useState(0);

  const [habibiPrompt, setHabibiPrompt] = useState("");
  const [habibiAnswer, setHabibiAnswer] = useState("");
  const [habibiBusy, setHabibiBusy] = useState(false);

  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [bgImageEl, setBgImageEl] = useState(null);
  const [rawGeneratedImage, setRawGeneratedImage] = useState("");
  const [imageDebug, setImageDebug] = useState("");
  const [caption, setCaption] = useState("");
  const [hook, setHook] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState("");
  const canvasRef = useRef(null);

  useEffect(() => {
    if (step >= 3) drawCanvasFrame();
  }, [ayah, translation, surah, selectedTemplate, bgImageEl, quranLines, step, motionEffect, motionIntensity]);

  async function fetchSurahAndAutofill(targetSurahNo, targetAyahNo = 1) {
    const parsedSurahNo = Number.parseInt(targetSurahNo, 10);
    if (!Number.isFinite(parsedSurahNo) || parsedSurahNo < 1 || parsedSurahNo > 114) {
      throw new Error("Invalid Surah number.");
    }

    const res = await fetchWithTimeout(
      `https://quranapi.pages.dev/api/${parsedSurahNo}.json`,
      10000,
      "Surah fetch",
    );
    if (!res.ok) {
      throw new Error("Could not fetch surah from Quran API.");
    }

    const quranData = await res.json();
    const arabicArr = Array.isArray(quranData.arabic1) ? quranData.arabic1 : [];
    const englishArr = Array.isArray(quranData.english) ? quranData.english : [];
    const totalAyah = Number(quranData.totalAyah) || arabicArr.length || 1;
    const safeAyahNo = Math.max(1, Math.min(totalAyah, Number.parseInt(targetAyahNo, 10) || 1));

    const lines = arabicArr
      .map((a, i) => ({ ayahNo: i + 1, arabic: a, english: englishArr[i] || "" }))
      .filter((l) => l.arabic);

    const reciters = quranData.audio || {};
    const selectedReciter = reciters[reciterId] || reciters["1"];

    setQuranLines(lines);
    setSurahNumber(String(parsedSurahNo));
    setAyahNumber(String(safeAyahNo));
    setLineStartAyahNo(safeAyahNo);
    setRecitationUrl(selectedReciter?.originalUrl || selectedReciter?.url || "");

    const line = lines[safeAyahNo - 1] || lines[0];
    if (line) {
      setAyah(line.arabic || "");
      setTranslation(line.english || "");
    }

    const surahName = quranData.surahName || "";
    setSurah(`Surah ${surahName} ${parsedSurahNo}:${safeAyahNo}`);

    return { lines, safeAyahNo, quranData };
  }

  async function buildPlaybackPlan(durationSec) {
    const parsedSurahNo = Number.parseInt(surahNumber, 10);
    if (!Number.isFinite(parsedSurahNo) || parsedSurahNo < 1 || parsedSurahNo > 114 || quranLines.length === 0) {
      return [];
    }

    const startAyah = Math.max(1, Number.parseInt(ayahNumber, 10) || lineStartAyahNo || 1);
    const maxAyah = quranLines.length;
    const endAyah = Math.min(maxAyah, startAyah + 11);
    const segments = [];
    let elapsed = 0;

    for (let ayahNoCandidate = startAyah; ayahNoCandidate <= endAyah; ayahNoCandidate++) {
      if (elapsed >= durationSec) break;

      try {
        const verseRes = await fetchWithTimeout(
          `https://quranapi.pages.dev/api/${parsedSurahNo}/${ayahNoCandidate}.json`,
          7000,
          "Verse fetch",
        );
        if (!verseRes.ok) break;
        const verseData = await verseRes.json();
        const reciterAudio = verseData?.audio?.[reciterId] || verseData?.audio?.["1"];
        const audioUrl = reciterAudio?.originalUrl || reciterAudio?.url;
        if (!audioUrl) continue;

        const detectedDuration = await loadAudioDuration(audioUrl);
        const segmentDuration = detectedDuration || 2.6;

        if (segments.length > 0 && elapsed + segmentDuration > durationSec) {
          break;
        }

        segments.push({
          ayahNo: ayahNoCandidate,
          lineIndex: ayahNoCandidate - 1,
          audioUrl,
          durationSec: segmentDuration,
          startSec: elapsed,
          endSec: elapsed + segmentDuration,
        });
        elapsed += segmentDuration;
      } catch {
        break;
      }
    }

    return segments;
  }

  function drawCanvasFrame(elapsedMs = 0, durationMs = 0, lineOverride = null) {
    const canvas = canvasRef.current;
    if (!canvas || !selectedTemplate) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const T = selectedTemplate;
    const motionProgress = durationMs > 0 ? Math.max(0, Math.min(1, elapsedMs / durationMs)) : 0;
    const isCinematic = motionIntensity === "cinematic";

    if (bgImageEl) {
      let scale = 1;
      let offsetX = 0;
      let offsetY = 0;

      if (motionEffect === "zoom") {
        scale = 1 + (isCinematic ? 0.28 : 0.16) * motionProgress;
      } else if (motionEffect === "pan") {
        scale = isCinematic ? 1.14 : 1.08;
        offsetX = isCinematic
          ? -72 + 144 * motionProgress
          : -40 + 80 * motionProgress;
      } else if (motionEffect === "parallax") {
        const waveCycles = isCinematic ? 2.2 : 1.2;
        scale = isCinematic ? 1.18 : 1.12;
        offsetX = isCinematic
          ? -90 + 180 * motionProgress
          : -24 + 48 * motionProgress;
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

    ctx.fillStyle = T.accentColor;
    ctx.fillRect(80, 120, W - 160, 4);
    ctx.font = "bold 48px 'Amiri', serif";
    ctx.textAlign = "center";
    ctx.fillText("DeenStudio", W / 2, 90);

    let lineArabic = lineOverride?.arabic || ayah || "ادع الى سبيل ربك";
    let lineEnglish = lineOverride?.english || translation;
    const activeReference = lineOverride?.reference || surah;
    if (!lineOverride && quranLines.length > 0) {
      let idx = Math.max(0, (Number.parseInt(ayahNumber, 10) || lineStartAyahNo || 1) - 1);
      if (durationMs > 0) {
        const startIndex = Math.max(0, (Number.parseInt(ayahNumber, 10) || lineStartAyahNo || 1) - 1);
        const visibleLines = quranLines.slice(startIndex);
        const segment = durationMs / Math.max(1, visibleLines.length);
        idx = Math.min(quranLines.length - 1, startIndex + Math.floor(elapsedMs / segment));
      }
      lineArabic = quranLines[idx]?.arabic || lineArabic;
      lineEnglish = quranLines[idx]?.english || lineEnglish;
    }

    const drawVerseLayer = (layerArabic, layerEnglish, layerReference, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = T.textColor;
      ctx.font = "bold 88px 'Amiri', serif";
      ctx.textAlign = "center";
      ctx.direction = "rtl";
      const arabicLineCount = wrapText(ctx, layerArabic, W / 2, 340, W - 160, 110);
      ctx.direction = "ltr";

      const dividerY = 340 + arabicLineCount * 110 + 40;
      ctx.fillStyle = T.accentColor;
      ctx.fillRect(W / 2 - 80, dividerY, 160, 3);

      if (layerEnglish) {
        ctx.fillStyle = T.textColor;
        ctx.font = "italic 52px 'Amiri', serif";
        ctx.textAlign = "center";
        wrapText(ctx, '"' + layerEnglish + '"', W / 2, dividerY + 80, W - 200, 72);
      }

      if (layerReference) {
        ctx.fillStyle = T.accentColor;
        ctx.font = "bold 44px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("— " + layerReference, W / 2, H - 280);
      }
      ctx.restore();
    };

    const nextBlend = Math.max(0, Math.min(1, Number(lineOverride?.blend || 0)));
    const nextLayer = lineOverride?.next;
    if (nextLayer && nextBlend > 0) {
      drawVerseLayer(lineArabic, lineEnglish, activeReference, 1 - nextBlend);
      drawVerseLayer(
        nextLayer.arabic || lineArabic,
        nextLayer.english || lineEnglish,
        nextLayer.reference || activeReference,
        nextBlend,
      );
    } else {
      drawVerseLayer(lineArabic, lineEnglish, activeReference, 1);
    }

    ctx.fillStyle = T.accentColor;
    ctx.fillRect(80, H - 200, W - 160, 4);
    ctx.fillStyle = T.textColor;
    ctx.font = "36px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Reflect · Save · Share", W / 2, H - 130);
    ctx.font = "28px sans-serif";
    ctx.fillText("DeenStudio.app", W / 2, H - 60);
  }

  async function askHabibi() {
    if (!habibiPrompt.trim()) return;
    setHabibiBusy(true);
    setHabibiAnswer("");
    try {
      if (!browserOpenAI) {
        try {
          const habibiRes = await Promise.race([
            fetch("/api/habibi-advice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: habibiPrompt }),
            }),
            timeoutAfter(20000, "Habibi backend request"),
          ]);
          const habibiData = await parseApiResponse(habibiRes, "Habibi API request failed");
          const fallback = buildLocalHabibiSuggestion(habibiPrompt);
          const nextSurahNo = habibiData?.surahNo || fallback.surahNo;
          const nextAyahNo = habibiData?.ayahNo || fallback.ayahNo;
          const why = habibiData?.why || fallback.reason;
          const tip = habibiData?.tip || fallback.tip;
          setHabibiAnswer(`Suggestion: Surah ${nextSurahNo}:${nextAyahNo}. ${why} Tip: ${tip}`);
          try {
            await fetchSurahAndAutofill(nextSurahNo, nextAyahNo);
          } catch {
            // Keep the suggestion visible even if Quran API is temporarily unreachable.
          }
          return;
        } catch {
          const fallback = buildLocalHabibiSuggestion(habibiPrompt);
          setHabibiAnswer(`Suggestion: Surah ${fallback.surahNo}:${fallback.ayahNo}. ${fallback.reason} Tip: ${fallback.tip}`);
          try {
            await fetchSurahAndAutofill(fallback.surahNo, fallback.ayahNo);
          } catch {
            // Keep the suggestion visible even if Quran API is temporarily unreachable.
          }
          return;
        }
      }

      const completion = await browserOpenAI.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Habibi, a respectful Quran reflection assistant. Suggest one Quran reference and practical short-form advice. No fatwa, no legal rulings.",
          },
          {
            role: "user",
            content: `User context: ${habibiPrompt}\n\nReturn exactly:\nSURAH_NUMBER: <1-114>\nAYAH_NUMBER: <ayah in that surah>\nWHY: <2 concise sentences>\nPOSTING_TIP: <1 concise sentence for a short-form reel>` ,
          },
        ],
      });

      const raw = completion.choices?.[0]?.message?.content || "";
      const matchNo = raw.match(/SURAH_NUMBER:\s*(\d+)/i);
      const matchAyah = raw.match(/AYAH_NUMBER:\s*(\d+)/i);
      const matchWhy = raw.match(/WHY:\s*([\s\S]+?)(?=POSTING_TIP:|$)/i);
      const matchTip = raw.match(/POSTING_TIP:\s*(.+)/i);
      const fallback = buildLocalHabibiSuggestion(habibiPrompt);
      const nextSurahNo = matchNo?.[1] || fallback.surahNo;
      const nextAyahNo = matchAyah?.[1] || fallback.ayahNo;
      const why = matchWhy?.[1]?.trim() || fallback.reason;
      const tip = matchTip?.[1]?.trim() || fallback.tip;
      await fetchSurahAndAutofill(nextSurahNo, nextAyahNo);
      setHabibiAnswer(`Suggestion: Surah ${nextSurahNo}:${nextAyahNo}. ${why} Tip: ${tip}`);
    } catch {
      const fallback = buildLocalHabibiSuggestion(habibiPrompt);
      try {
        await fetchSurahAndAutofill(fallback.surahNo, fallback.ayahNo);
      } catch {
        // Keep fallback text response resilient in production network edge-cases.
      }
      setHabibiAnswer(`Suggestion: Surah ${fallback.surahNo}:${fallback.ayahNo}. ${fallback.reason} Tip: ${fallback.tip}`);
    } finally {
      setHabibiBusy(false);
    }
  }

  async function generateImageWithDiagnostics(templateId) {
    const prompt =
      FALLBACK_PROMPTS[templateId] ||
      "Beautiful Islamic inspired artwork with rich colors and detail";
    const failures = [];

    try {
      setGenerateStatus("Generating image via backend API...");
      const imgRes = await Promise.race([
        fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId }),
        }),
        timeoutAfter(90000, "Backend image request"),
      ]);
      const imgData = await parseApiResponse(imgRes, "Image API request failed");
      if (imgData?.image) {
        return { image: imgData.image, source: "backend:/api/generate-image" };
      }
      failures.push("backend returned no image field");
    } catch (err) {
      failures.push(`backend failed: ${err.message}`);
    }

    if (!browserOpenAI) {
      throw new Error(
        `No browser OpenAI fallback available (missing VITE_OPENAI_API_KEY). ${failures.join(" | ")}`
      );
    }

    try {
      setGenerateStatus("Generating image via browser OpenAI (DALL-E 3)...");
      const direct = await Promise.race([
        browserOpenAI.images.generate({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: "1024x1792",
          quality: "standard",
          response_format: "b64_json",
        }),
        timeoutAfter(90000, "Browser DALL-E 3 request"),
      ]);

      const b64 = direct?.data?.[0]?.b64_json;
      if (b64) {
        return {
          image: `data:image/png;base64,${b64}`,
          source: "browser:dall-e-3:b64_json",
        };
      }

      const url = direct?.data?.[0]?.url;
      if (url) {
        return { image: url, source: "browser:dall-e-3:url" };
      }

      failures.push("browser dall-e-3 returned neither b64_json nor url");
    } catch (err) {
      failures.push(`browser dall-e-3 failed: ${err.message}`);
    }

    try {
      setGenerateStatus("Retrying image via browser OpenAI (gpt-image-1)...");
      const alt = await Promise.race([
        browserOpenAI.images.generate({
          model: "gpt-image-1",
          prompt,
          size: "1024x1024",
          response_format: "b64_json",
        }),
        timeoutAfter(90000, "Browser gpt-image-1 request"),
      ]);

      const b64 = alt?.data?.[0]?.b64_json;
      if (b64) {
        return {
          image: `data:image/png;base64,${b64}`,
          source: "browser:gpt-image-1:b64_json",
        };
      }
      failures.push("browser gpt-image-1 returned no b64_json");
    } catch (err) {
      failures.push(`browser gpt-image-1 failed: ${err.message}`);
    }

    throw new Error(`Image generation failed after retries. ${failures.join(" | ")}`);
  }

  async function handleGenerate() {
    if (!selectedTemplate) return;
    setGenerating(true);
    setBgImageEl(null);
    setRawGeneratedImage("");
    setImageDebug("");
    setCaption("");
    setHook("");
    setHashtags("");
    setGenerateStatus("");
    try {
      let promptArabic = ayah;
      let promptEnglish = translation;
      const parsedSurahNo = Number.parseInt(surahNumber, 10);
      if (Number.isFinite(parsedSurahNo) && parsedSurahNo >= 1 && parsedSurahNo <= 114) {
        try {
          setGenerateStatus("Fetching Surah text and recitation...");
          const { lines } = await fetchSurahAndAutofill(parsedSurahNo, ayahNumber);
          if (lines.length > 0) {
            const startAyah = Math.max(1, Number.parseInt(ayahNumber, 10) || 1);
            const subLines = lines.slice(startAyah - 1, Math.min(lines.length, startAyah + 5));
            promptArabic = subLines.map((l) => l.arabic).join(" ");
            promptEnglish = subLines.map((l) => l.english).join(" ");
          }
        } catch {
          setQuranLines([]);
          setRecitationUrl("");
        }
      } else {
        setQuranLines([]);
        setRecitationUrl("");
      }

      setGenerateStatus("Generating background image...");
      let imgData;
      let capData;

      try {
        imgData = await generateImageWithDiagnostics(selectedTemplate.id);

        setGenerateStatus("Generating caption and hook...");
        const capRes = await fetch("/api/generate-caption", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            translation: promptEnglish,
            ayah: promptArabic,
            surah,
          }),
        });
        capData = await parseApiResponse(capRes, "Caption API request failed");
      } catch (apiErr) {
        if (!imgData) {
          throw apiErr;
        }

        if (!browserOpenAI) {
          throw new Error(`Caption API failed and browser fallback is unavailable: ${apiErr.message}`);
        }

        setGenerateStatus("Generating caption and hook...");
        const completion = await browserOpenAI.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a social media assistant for Muslim creators. Write respectful, impactful, shareable Islamic short-form content.",
            },
            {
              role: "user",
              content: `Generate social media content for this Quranic verse:\n\nVerse: "${promptEnglish || promptArabic}"\nReference: ${surah || "The Holy Quran"}\n\nReturn EXACTLY this format:\nHOOK: [one punchy opening sentence under 12 words]\nCAPTION: [2-3 sentences of sincere reflection]\nHASHTAGS: [8 relevant hashtags separated by spaces]`,
            },
          ],
          max_tokens: 400,
        });

        const raw = completion.choices?.[0]?.message?.content || "";
        const hookMatch = raw.match(/HOOK:\s*(.+)/);
        const captionMatch = raw.match(/CAPTION:\s*([\s\S]+?)(?=HASHTAGS:|$)/);
        const hashtagsMatch = raw.match(/HASHTAGS:\s*(.+)/);

        capData = {
          hook: hookMatch?.[1]?.trim() || "",
          caption: captionMatch?.[1]?.trim() || raw,
          hashtags: hashtagsMatch?.[1]?.trim() || "",
        };
      }

      if (!imgData?.image) {
        throw new Error("Image generation did not return an image.");
      }

      setRawGeneratedImage(imgData.image);
      setImageDebug(imgData.source || "unknown-source");

      const img = new Image();
      img.onload = () => {
        setBgImageEl(img);
        setGenerateStatus(`Background loaded successfully (${imgData.source || "image-source-unknown"}).`);
      };
      img.onerror = () => {
        setGenerateStatus(`Generated image could not be decoded by browser (${imgData.source || "image-source-unknown"}).`);
      };
      img.crossOrigin = "anonymous";
      img.src = imgData.image;

      setHook(capData?.hook || "");
      setCaption(capData?.caption || "");
      setHashtags(capData?.hashtags || "");
      setGenerateStatus(`Image generated via ${imgData.source || "unknown-source"}. Finalizing preview...`);
      setStep(4);
    } catch (err) {
      console.error(err);
      setGenerateStatus(
        "Error: " +
          (err.message ||
            "Generation failed. If running npm run dev, ensure VITE_OPENAI_API_KEY is set or run a backend server for /api routes.")
      );
    }
    setGenerating(false);
  }

  function downloadPNG() {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = "deenstudio.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
  async function exportVideo() {
    const canvas = canvasRef.current;
    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mimeType) {
      alert("Your browser does not support video export. Use Chrome.");
      return;
    }

    setExportStatus("Preparing export...");
    setExportProgress(0);
    const durationMs = Math.max(5, Math.min(60, Number(clipSeconds) || 8)) * 1000;
    const durationSec = durationMs / 1000;

    const playbackSegments = await Promise.race([
      buildPlaybackPlan(durationSec),
      timeoutAfter(15000, "Playback planning"),
    ]).catch(() => []);
    const activeSegments = playbackSegments.length
      ? playbackSegments
      : (() => {
          const startAyah = Math.max(1, Number.parseInt(ayahNumber, 10) || 1);
          const maxLines = Math.max(1, Math.min(3, Math.floor(durationSec / 2.2)));
          const selected = quranLines.slice(startAyah - 1, startAyah - 1 + maxLines);
          const each = durationSec / Math.max(1, selected.length);
          return selected.map((line, idx) => ({
            ayahNo: startAyah + idx,
            lineIndex: (startAyah - 1) + idx,
            audioUrl: null,
            durationSec: each,
            startSec: idx * each,
            endSec: (idx + 1) * each,
          }));
        })();

    if (!playbackSegments.length) {
      setExportStatus("Recording with timed verse transitions (audio metadata unavailable).");
    }

    const videoStream = canvas.captureStream(30);
    const tracks = [...videoStream.getVideoTracks()];

    let audioCtx;
    let audioEl;
    let sourceNode;
    let destNode;
    try {
      if (activeSegments.some((s) => s.audioUrl)) {
        audioEl = new Audio();
        audioEl.crossOrigin = "anonymous";
        audioEl.preload = "auto";
        audioCtx = new AudioContext();
        sourceNode = audioCtx.createMediaElementSource(audioEl);
        destNode = audioCtx.createMediaStreamDestination();
        sourceNode.connect(destNode);
        destNode.stream.getAudioTracks().forEach((track) => tracks.push(track));
      }
    } catch {
      setExportStatus("Audio stream unavailable, exporting silent video.");
    }

    const mixedStream = new MediaStream(tracks);
    const recorder = new MediaRecorder(mixedStream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "deenstudio.webm";
      a.click();
      setExportStatus("Export complete.");
      setExportProgress(100);
      if (audioEl) {
        audioEl.pause();
        audioEl.src = "";
      }
      if (audioCtx) {
        audioCtx.close();
      }
    };

    drawCanvasFrame(0, durationMs);
    recorder.start();
    setExportStatus("Recording video...");
    setExportProgress(2);

    if (audioEl) {
      try {
        await audioCtx.resume();
        const playSegments = async () => {
          for (const segment of activeSegments) {
            if (!segment.audioUrl) continue;
            audioEl.src = segment.audioUrl;
            audioEl.currentTime = 0;
            try {
              await audioEl.play();
            } catch {
              break;
            }
            await waitForAudioEnd(audioEl, segment.durationSec || 2.6);
          }
        };
        playSegments();
      } catch {
        setExportStatus("Audio playback blocked by browser, continuing without audible preview.");
      }
    }

    let frame = 0;
    const T = selectedTemplate;
    const startTime = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const percent = Math.min(99, Math.max(2, Math.round((elapsed / durationMs) * 100)));
      setExportProgress(percent);
      let lineOverride = null;
      if (activeSegments.length > 0) {
        const elapsedSec = elapsed / 1000;
        const currentIndex = activeSegments.findIndex((s) => elapsedSec >= s.startSec && elapsedSec < s.endSec);
        const safeIndex = currentIndex >= 0 ? currentIndex : activeSegments.length - 1;
        const currentSegment = activeSegments[safeIndex];
        const currentLine = quranLines[currentSegment?.lineIndex] || null;
        if (currentLine) {
          const refBase = surah.includes(":") ? surah.split(":")[0] : surah;
          const nextSegment = activeSegments[safeIndex + 1] || null;
          const nextLine = nextSegment ? (quranLines[nextSegment.lineIndex] || null) : null;
          const segmentLength = Math.max(0.001, (currentSegment?.endSec || 0) - (currentSegment?.startSec || 0));
          const segmentProgress = Math.max(0, Math.min(1, (elapsedSec - (currentSegment?.startSec || 0)) / segmentLength));
          const fadeWindow = 0.3;
          const blend = nextLine && segmentProgress > (1 - fadeWindow)
            ? Math.min(1, (segmentProgress - (1 - fadeWindow)) / fadeWindow)
            : 0;
          lineOverride = {
            arabic: currentLine.arabic || ayah,
            english: currentLine.english || translation,
            reference: `${refBase}:${currentSegment.ayahNo}`,
            blend,
            next: nextLine ? {
              arabic: nextLine.arabic || ayah,
              english: nextLine.english || translation,
              reference: `${refBase}:${nextSegment.ayahNo}`,
            } : null,
          };
        }
      }
      drawCanvasFrame(elapsed, durationMs, lineOverride);
      const ctx = canvas.getContext("2d");
      const alpha = 0.4 + 0.4 * Math.sin(frame * 0.15);
      const hex = Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.fillStyle = T.accentColor + hex;
      ctx.fillRect(80, 120, canvas.width - 160, 4);
      ctx.fillRect(80, canvas.height - 200, canvas.width - 160, 4);
      frame++;
    }, 33);

    setTimeout(() => {
      clearInterval(interval);
      recorder.stop();
    }, durationMs);
  }

  return (
    <div className="deen-shell min-h-screen text-white">
      <Stars />
      <div className="pointer-events-none fixed inset-0 deen-aura z-0" />

      {/* Header */}
      <header className="relative z-10 text-center pt-10 pb-6 px-4">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-8 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(212,168,76,0.7))" }} />
          <h1 className="text-5xl sm:text-6xl font-black tracking-wide" style={{ color: "#f0c060", textShadow: "0 0 40px rgba(212,168,76,0.4), 0 2px 4px rgba(0,0,0,0.8)" }}>
            DeenStudio
          </h1>
          <div className="w-8 h-px" style={{ background: "linear-gradient(90deg, rgba(212,168,76,0.7), transparent)" }} />
        </div>
        <p className="text-slate-200 text-base sm:text-lg font-medium">AI-powered Quran verse videos for Muslim creators</p>
        <p className="text-slate-400 text-sm mt-1 italic">
          "Call to the way of your Lord with wisdom and good instruction." — An-Nahl 16:125
        </p>
      </header>

      {/* Step indicator */}
      <div className="relative z-10">
        <StepIndicator step={step} />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto px-4 pb-16">

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-2">

            {/* Habibi panel */}
            <div className="lg:col-span-2 habibi-card p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-sm">✨</div>
                <p className="text-lg font-extrabold text-amber-300">Ask Habibi AI</p>
              </div>
              <p className="text-sm text-slate-400">Tell Habibi how you feel and get a Quran verse suggestion instantly.</p>
              <textarea
                className="w-full bg-slate-950/60 border border-amber-400/30 rounded-xl p-4 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/50 text-sm"
                rows={4}
                placeholder="I just had surgery, give me a dua for healing..."
                value={habibiPrompt}
                onChange={(e) => setHabibiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askHabibi(); } }}
              />
              <button onClick={askHabibi} disabled={habibiBusy || !habibiPrompt.trim()} className="gold-btn w-full py-3 rounded-xl text-sm">
                {habibiBusy ? "✨ Habibi is thinking..." : "✨ Ask Habibi"}
              </button>
              {habibiAnswer && (
                <div className="habibi-answer p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-amber-400/20 flex items-center justify-center text-xs">🤖</div>
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">Habibi AI</span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">{habibiAnswer}</p>
                </div>
              )}
            </div>

            {/* Verse input panel */}
            <div className="lg:col-span-3 space-y-4">
              <div className="deen-panel p-5 space-y-4">
                {/* Surah controls */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Surah #</label>
                    <input className="w-full bg-slate-900/80 border border-slate-600/60 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-400/70 transition-colors" placeholder="112" value={surahNumber} onChange={(e) => setSurahNumber(e.target.value.replace(/[^0-9]/g, ""))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Ayah #</label>
                    <input className="w-full bg-slate-900/80 border border-slate-600/60 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-400/70 transition-colors" placeholder="1" value={ayahNumber} onChange={(e) => setAyahNumber(e.target.value.replace(/[^0-9]/g, ""))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Reciter</label>
                    <select className="w-full bg-slate-900/80 border border-slate-600/60 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-400/70 transition-colors" value={reciterId} onChange={(e) => setReciterId(e.target.value)}>
                      <option value="1">1 - Mishary Al Afasy</option>
                      <option value="2">2 - Abu Bakr Al Shatri</option>
                      <option value="3">3 - Nasser Al Qatami</option>
                      <option value="4">4 - Yasser Al Dosari</option>
                      <option value="5">5 - Hani Ar Rifai</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Clip (sec)</label>
                    <input className="w-full bg-slate-900/80 border border-slate-600/60 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-400/70 transition-colors" type="number" min={5} max={60} value={clipSeconds} onChange={(e) => setClipSeconds(e.target.value.replace(/[^0-9]/g, ""))} />
                  </div>
                </div>

                {/* Arabic verse display with decorative frame */}
                <div className="verse-frame">
                  <div className="verse-frame-inner">
                    <textarea
                      className="w-full bg-transparent border-0 p-2 text-right leading-loose resize-none focus:outline-none"
                      style={{ fontFamily: "'Amiri', serif", fontSize: "1.6rem", color: "#f0e6d3", lineHeight: 2.1, direction: "rtl" }}
                      rows={3}
                      dir="rtl"
                      placeholder="ادع الى سبيل ربك بالحكمة..."
                      value={ayah}
                      onChange={(e) => setAyah(e.target.value)}
                    />
                  </div>
                </div>

                {/* Translation */}
                <div className="deen-panel-gold p-4">
                  <textarea
                    className="w-full bg-transparent border-0 resize-none focus:outline-none text-base font-medium text-center"
                    style={{ color: "#f0c060", fontFamily: "'Amiri', serif", fontSize: "1.15rem", lineHeight: 1.8 }}
                    rows={2}
                    placeholder="And He 'alone' heals me when I am sick."
                    value={translation}
                    onChange={(e) => setTranslation(e.target.value)}
                  />
                </div>

                {/* Surah ref + controls row */}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    className="flex-1 min-w-0 bg-slate-900/80 border border-slate-600/60 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-400/70"
                    placeholder="Surah An-Nahl 16:125"
                    value={surah}
                    onChange={(e) => setSurah(e.target.value)}
                  />
                </div>

                <button
                  onClick={() => { if (ayah || translation) setStep(2); }}
                  disabled={!ayah && !translation}
                  className="gold-btn w-full py-4 rounded-xl text-base"
                >
                  Choose Template →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div className="mt-4">
            <p className="text-center text-slate-400 text-sm mb-6">All templates are curated to be respectful and appropriate for Quranic content</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t)}
                  className={"rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all " + (selectedTemplate?.id === t.id ? "border-amber-400 shadow-[0_0_20px_rgba(212,168,76,0.3)]" : "border-slate-700 hover:border-slate-500")}
                  style={{ background: t.bg }}
                >
                  <span style={{ fontSize: 28 }}>{t.preview}</span>
                  <span className="text-xs font-semibold" style={{ color: t.accentColor }}>{t.name}</span>
                  {selectedTemplate?.id === t.id && <span className="text-xs bg-amber-400 text-black px-2 py-0.5 rounded-full font-bold">Selected</span>}
                </button>
              ))}
            </div>
            <div className="deen-panel p-4 max-w-xl mx-auto mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-bold mb-3">Motion Effect</p>
                  <select
                    className="w-full bg-slate-900/80 border border-slate-600/60 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-400/70"
                    value={motionEffect}
                    onChange={(e) => setMotionEffect(e.target.value)}
                  >
                    {MOTION_EFFECTS.map((effect) => (
                      <option key={effect.id} value={effect.id}>{effect.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-bold mb-3">Motion Intensity</p>
                  <select
                    className="w-full bg-slate-900/80 border border-slate-600/60 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-400/70"
                    value={motionIntensity}
                    onChange={(e) => setMotionIntensity(e.target.value)}
                  >
                    {MOTION_INTENSITIES.map((intensity) => (
                      <option key={intensity.id} value={intensity.id}>{intensity.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 max-w-sm mx-auto">
              <button onClick={() => setStep(1)} className="flex-1 deen-panel py-3 rounded-xl text-sm text-slate-300 hover:border-slate-500 transition-all">← Back</button>
              <button onClick={() => { if (selectedTemplate) setStep(3); }} disabled={!selectedTemplate} className="flex-1 gold-btn py-3 rounded-xl text-sm">Generate →</button>
            </div>
          </div>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div className="max-w-md mx-auto mt-8 space-y-5">
            <div className="deen-panel-gold p-6 text-center">
              <p className="text-slate-400 text-sm mb-1">Selected template</p>
              <p className="text-amber-300 font-extrabold text-2xl">{selectedTemplate?.preview} {selectedTemplate?.name}</p>
            </div>
            <div className="deen-panel p-6 space-y-3">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-2">What will be generated</p>
              {["AI background image via DALL-E 3", "9:16 canvas with Arabic text and translation", "TikTok hook, caption, and hashtags via GPT-4o", "PNG download and webm video export with recitation"].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  <p className="text-sm text-slate-300">{item}</p>
                </div>
              ))}
            </div>
            {generating && (
              <div className="deen-panel-gold p-4 text-center">
                <p className="text-amber-300 text-sm font-semibold animate-pulse">{generateStatus}</p>
              </div>
            )}
            {generateStatus.startsWith("Error") && (
              <div className="bg-red-950/60 border border-red-700/50 rounded-xl p-4">
                <p className="text-red-300 text-sm">{generateStatus}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 deen-panel py-3 rounded-xl text-sm text-slate-300 transition-all">← Back</button>
              <button onClick={handleGenerate} disabled={generating} className="flex-1 gold-btn py-3 rounded-xl text-sm">
                {generating ? "Generating..." : "✦ Generate Now"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4 ── */}
        {step === 4 && (
          <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">

            {/* Raw image */}
            <div className="deen-panel p-4">
              <p className="text-sm font-semibold text-slate-300 mb-3">Raw Image (DALL-E)</p>
              {rawGeneratedImage ? (
                <img src={rawGeneratedImage} alt="Generated background" className="w-full rounded-xl border border-slate-600/50" />
              ) : (
                <div className="h-64 rounded-xl border border-dashed border-slate-700 flex items-center justify-center text-sm text-slate-500 text-center px-4">
                  Raw image preview will appear here
                </div>
              )}
              <p className="text-xs text-slate-500 mt-2">Source: {imageDebug || "pending"}</p>
            </div>

            {/* Canvas preview */}
            <div className="deen-panel p-4">
              <p className="text-sm font-semibold text-slate-300 mb-3">9:16 Branded Preview</p>
              <canvas ref={canvasRef} width={1080} height={1920} className="w-full rounded-xl border border-slate-600/50" style={{ maxHeight: "62vh", objectFit: "contain" }} />
              <div className="flex gap-3 mt-4">
                <button onClick={downloadPNG} className="flex-1 deen-panel py-3 rounded-xl text-sm text-slate-200 hover:border-amber-400/50 transition-all">Download PNG</button>
                <button onClick={exportVideo} className="flex-1 gold-btn py-3 rounded-xl text-sm">Export Video</button>
              </div>
              <div className="mt-3">
                <div className="h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-700">
                  <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${exportProgress}%` }} />
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>{exportStatus || "Ready"}</span>
                  <span>{exportProgress}%</span>
                </div>
              </div>
            </div>

            {/* Caption panel */}
            <div className="space-y-4">
              {hook && (
                <div className="deen-panel-gold p-4">
                  <p className="text-xs text-amber-400 uppercase tracking-wide font-bold mb-2">Hook</p>
                  <p className="text-amber-200 font-bold text-base leading-snug">{hook}</p>
                  <button onClick={() => navigator.clipboard.writeText(hook)} className="mt-2 text-xs text-slate-400 hover:text-amber-300 transition-colors">Copy</button>
                </div>
              )}
              {caption && (
                <div className="deen-panel p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-bold mb-2">Caption</p>
                  <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{caption}</p>
                  <button onClick={() => navigator.clipboard.writeText(caption)} className="mt-2 text-xs text-slate-400 hover:text-amber-300 transition-colors">Copy</button>
                </div>
              )}
              {hashtags && (
                <div className="deen-panel p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-bold mb-2">Hashtags</p>
                  <p className="text-cyan-300 text-sm leading-relaxed">{hashtags}</p>
                  <button onClick={() => navigator.clipboard.writeText(hashtags)} className="mt-2 text-xs text-slate-400 hover:text-amber-300 transition-colors">Copy</button>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setStep(1); setBgImageEl(null); setRawGeneratedImage(""); setImageDebug(""); setCaption(""); setHook(""); setHashtags(""); setGenerateStatus(""); setExportStatus(""); setExportProgress(0); }}
                  className="flex-1 deen-panel py-3 rounded-xl text-sm text-slate-300 hover:border-slate-400 transition-all"
                >
                  Start over
                </button>
                <button onClick={() => { setStep(3); setExportStatus(""); setExportProgress(0); }} className="flex-1 border border-amber-500/50 text-amber-300 py-3 rounded-xl text-sm hover:bg-amber-400/10 transition-all">
                  Regenerate
                </button>
              </div>
            </div>
          </div>
        )}

        {step < 4 && <canvas ref={canvasRef} width={1080} height={1920} className="hidden" />}
      </main>

      <footer className="footer-bar relative z-10">© 2026 DeenStudio. Built with wisdom and good instruction.</footer>
    </div>
  );
}