import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Approx 2.2 words/sec at measured voiceover pace (with natural pauses)
const wordsForDuration = (secs) => Math.round(secs * 2.2);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, hook, clipDuration = 15 } = req.body;

  if (!String(message || "").trim()) {
    return res.status(400).json({ error: "Message required" });
  }

  const targetWords = wordsForDuration(Number(clipDuration) || 15);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You write voiceover scripts for cinematic motivational short-form videos. Your scripts sound like a real, raw person speaking directly to the viewer — not a podcast host, not a self-help guru. Direct. Personal. Honest. No stage directions, no labels, no quotes, no asterisks. Just the words to be spoken aloud. Target exactly ${targetWords} words.`,
        },
        {
          role: "user",
          content: `Write a ${clipDuration}-second voiceover narration based on this message:

"${String(message).trim()}"

Opening line (use this or riff on it): "${String(hook || "").trim()}"

Rules:
- Start strong — grab them in the first 3 words
- Talk directly to the viewer like you know them
- Build from the hook into the deeper truth of the message
- End with a line that hits hard or asks a sharp question
- Target: ${targetWords} words (very important — fit the clip duration)
- No intro, no "hey guys", no self-help clichés like "unlock your potential"
- Raw, cinematic, real`,
        },
      ],
      max_tokens: 600,
      temperature: 0.88,
    });

    const script = completion.choices[0]?.message?.content?.trim() || hook || message;
    return res.status(200).json({ script });
  } catch (err) {
    console.error("Narration error:", err);
    return res.status(500).json({ error: err.message || "Narration failed" });
  }
}
