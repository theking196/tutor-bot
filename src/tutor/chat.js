const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Generate a tutor response with curriculum awareness.
 *
 * @param {Object} session - session state { curriculum, currentModule, currentTopic, history[] }
 * @param {string} userMessage - latest message from student
 * @param {boolean} enableSearch - whether to inject web search context
 * @param {string} searchResults - optional concatenated web results
 * @returns {Promise<{ text: string, voiceText?: string, nextAction?: string, quiz?: object }>}
 */
async function tutorResponse(session, userMessage, enableSearch = false, searchResults = '') {
  const { curriculum, currentModule = 0, currentTopic = 0, history = [], quizBuffer = [] } = session;

  const contextParts = [];

  // System persona
  contextParts.push(`You are a patient, enthusiastic tutor. Respond conversationally, ask Socratic questions, and adapt to the student's level.`);

  // Curriculum scaffold if available
  if (curriculum) {
    contextParts.push(`You are currently teaching "${curriculum.goal}" with a ${curriculum.durationWeeks}-week plan.`);

    if (curriculum.modules && curriculum.modules.length > currentModule) {
      const mod = curriculum.modules[currentModule];
      contextParts.push(`Today's topic is in module: "${mod.title}". Focus on these subtopics: ${mod.topics.join(', ')}.`);
    }
  }

  // If there are queued quiz questions, prioritize them
  if (quizBuffer.length > 0) {
    const q = quizBuffer[0];
    contextParts.push(`Use this as an active quiz. Ask: "${q.question}". After the student answers, say if it's correct. ` + (q.explanation ? `Then explain: ${q.explanation}` : ''));
  } else {
    // Normal lesson flow: include relevant info
    contextParts.push('Do not just dump facts; ask questions, check understanding, and keep responses concise. End with something for the student to think about or try.');
  }

  // Inject web search if provided
  if (enableSearch && searchResults) {
    contextParts.push(`Here are some fresh web results to inform your answer: ${searchResults}`);
  }

  const systemMsg = contextParts.join('\n\n');

  // Build message history (last 8 exchanges)
  const messages = history.slice(-16).map(h => ({ role: h.role, content: h.content }));

  // Prepend system context
  messages.unshift({ role: 'system', content: systemMsg });

  // Append user message
  messages.push({ role: 'user', content: userMessage });

  const response = await groq.chat.completions.create({
    model: 'llama3-70b-8192',
    messages,
    temperature: 0.7,
    max_tokens: 600,
  });

  let reply = response.choices[0].message.content.trim();

  // Determine if we should also output voice-friendly text (strip heavy code blocks, emojis)
  const voiceText = stripForVoice(reply);

  // Detect quiz intention: if the bot asked something that expects an answer, leave quiz buffer alone.
  // If buffer is consumed, remove it.
  let nextAction = 'respond';
  let newQuizBuffer = quizBuffer;
  if (quizBuffer.length > 0) {
    newQuizBuffer = [];
    // Mark as quiz step. We'll record result elsewhere.
    nextAction = 'quizAnswered';
  }

  return { text: reply, voiceText, nextAction, quiz: newQuizBuffer[0] || null };
}

/**
 * Generate 3-5 quiz questions for the current topic.
 * Return array of { question, options?: [...], answer?: string, explanation?: string }
 */
async function generateQuiz(topic) {
  const prompt = `Generate 3 quiz questions about "${topic}" in a conversational tutoring context. Each question should test understanding and be varied.

Return JSON:
{
  "questions": [
    { "type": "multiple_choice", "question": "...", "options": ["A", "B", "C", "D"], "answer": "A", "explanation": "..." },
    { "type": "short_answer", "question": "...", "answer": "...", "explanation": "..." }
  ]
}

Keep it simple. No other text.`;

  const res = await groq.chat.completions.create({
    model: 'llama3-70b-8192',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 1200,
  });

  const text = res.choices[0].message.content;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  const parsed = JSON.parse(match[0]);
  return parsed.questions || [];
}

function stripForVoice(text) {
  // Remove code blocks, excessive formatting. Keep paragraphs, but no markdown fences.
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/~~/g, '').replace(/\[.*?\]\(.*?\)/g, '').trim();
}

module.exports = { tutorResponse, generateQuiz, stripForVoice };
