const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Generate a structured curriculum from user intent.
 * E.g. "learn python in 4 weeks" → { goal, duration, modules: [{ title, topics: [...], durationDays }] }
 */
async function buildCurriculum(goal, durationWeeks = 4) {
  const prompt = `You are an expert curriculum designer. Create a structured, week-by-week learning plan for: "${goal}" over ${durationWeeks} weeks.

Return ONLY valid JSON in this format:
{
  "goal": "string",
  "durationWeeks": number,
  "modules": [
    {
      "title": "Week 1: Basics",
      "durationDays": 7,
      "topics": ["topic 1", "topic 2", "topic 3"]
    }
  ]
}

Keep topics practical and progressive. Each module should have 3-5 topics. No extra text—just the JSON.`;

  const res = await groq.chat.completions.create({
    model: 'llama3-70b-8192',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    max_tokens: 2000,
  });

  const text = res.choices[0].message.content;
  // Extract JSON from potential markdown
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

module.exports = { buildCurriculum };
