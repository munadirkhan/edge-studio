import OpenAI from "openai";

let _openai;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export async function findViralMoments(transcription, videoDuration, clipCount = 3, clipDuration = 60) {
  const segments = transcription.segments || [];
  const fullText = transcription.text || "";

  // Build a compact segment map: "00:32 - 01:14: text..."
  const segmentMap = segments
    .map((s) => `${fmt(s.start)} - ${fmt(s.end)}: ${s.text.trim()}`)
    .join("\n");

  const prompt = `You are a viral short-form video editor. Analyze this transcript and find the ${clipCount} best moments for TikTok/Instagram Reels.

VIDEO TRANSCRIPT WITH TIMESTAMPS:
${segmentMap.slice(0, 12000)}

RULES:
- Each clip must be ${clipDuration} seconds or less
- Pick moments that are self-contained — they must make sense without context
- Prioritize: emotional peaks, surprising facts, strong opinions, story climaxes, actionable advice
- Avoid: intros, outros, sponsor reads, transitions
- Each clip needs a punchy hook (the opening words), not just a description
- Score each clip 0-100 for viral potential (engagement, shareability, emotional hook, surprise factor)

Return EXACTLY this JSON (no markdown, no explanation):
{
  "clips": [
    {
      "rank": 1,
      "start": <seconds as number>,
      "end": <seconds as number>,
      "viralScore": <0-100 integer>,
      "title": "<5-8 word punchy title>",
      "hook": "<exact opening words from the transcript that start this clip>",
      "reason": "<one sentence on why this moment goes viral>",
      "caption": "<2-3 sentence TikTok caption for this clip>"
    }
  ]
}`;

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1500,
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0].message.content;
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("GPT returned invalid JSON for viral moments"); }

  // Validate and clamp timestamps
  return (parsed.clips || [])
    .map((clip) => {
      const start = Math.max(0, Math.round(clip.start));
      const end   = Math.min(videoDuration, Math.round(clip.end));
      return { ...clip, start, end, duration: end - start, viralScore: Math.min(100, Math.max(0, Math.round(clip.viralScore || 70))) };
    })
    .filter((clip) => clip.duration > 0);
}

function fmt(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
