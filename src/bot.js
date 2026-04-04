const { Telegraf } = require('telegraf');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const { webSearch } = require('./search/web');
const { synthesizeSpeech } = require('./voice/tts');
const { transcribeAudio } = require('./speech/stt');
const db = require('./db/github-store');
const { tutorResponse, generateQuiz } = require('./tutor/chat');
const { buildCurriculum } = require('./commands/curriculum');
const { ensureGitHubMemory } = require('./setup');

// ── Bot setup ──
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ── /start ──
bot.start(async (ctx) => {
  const chatId = ctx.chat.id;

  // On first load, ensure env keys are working
  if (!db.initialized) {
    try {
      await ensureGitHubMemory();
    } catch (e) {
      return ctx.reply(`⚠️ Setup error: ${e.message}\n\nMake sure GROQ_API_KEY and GITHUB_TOKEN/GITHUB_REPO are set.`, { parse_mode: 'Markdown' });
    }
  }

  db.getOrCreateUser(chatId, ctx.from.username || '');
  await ctx.reply(`👋 Welcome to **TutorBot**! I'm your personal AI tutor.

**Commands:**
/plan <topic> [weeks] — build a curriculum
/next — deliver the next lesson
/quiz — quick quiz on current topic
/status — your progress
/voice on|off — toggle voice notes

I can also *listen to your voice notes* — just send me audio and I'll respond!`, { parse_mode: 'Markdown' });
});

// ── /help ──
bot.help(async (ctx) => {
  await ctx.reply('/plan <topic> [weeks] — build curriculum\n/next — next lesson\n/quiz — practice quiz\n/status — progress\n/voice on|off — voice notes');
});

