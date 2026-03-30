import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPTS = {
  night_sky: "A breathtaking starry night sky over vast desert sand dunes, deep navy blue atmosphere, hundreds of bright stars and a glowing moon, golden light on sand, rich and detailed, no people",
  desert_dawn: "Golden sunrise over layered desert sand dunes, warm amber and orange light rays, rich texture in sand, atmospheric depth, beautiful and detailed, no people",
  geometric: "Intricate Islamic geometric mosaic tiles, deep teal and gold colors, ornate tessellation pattern, polished marble surface, beautiful symmetrical design, detailed and rich",
  garden: "Lush peaceful garden with flowing water fountain, green plants and white flowers, golden sunlight filtering through leaves, serene and beautiful, no people",
  architecture: "Grand Islamic architecture interior, ornate marble arches, geometric carvings, warm golden light streaming through windows, rich detail and depth, no people",
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
      prompt: prompt,
      n: 1,
      size: "1024x1792",
      quality: "standard",
      response_format: "b64_json",
    });

    const b64 = imgRes.data[0].b64_json;

    if (!b64) {
      return res.status(500).json({ error: "DALL-E returned no image data" });
    }

    return res.status(200).json({ image: "data:image/png;base64," + b64 });
  } catch (err) {
    console.error("DALL-E error:", err);
    return res.status(500).json({ error: err.message });
  }
} 