import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPTS = {
  forest:
    "Ancient towering redwood forest shrouded in thick morning mist, shafts of golden light piercing through a dense canopy, deep emerald shadows, cinematic depth, moody and powerful atmosphere, vertical 9:16 framing, no people, no text",
  ocean:
    "Massive storm waves crashing against dark sea cliffs at dusk, dramatic sky with deep navy and charcoal clouds, foam and spray catching last light, raw and cinematic power, vertical 9:16 framing, no people, no text",
  moonlight:
    "Full moon rising behind dramatic mountain silhouettes, ethereal silver and indigo light spilling across low clouds, deep star-filled sky, breathtaking and cinematic, long exposure quality, vertical 9:16 framing, no people, no text",
  sakura:
    "Cherry blossom branches in full bloom at night against a dark indigo sky, soft pink petals drifting, moonlight casting dramatic shadows, cinematic beauty and melancholy, vertical 9:16 framing, no people, no text",
  city:
    "Aerial city skyline at night with dramatic light trails below, towering glass skyscrapers reflecting neon glow, deep shadows and premium cinematic quality, powerful urban atmosphere, vertical 9:16 framing, no people, no text",
  gym: "Dramatic empty professional gym, heavy iron barbells and plates under a single spotlight, dark concrete walls with steam, raw power and focus, cinematic shadows and contrast, vertical 9:16 framing, no people, no text",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { templateId } = req.body;
  const prompt = PROMPTS[templateId];

  if (!prompt) {
    return res.status(400).json({ error: "Invalid template id: " + templateId });
  }

  try {
    const imgRes = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1792",
      quality: "standard",
      response_format: "b64_json",
    });

    const b64 = imgRes.data[0].b64_json;
    if (!b64) {
      return res.status(500).json({ error: "No image data returned" });
    }

    return res.status(200).json({ image: "data:image/png;base64," + b64 });
  } catch (err) {
    console.error("Image generation error:", err);
    return res.status(500).json({ error: err.message });
  }
}