// ── /plan ──
bot.command('plan', async (ctx) => {
  const parts = ctx.message.text.split(' ').slice(1);
  if (!parts.length) return ctx.reply('Usage: /plan <topic> [weeks]');

  const topic = parts[0];
  const weeks = parseInt(parts[1]) || 4;
  const chatId = ctx.chat.id;

  await ctx.reply('⏳ Designing your curriculum...');
  try {
    const curriculum = await buildCurriculum(topic, weeks);
    if (!curriculum?.modules?.length) throw new Error('empty plan');

    db.openSession(chatId, curriculum);

    const summary = `📘 *${curriculum.goal}* — ${curriculum.durationWeeks} weeks\n\n` +
      curriculum.modules.map((m, i) => `*Week ${i+1}*: ${m.title}\n   Topics: ${m.topics.join(' · ')}`).join('\n');
    await ctx.reply(summary, { parse_mode: 'Markdown' });
    await ctx.reply('🚀 Your curriculum is ready! Use `/next` to start.', { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[plan]', err);
    await ctx.reply('❌ Failed to create plan. Make sure GROQ_API_KEY is valid.', { parse_mode: 'Markdown' });
  }
});

// ── /next ──
bot.command('next', async (ctx) => {
  await deliverNextLesson(ctx.chat.id, ctx);
});

async function deliverNextLesson(chatId, ctx) {
  const session = await db.getSession(chatId);
  if (!session) return ctx.reply('No curriculum yet. Use `/plan` first.', { parse_mode: 'Markdown' });

  const curriculum = session.curriculum;
  const mod = curriculum.modules?.[session.currentModule];
  if (!mod) return ctx.reply('✅ You\'ve completed the full curriculum!', { parse_mode: 'Markdown' });

  const topicIdx = session.currentTopic;
  if (topicIdx >= mod.topics.length) {
    if (session.currentModule + 1 < curriculum.modules.length) {
      await db.updateSession(chatId, { currentModule: session.currentModule + 1, currentTopic: 0 });
      return deliverNextLesson(chatId, ctx);
    }
    return ctx.reply('✅ Done! 🎉', { parse_mode: 'Markdown' });
  }

  const topic = mod.topics[topicIdx];
  const title = `📚 Week ${session.currentModule + 1} — ${mod.title}\n🎯 **Topic**: ${topic}\n`;

  const { text, voiceText } = await tutorResponse(session, `Teach the topic "${topic}" simply. Give a quick real-world example, then ask one follow-up question. Keep it conversational and under 300 words.`, false);

  await ctx.reply(`${title}\n\n${text}`, { parse_mode: 'Markdown' });

  await db.updateSession(chatId, { currentTopic: topicIdx + 1 });
  await maybeSendVoice(ctx, chatId, voiceText);
}

// ── /quiz ──
bot.command('quiz', async (ctx) => {
  const chatId = ctx.chat.id;
  const session = await db.getSession(chatId);
  if (!session) return ctx.reply('No curriculum yet. Use `/plan` first.', { parse_mode: 'Markdown' });

  await ctx.reply('⏳ Preparing quiz...');

  const mod = session.curriculum.modules?.[session.currentModule];
  const topic = mod?.topics[session.currentTopic - 1] || mod?.topics[0] || 'what you just learned';

  try {
    const questions = await generateQuiz(topic);
    if (!questions.length) throw new Error('no questions');

    await db.updateSession(chatId, { quizBuffer: questions, quizMode: true });

    const q = questions[0];
    let qText = `**Question 1/${questions.length}**\n\n${q.question}`;
    if (q.options) qText += '\n\n' + q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
    await ctx.reply(qText, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[quiz]', err);
    await ctx.reply('❌ Could not generate quiz.', { parse_mode: 'Markdown' });
  }
});

// ── /status ──
bot.command('status', async (ctx) => {
  const session = await db.getSession(ctx.chat.id);
  if (!session) return ctx.reply('🔁 No active session. Start with `/plan`.', { parse_mode: 'Markdown' });

  const s = session.quizScore;
  const pct = s.total > 0 ? Math.round(s.correct / s.total * 100) : 0;
  await ctx.reply(`📊 Progress\n🏃 Module: ${session.currentModule + 1}/${session.curriculum.modules.length}\n📖 Topic: ${session.currentTopic}/${session.curriculum.modules[session.currentModule]?.topics.length || '?'}` + `\n🎯 Quiz: ${s.correct}/${s.total} (${pct}%)`);
});

// ── /voice ──
bot.command('voice', async (ctx) => {
  const arg = ctx.message.text.split(' ')[1]?.toLowerCase();
  if (!arg || !['on', 'off'].includes(arg)) return ctx.reply('Usage: /voice on|off');
  await db.updateUser(ctx.chat.id, { voiceEnabled: arg === 'on' });
  await ctx.reply(`🔊 Voice notes ${arg === 'on' ? 'enabled' : 'disabled'}.`);
});

// ── Voice note handler (Groq Whisper) ──
bot.on('voice', async (ctx) => {
  const chatId = ctx.chat.id;
  db.getOrCreateUser(chatId, ctx.from.username || '');

  // Download voice file
  const file = await ctx.telegram.getFile(ctx.message.voice.file_id);
  const tmpFile = path.join(os.tmpdir(), `voice-${Date.now()}.${file.file_path.split('.').pop()}`);
  await ctx.telegram.getFileLink(ctx.message.voice.file_id).then(async url => {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    await fs.writeFile(tmpFile, Buffer.from(buf));
  });

  try {
    await ctx.reply('🎙️ Listening...');

    // Transcribe via Groq
    const transcript = await transcribeAudio(tmpFile, 'en');

    if (!transcript.trim()) {
      return ctx.reply("I couldn't understand that. Try speaking clearer or typing.");
    }

    await ctx.reply(`📝 You said: "${transcript}"`);
    await processMessage(ctx.chat.id, transcript, ctx);
  } catch (err) {
    console.error('[voice]', err);
    await ctx.reply('❌ Voice transcription failed. Try again or type your message.');
  } finally {
    fs.unlink(tmpFile).catch(() => {});
  }
});

// ── Catch-all text ──
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();
  db.getOrCreateUser(chatId, ctx.from.username || '');
  const session = await db.getSession(chatId);

  // If quiz mode, handle quiz answer
  if (session?.quizMode && session?.quizBuffer?.length) {
    await handleQuizAnswer(ctx, session, text, chatId);
    return;
  }

  await processMessage(chatId, text, ctx);
});

async function processMessage(chatId, text, ctx) {
  const session = await db.getSession(chatId);

  // Web search check
  const needsWeb = /\b(latest|news|recent|update|search|find)\b/i.test(text);
  let searchResults = '';
  if (needsWeb) {
    try { searchResults = await webSearch(text); } catch (e) { console.warn('[search]', e.message); }
  }

  try {
    const resp = await tutorResponse(session || {}, text, !!searchResults, searchResults);

    if (!session) {
      await db.openSession(chatId, { goal: text, durationWeeks: 4, modules: [] });
    }

    await db.appendHistory(chatId, 'user', text);
    await db.appendHistory(chatId, 'assistant', resp.text);

    await ctx.reply(resp.text);
    await maybeSendVoice(ctx, chatId, resp.voiceText);
  } catch (err) {
    console.error('[tutor]', err);
    await ctx.reply('Oops — try again or type `/start`.', { parse_mode: 'Markdown' });
  }
}

async function maybeSendVoice(ctx, chatId, text) {
  const user = await db.getUser(chatId);
  if (!user?.voiceEnabled || !text) return;
  try {
    const p = await synthesizeSpeech(text);
    if (p) await ctx.replyWithVoice({ source: p });
  } catch (e) {
    console.warn('[tts]', e.message);
  }
}

async function handleQuizAnswer(ctx, session, answer, chatId) {
  const q = session.quizBuffer[0];
  let isCorrect = false;

  if (q.type === 'multiple_choice' && q.options) {
    const idx = answer.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < q.options.length) isCorrect = q.options[idx] === q.answer;
  } else if (q.type === 'short_answer') {
    isCorrect = answer.toLowerCase().includes(q.answer.toLowerCase());
  }

  await db.recordQuizResult(chatId, isCorrect);
  session.quizBuffer.shift();
  const quizMode = session.quizBuffer.length > 0;
  await db.updateSession(chatId, { quizBuffer: session.quizBuffer.slice(), quizMode });

  const feedback = isCorrect ? '✅ Correct!' : `❌ The answer was: ${q.answer}`;
  const expl = q.explanation ? '\n\n' + q.explanation : '';
  await ctx.reply(feedback + expl);

  if (session.quizBuffer.length > 0) {
    await new Promise(r => setTimeout(r, 500));
    const nq = session.quizBuffer[0];
    const idx = session.quizScore.total;
    let qText = `**Question ${idx + 1}/${session.quizBuffer.length + idx}**\n\n${nq.question}`;
    if (nq.options) qText += '\n\n' + nq.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
    await ctx.reply(qText, { parse_mode: 'Markdown' });
  } else {
    const s = session.quizScore;
    await ctx.reply(`🏁 Quiz done! Score: ${s.correct}/${s.total}. /next to continue!`, { parse_mode: 'Markdown' });
  }
}

// ── Launch ──
function start() {
  bot.launch();
  console.log('🎓 TutorBot running...');
}

module.exports = { bot, start };
