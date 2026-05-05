import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });
import express from "express";
import cors from "cors";
import fs from "fs";
import { v4 as uuid } from "uuid";
import Stripe from "stripe";

import multer from "multer";
import { downloadVideo, getVideoInfo, getCookieDebugInfo } from "./services/downloader.js";
import { extractAudio, transcribeAudio } from "./services/transcriber.js";
import { findViralMoments } from "./services/moments.js";
import { createClip, buildSRT, addCaptions, generateThumbnail } from "./services/clipper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "uploads");
const OUTPUTS_DIR = path.join(__dirname, "outputs");

[UPLOADS_DIR, OUTPUTS_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const FREE_EXPORT_LIMIT = 5;
const STARTER_EXPORT_LIMIT = 20;

const app = express();
app.use(cors());

// ── Stripe webhook (must be before express.json — needs raw body) ─────────────
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).json({ error: "Webhook secret not configured" });

  let event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] Signature failed:", err.message);
    return res.status(400).json({ error: err.message });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const obj = event.data.object;
  const customerId = obj.customer;

  function planFromPriceId(priceId) {
    if (priceId === process.env.STRIPE_PRICE_ID_PRO) return "pro";
    if (priceId === process.env.STRIPE_PRICE_ID_STARTER) return "starter";
    return "starter"; // default to starter for any unrecognised price
  }

  if (event.type === "checkout.session.completed") {
    // Plan stored in metadata at session creation time
    const plan = obj.metadata?.plan || "starter";
    await supabase.from("profiles").update({ plan }).eq("stripe_customer_id", customerId);
    console.log(`[stripe/webhook] checkout.completed → plan=${plan} for ${customerId}`);
  }

  if (event.type === "customer.subscription.updated") {
    const priceId = obj.items?.data?.[0]?.price?.id;
    const status = obj.status;
    const active = status === "active" || status === "trialing";
    const plan = active ? planFromPriceId(priceId) : "free";
    await supabase.from("profiles").update({ plan }).eq("stripe_customer_id", customerId);
    console.log(`[stripe/webhook] subscription.updated → plan=${plan} for ${customerId}`);
  }

  if (event.type === "customer.subscription.deleted") {
    await supabase.from("profiles").update({ plan: "free" }).eq("stripe_customer_id", customerId);
    console.log(`[stripe/webhook] subscription.deleted → plan=free for ${customerId}`);
  }

  res.json({ received: true });
});

app.use(express.json({ limit: "15mb" }));

// Serve output clips for download
app.use("/clips", express.static(OUTPUTS_DIR));

// Health check for Railway
app.get("/health", (_req, res) => res.json({ ok: true }));

// Cookie diagnostic — visit this URL to see if cookies loaded correctly
app.get("/debug/cookies", (_req, res) => res.json(getCookieDebugInfo()));

// In-memory job store (MVP — replace with DB for prod)
const jobs = new Map();

// ── POST /video/process ───────────────────────────────────────────────────────
// Start a full pipeline: download → transcribe → find moments → clip → captions
app.post("/video/process", async (req, res) => {
  const { url, clipCount = 3, clipDuration = 60, fontKey = "impact" } = req.body;

  if (!url) return res.status(400).json({ error: "url required" });

  const jobId = uuid();
  const job = {
    id: jobId,
    status: "queued",
    stage: "Starting...",
    url,
    clips: [],
    error: null,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  // Return immediately with job ID — client polls /video/status/:id
  res.json({ jobId });

  // Run pipeline async
  runPipeline(job, { url, clipCount, clipDuration, fontKey }).catch((err) => {
    console.error(`[pipeline] Job ${jobId} failed:`, err.message);
    job.status = "failed";
    job.error = err.message;
  });
});

// ── POST /video/upload ────────────────────────────────────────────────────────
// Upload a local video file instead of downloading from YouTube
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const jobId = req.jobId;
      const dir = path.join(UPLOADS_DIR, jobId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, _file, cb) => cb(null, `${req.jobId}.mp4`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (_req, f, cb) => {
    if (f.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only video files allowed"));
  },
});

app.post("/video/upload", (req, _res, next) => {
  const jobId = uuid();
  req.jobId = jobId;
  next();
}, upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No video file received" });

  const { clipCount = 3, clipDuration = 60, fontKey = "impact" } = req.body;
  const videoPath = req.file.path;
  const jobId = req.jobId;

  const job = {
    id: jobId,
    status: "queued",
    stage: "Starting...",
    url: req.file.originalname,
    clips: [],
    error: null,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);
  res.json({ jobId });

  // Run pipeline starting from transcription (skip download)
  runPipelineFromFile(job, { videoPath, clipCount: Number(clipCount), clipDuration: Number(clipDuration), fontKey }).catch((err) => {
    job.status = "failed";
    job.error = err.message;
  });
});

