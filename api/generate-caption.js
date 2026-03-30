import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { translation, quote, reference, ayah, surah } = req.body;

  if (!translation && !quote && !ayah) {
    return res.status(400).json({ error: "No message provided" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a social media assistant for motivational creators. Write high-retention, impactful short-form content for TikTok and Instagram Reels.",
        },
        {
          role: "user",
          content: `Generate social media content for this message:

Message: "${translation || quote || ayah}"
Reference: ${reference || surah || "EdgeStudio Draft"}

Return EXACTLY this format with these exact labels:
HOOK: [one punchy opening sentence under 12 words that stops the scroll]
CAPTION: [2-3 sentences of sincere reflection, direct, high-impact tone]
HASHTAGS: [8 relevant hashtags separated by spaces]`,
        },
      ],
      max_tokens: 400,
    });

    const raw = completion.choices[0].message.content;
    const hookMatch = raw.match(/HOOK:\s*(.+)/);
    const captionMatch = raw.match(/CAPTION:\s*([\s\S]+?)(?=HASHTAGS:|$)/);
    const hashtagsMatch = raw.match(/HASHTAGS:\s*(.+)/);

    return res.status(200).json({
      hook: hookMatch?.[1]?.trim() ?? "",
      caption: captionMatch?.[1]?.trim() ?? raw,
      hashtags: hashtagsMatch?.[1]?.trim() ?? "",
    });
  } catch (err) {
    console.error("Caption error:", err);
    return res.status(500).json({ error: err.message });
  }
}

