import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, voice = "onyx" } = req.body;

  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: "Text is required" });
  }

  if (!VOICES.includes(voice)) {
    return res.status(400).json({ error: "Invalid voice" });
  }

  const input = String(text).trim().slice(0, 4000);

  try {
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input,
      speed: 0.92,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("Voice generation error:", err);
    return res.status(500).json({ error: err.message || "Voice generation failed" });
  }
}