// ── GET /video/status/:id ─────────────────────────────────────────────────────
app.get("/video/status/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

// ── POST /api/generate-image ─────────────────────────────────────────────────
app.post("/api/generate-image", async (req, res) => {
  const { templateId } = req.body;
  const TEMPLATE_PROMPTS = {
    forest:    "Serene ancient forest at blue hour, towering trees with soft god rays filtering through mist, anime illustration style, Studio Ghibli inspired, deep greens and ethereal light, vertical 9:16, ultra detailed, cinematic",
    ocean:     "Calm ocean at sunset, glowing horizon reflecting on still water, illustrated style, dreamy atmospheric haze, soft blues and golds, vertical 9:16, ultra detailed, cinematic peaceful",
    moonlight: "Full moon rising over quiet mountain village, glowing night sky with stars, anime illustration style, blue and silver tones, warm lights in windows below, vertical 9:16, ultra detailed, serene cinematic",
    sakura:    "Cherry blossom path at dusk, petals drifting gently, soft pink and purple sky, illustrated anime style, tranquil Japanese garden, vertical 9:16, ultra detailed, calming cinematic",
    city:      "Peaceful rain-slicked city street at night, glowing streetlights reflected in puddles, illustrated style, warm amber and blue tones, quiet and atmospheric, vertical 9:16, ultra detailed, cinematic",
    gym:       "Lone figure silhouetted against dramatic dawn light on a mountain summit, illustrated cinematic style, inspirational atmosphere, deep contrast, vertical 9:16, ultra detailed, motivational",
  };
  const prompt = TEMPLATE_PROMPTS[templateId] || TEMPLATE_PROMPTS.city;
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1792",
      response_format: "b64_json",
    });
    const image = `data:image/png;base64,${response.data[0].b64_json}`;
    res.json({ image });
  } catch (err) {
    console.error("generate-image error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/generate-caption ───────────────────────────────────────────────
app.post("/api/generate-caption", async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a viral short-form content expert. Given a message/theme, return JSON with:
- hook: a 6-10 word punchy opening line for the video overlay (ALL CAPS style, bold statement)
- caption: a 2-3 sentence TikTok/Reels caption with emojis
- hashtags: 8-10 relevant hashtags as a single string`,
        },
        { role: "user", content: message },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.8,
    });
    const data = JSON.parse(completion.choices[0].message.content);
    res.json(data);
  } catch (err) {
    console.error("generate-caption error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/generate-narration ─────────────────────────────────────────────
app.post("/api/generate-narration", async (req, res) => {
  const { message, hook, clipDuration = 30 } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const words = Math.round(clipDuration * 2.5); // ~2.5 words/sec for narration pace
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Write a spoken narration script for a ${clipDuration}-second motivational short video. Around ${words} words. Direct, powerful, cinematic delivery. No stage directions. Just the words to be spoken.`,
        },
        { role: "user", content: `Theme: ${message}\nOpening hook: ${hook}` },
      ],
      max_tokens: 200,
      temperature: 0.75,
    });
    res.json({ script: completion.choices[0].message.content.trim() });
  } catch (err) {
    console.error("generate-narration error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/generate-voice ─────────────────────────────────────────────────
app.post("/api/generate-voice", async (req, res) => {
  const { text, voice = "onyx" } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });
  const VALID_VOICES = ["onyx", "fable", "echo", "nova", "shimmer", "alloy"];
  const safeVoice = VALID_VOICES.includes(voice) ? voice : "onyx";
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: safeVoice,
      input: text,
      response_format: "mp3",
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error("generate-voice error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jarvis-suggest ─────────────────────────────────────────────────
// Takes a rough idea and returns a punchy video message
app.post("/api/jarvis-suggest", async (req, res) => {
  const { idea } = req.body;
  if (!idea?.trim()) return res.status(400).json({ error: "idea required" });

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are JARVIS, an AI that writes punchy, cinematic short-form video messages. Given a rough idea, write ONE short, powerful message (max 12 words) that would work as the text overlay on a motivational or viral short video. Bold, direct, no fluff. Return ONLY the message text, nothing else.",
        },
        { role: "user", content: idea },
      ],
      max_tokens: 60,
      temperature: 0.85,
    });

    const message = completion.choices[0]?.message?.content?.trim() || "";
    res.json({ message });
  } catch (err) {
    console.error("jarvis-suggest error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/feedback ───────────────────────────────────────────────────────
app.post("/api/feedback", async (req, res) => {
  const { type, rating, message, userEmail } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });

  const entry = {
    type: type || "General feedback",
    rating: rating || 0,
    message: message.trim(),
    user_email: userEmail || "anonymous",
    created_at: new Date().toISOString(),
  };

  const stars = "★".repeat(entry.rating) + "☆".repeat(Math.max(0, 5 - entry.rating));

  // Fire Discord webhook if configured
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (webhookUrl) {
    const embed = {
      embeds: [{
        title: `${entry.type}  ${stars}`,
        description: entry.message,
        color: 0xc9a96e,
        footer: { text: entry.user_email },
        timestamp: entry.created_at,
      }],
    };
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(embed),
    }).catch((err) => console.warn("Discord webhook failed:", err.message));
  }

  // Also store in Supabase if configured
  const supabaseUrl  = process.env.SUPABASE_URL;
  const supabaseKey  = process.env.SUPABASE_SERVICE_KEY;
  if (supabaseUrl && supabaseKey) {
    fetch(`${supabaseUrl}/rest/v1/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(entry),
    }).catch((err) => console.warn("Supabase feedback insert failed:", err.message));
  }

  console.log(`[feedback] ${entry.type} | ${stars} | ${entry.user_email}: ${entry.message.slice(0, 80)}`);
  res.json({ ok: true });
});

// ── GET /video/jobs ───────────────────────────────────────────────────────────
app.get("/video/jobs", (_req, res) => {
  const list = [...jobs.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);
  res.json(list);
});

// ── Billing + Export gating ───────────────────────────────────────────────────

// POST /api/stripe/checkout — create a Stripe Checkout session
app.post("/api/stripe/checkout", async (req, res) => {
  try {
    const { supabase, user } = await getSupabaseUser(req.headers.authorization);
    const { returnUrl, plan = "starter" } = req.body;

    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "Stripe not configured" });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    let { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    if (!profile) {
      const { data } = await supabase.from("profiles").insert({ id: user.id }).select().single();
      profile = data;
    }

    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { supabase_uid: user.id } });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const priceId = plan === "pro"
      ? process.env.STRIPE_PRICE_ID_PRO
      : process.env.STRIPE_PRICE_ID_STARTER;

    if (!priceId) return res.status(500).json({ error: `Stripe price ID for "${plan}" not configured` });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { plan },
      success_url: `${returnUrl || "https://edge-studio.vercel.app"}?upgraded=${plan}`,
      cancel_url: returnUrl || "https://edge-studio.vercel.app",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/exports/use — check limit and increment export counter
app.post("/api/exports/use", async (req, res) => {
  try {
    const { supabase, user } = await getSupabaseUser(req.headers.authorization);

    let { data: profile } = await supabase
      .from("profiles").select("exports_used, plan").eq("id", user.id).single();

    if (!profile) {
      const { data } = await supabase.from("profiles").insert({ id: user.id }).select().single();
      profile = data || { exports_used: 0, plan: "free" };
    }

    const plan = profile.plan || "free";
    if (plan === "pro") return res.json({ ok: true, plan: "pro" });

    const limit = plan === "starter" ? STARTER_EXPORT_LIMIT : FREE_EXPORT_LIMIT;

    if (profile.exports_used >= limit) {
      return res.status(403).json({ error: "limit_reached", exports_used: profile.exports_used, limit, plan });
    }

    const newCount = profile.exports_used + 1;
    await supabase.from("profiles").update({ exports_used: newCount }).eq("id", user.id);

    res.json({ ok: true, exports_used: newCount, limit, plan });
  } catch (err) {
    res.status(err.message.includes("token") || err.message.includes("auth") ? 401 : 500).json({ error: err.message });
  }
});

// ── Projects API ─────────────────────────────────────────────────────────────

async function getSupabaseUser(authHeader) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase not configured");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing auth token");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) throw new Error("Invalid token");
  return { supabase, user };
}

// POST /api/projects — save a generated project to the user's account
app.post("/api/projects", async (req, res) => {
  try {
    const { supabase, user } = await getSupabaseUser(req.headers.authorization);
    const { imageBase64, audioBase64, hook, caption, hashtags, message, templateId, templateName, duration, voice, narrationScript } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

    const projectId = uuid();
    const imgBuffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");

    // Upload thumbnail image to Supabase Storage
    const { error: imgErr } = await supabase.storage
      .from("project-assets")
      .upload(`${user.id}/${projectId}/thumb.jpg`, imgBuffer, { contentType: "image/jpeg", upsert: true });
    if (imgErr) return res.status(500).json({ error: "Image upload failed: " + imgErr.message });

    const { data: { publicUrl: imageUrl } } = supabase.storage
      .from("project-assets")
      .getPublicUrl(`${user.id}/${projectId}/thumb.jpg`);

    // Upload audio if provided
    let audioUrl = null;
    if (audioBase64) {
      const audioBuf = Buffer.from(audioBase64, "base64");
      await supabase.storage
        .from("project-assets")
        .upload(`${user.id}/${projectId}/audio.mp3`, audioBuf, { contentType: "audio/mpeg", upsert: true });
      const { data: { publicUrl } } = supabase.storage
        .from("project-assets")
        .getPublicUrl(`${user.id}/${projectId}/audio.mp3`);
      audioUrl = publicUrl;
    }

    // Insert project record
    const { data, error: dbErr } = await supabase
      .from("projects")
      .insert({
        id: projectId,
        user_id: user.id,
        hook: hook || "",
        caption: caption || "",
        hashtags: hashtags || "",
        message: message || "",
        template_id: templateId || "",
        template_name: templateName || "",
        duration: duration || 15,
        voice: voice || "nova",
        narration_script: narrationScript || "",
        image_url: imageUrl,
        audio_url: audioUrl,
      })
      .select()
      .single();

    if (dbErr) return res.status(500).json({ error: "DB error: " + dbErr.message });
    res.json({ ok: true, project: data });
  } catch (err) {
    console.error("[projects/save]", err.message);
    res.status(err.message.includes("token") || err.message.includes("auth") ? 401 : 500).json({ error: err.message });
  }
});

// GET /api/projects — list current user's saved projects
app.get("/api/projects", async (req, res) => {
  try {
    const { supabase, user } = await getSupabaseUser(req.headers.authorization);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ projects: data });
  } catch (err) {
    res.status(err.message.includes("token") || err.message.includes("auth") ? 401 : 500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id — delete a project and its assets
app.delete("/api/projects/:id", async (req, res) => {
  try {
    const { supabase, user } = await getSupabaseUser(req.headers.authorization);
    const { id } = req.params;
    // Delete storage files
    await supabase.storage.from("project-assets").remove([
      `${user.id}/${id}/thumb.jpg`,
      `${user.id}/${id}/audio.mp3`,
    ]);
    // Delete DB row (RLS also enforces user ownership)
    const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.message.includes("token") || err.message.includes("auth") ? 401 : 500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

async function runPipeline(job, { url, clipCount, clipDuration, fontKey = "impact" }) {
  const { id: jobId } = job;
  const jobUploads = path.join(UPLOADS_DIR, jobId);
  const jobOutputs = path.join(OUTPUTS_DIR, jobId);
  fs.mkdirSync(jobUploads, { recursive: true });
  fs.mkdirSync(jobOutputs, { recursive: true });

  try {
    // 1. Get video metadata
    job.status = "running";
    job.stage = "Fetching video info...";
    console.log(`[pipeline:${jobId}] Fetching info for ${url}`);
    let videoInfo;
    try {
      videoInfo = await getVideoInfo(url);
      job.title = videoInfo.title;
      job.thumbnailUrl = videoInfo.thumbnail;
      job.videoDuration = videoInfo.duration;
    } catch (e) {
      console.warn("[pipeline] Could not get video info:", e.message);
    }

    // 2. Download
    job.stage = "Downloading video...";
    console.log(`[pipeline:${jobId}] Downloading...`);
    const videoPath = await downloadVideo(url, jobUploads, jobId);

    // 3. Extract audio
    job.stage = "Extracting audio...";
    const audioPath = await extractAudio(videoPath, jobUploads, jobId);

    // 4. Transcribe
    job.stage = "Transcribing with Whisper...";
    const transcription = await transcribeAudio(audioPath);
    const videoDuration = job.videoDuration || (transcription.segments?.slice(-1)[0]?.end ?? 600);

    // 5. Find viral moments
    job.stage = "Finding viral moments...";
    const moments = await findViralMoments(transcription, videoDuration, clipCount, clipDuration);
    console.log(`[pipeline:${jobId}] Found ${moments.length} moments`);

    // 6. Clip + captions for each moment
    job.stage = "Creating clips...";
    const clips = [];

    for (const moment of moments) {
      job.stage = `Creating clip ${moment.rank} of ${moments.length}...`;
      console.log(`[pipeline:${jobId}] Clipping moment ${moment.rank}: ${moment.start}s → ${moment.end}s`);

      // Create the clip (cropped 9:16)
      const rawClipPath = await createClip({
        videoPath,
        start: moment.start,
        end: moment.end,
        outputDir: jobOutputs,
        jobId,
        rank: moment.rank,
      });

      // Build SRT from transcript segments
      const srtContent = buildSRT(transcription.segments || [], moment.start, moment.end);
      const srtPath = path.join(jobOutputs, `${jobId}_clip${moment.rank}.srt`);
      fs.writeFileSync(srtPath, srtContent, "utf8");

      // Burn captions if we have subtitle content
      let finalClipPath = rawClipPath;
      if (srtContent.trim()) {
        const captionedPath = rawClipPath.replace(".mp4", "_captioned.mp4");
        try {
          await addCaptions({ videoPath: rawClipPath, srtPath, outputPath: captionedPath, fontKey });
          finalClipPath = captionedPath;
        } catch (captionErr) {
          console.warn(`[pipeline:${jobId}] Caption burn failed (using raw clip):`, captionErr.message);
        }
      }

      // Generate thumbnail from original video at clip midpoint
      const thumbPath = path.join(jobOutputs, `${jobId}_clip${moment.rank}_thumb.jpg`);
      try {
        await generateThumbnail({ videoPath, start: moment.start, end: moment.end, outputPath: thumbPath });
      } catch (thumbErr) {
        console.warn(`[pipeline:${jobId}] Thumbnail failed (non-fatal):`, thumbErr.message);
      }

      const filename = path.basename(finalClipPath);
      const thumbFilename = path.basename(thumbPath);
      clips.push({
        rank: moment.rank,
        viralScore: moment.viralScore,
        title: moment.title,
        hook: moment.hook,
        reason: moment.reason,
        caption: moment.caption,
        start: moment.start,
        end: moment.end,
        duration: moment.duration,
        downloadUrl: `/clips/${jobId}/${filename}`,
        thumbnailUrl: fs.existsSync(thumbPath) ? `/clips/${jobId}/${thumbFilename}` : null,
      });
    }

    job.clips = clips;
    job.status = "done";
    job.stage = "Complete";
    console.log(`[pipeline:${jobId}] Done. ${clips.length} clips ready.`);

    // Clean up uploads (source video + audio) — outputs stay for download
    fs.rm(jobUploads, { recursive: true, force: true }, () => {});

  } catch (err) {
    job.status = "failed";
    job.stage = "Failed";
    job.error = err.message === "NEEDS_COOKIES"
      ? "NEEDS_COOKIES"
      : err.message;
    console.error(`[pipeline:${jobId}] Error:`, err.message?.slice(0, 200));
    fs.rm(jobUploads, { recursive: true, force: true }, () => {});
    fs.rm(jobOutputs, { recursive: true, force: true }, () => {});
  }

  // Keep jobs map lean — drop entries older than 2 hours
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const [id, j] of jobs.entries()) {
    if (Date.now() - j.createdAt > TWO_HOURS) jobs.delete(id);
  }
}

// Same as runPipeline but skips the download step (file already on disk)
async function runPipelineFromFile(job, { videoPath, clipCount, clipDuration, fontKey = "impact" }) {
  const { id: jobId } = job;
  const jobOutputs = path.join(OUTPUTS_DIR, jobId);
  fs.mkdirSync(jobOutputs, { recursive: true });

  try {
    job.status = "running";

    job.stage = "Extracting audio...";
    const jobUploads = path.dirname(videoPath);
    const audioPath = await extractAudio(videoPath, jobUploads, jobId);

    job.stage = "Transcribing with Whisper...";
    const transcription = await transcribeAudio(audioPath);
    const videoDuration = transcription.segments?.slice(-1)[0]?.end ?? 600;

    job.stage = "Finding viral moments...";
    const moments = await findViralMoments(transcription, videoDuration, clipCount, clipDuration);

    job.stage = "Creating clips...";
    const clips = [];

    for (const moment of moments) {
      job.stage = `Creating clip ${moment.rank} of ${moments.length}...`;
      const rawClipPath = await createClip({ videoPath, start: moment.start, end: moment.end, outputDir: jobOutputs, jobId, rank: moment.rank });

      const srtContent = buildSRT(transcription.segments || [], moment.start, moment.end);
      const srtPath = path.join(jobOutputs, `${jobId}_clip${moment.rank}.srt`);
      fs.writeFileSync(srtPath, srtContent, "utf8");

      let finalClipPath = rawClipPath;
      if (srtContent.trim()) {
        const captionedPath = rawClipPath.replace(".mp4", "_captioned.mp4");
        try { await addCaptions({ videoPath: rawClipPath, srtPath, outputPath: captionedPath, fontKey }); finalClipPath = captionedPath; }
        catch (e) { console.warn(`[upload-pipeline] caption failed:`, e.message); }
      }

      const thumbPath = path.join(jobOutputs, `${jobId}_clip${moment.rank}_thumb.jpg`);
      try { await generateThumbnail({ videoPath, start: moment.start, end: moment.end, outputPath: thumbPath }); } catch {}

      clips.push({
        rank: moment.rank,
        viralScore: moment.viralScore,
        title: moment.title,
        hook: moment.hook,
        reason: moment.reason,
        caption: moment.caption,
        start: moment.start,
        end: moment.end,
        duration: moment.duration,
        downloadUrl: `/clips/${jobId}/${path.basename(finalClipPath)}`,
        thumbnailUrl: fs.existsSync(thumbPath) ? `/clips/${jobId}/${path.basename(thumbPath)}` : null,
      });
    }

    job.clips = clips;
    job.status = "done";
    job.stage = "Complete";
    fs.rm(jobUploads, { recursive: true, force: true }, () => {});
  } catch (err) {
    job.status = "failed";
    job.stage = "Failed";
    job.error = err.message;
    console.error(`[upload-pipeline:${jobId}] Error:`, err);
  }

  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const [id, j] of jobs.entries()) {
    if (Date.now() - j.createdAt > TWO_HOURS) jobs.delete(id);
  }
}

// Railway uses PORT env var; fall back to VIDEO_PORT for local dev
const PORT = process.env.PORT || process.env.VIDEO_PORT || 3001;
app.listen(PORT, "0.0.0.0", () => console.log(`[server] Video backend running on port ${PORT}`));
