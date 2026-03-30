import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userPrompt = String(req.body?.prompt || "").trim();
  if (!userPrompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are JARVIS, a focused short-form content strategy assistant. Return one practical content direction and concise posting advice.",
        },
        {
          role: "user",
          content: `User context: ${userPrompt}\n\nReturn exactly:\nCONTENT_DIRECTION: <2-4 words>\nWHY: <2 concise sentences>\nPOSTING_TIP: <1 concise sentence for a short-form reel>`,
        },
      ],
      max_tokens: 250,
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const matchDirection = raw.match(/CONTENT_DIRECTION:\s*(.+)/i);
    
    const matchWhy = raw.match(/WHY:\s*([\s\S]+?)(?=POSTING_TIP:|$)/i);
    const matchTip = raw.match(/POSTING_TIP:\s*(.+)/i);

    return res.status(200).json({
      direction: matchDirection?.[1]?.trim() || "",
      
      why: matchWhy?.[1]?.trim() || "",
      tip: matchTip?.[1]?.trim() || "",
      raw,
    });
  } catch (err) {
    console.error("JARVIS advice error:", err);
    return res.status(500).json({ error: err.message || "JARVIS request failed" });
  }
}



