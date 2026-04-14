import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;

  if (!String(message || "").trim()) {
    return res.status(400).json({ error: "No message provided" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a social media strategist for motivational creators. Write high-retention, cinematic short-form content for TikTok and Instagram Reels. Be direct, raw, and impactful.",
        },
        {
          role: "user",
          content: `Generate social media content for this message:

"${String(message).trim()}"

Return EXACTLY this format:
HOOK: [one punchy opening line under 12 words that stops the scroll]
CAPTION: [2-3 sentences, direct and high-impact, no fluff]
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
