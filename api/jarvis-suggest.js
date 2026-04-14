import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { idea } = req.body;
  if (!String(idea || "").trim()) {
    return res.status(400).json({ error: "Idea is required" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are JARVIS, a short-form video content strategist for motivational creators. Given a theme or idea, craft ONE powerful, concise message (1–2 sentences max) that works as the core message for a cinematic short-form video. Make it raw, direct, scroll-stopping. Return ONLY the message — no labels, no quotes, no explanation.",
        },
        {
          role: "user",
          content: String(idea).trim().slice(0, 300),
        },
      ],
      max_tokens: 80,
      temperature: 0.85,
    });

    const message = completion.choices[0]?.message?.content?.trim() || "";
    return res.status(200).json({ message });
  } catch (err) {
    console.error("JARVIS suggest error:", err);
    return res.status(500).json({ error: err.message || "JARVIS failed" });
  }
}
