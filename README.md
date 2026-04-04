# TutorBot

An AI-powered tutor that lives in Telegram. It builds a curriculum on the fly, teaches interactively, sends voice notes, quizzes you, and even does web searches for fresh info.

## Features

- **Curriculum builder** — `/plan <topic> [weeks]` auto‑generates a structured lesson plan.
- **Live teaching** — conversational, adaptive, with follow‑up questions and examples.
- **Voice notes** — optional TTS via ElevenLabs (toggle with `/voice on|off`).
- **Quizzes** — `/quiz` auto generates MCQs/short‑answer based on current topic, tracks score.
- **Spaced review** — quizzes resurface weak areas.
- **Web search** — bot searches DuckDuckGo when you ask about "latest ..." and merges results.
- **Progress** — `/status` shows lesson completion, quiz score.
- **All in Telegram** — no external UI required.

## Tech Stack

- Node.js + Telegraf
- Groq (LLama 3 via Groq API) — fast AI responses
- ElevenLabs for voice
- lowdb for persistence (JSON file)
- DuckDuckGo Instant Answer API
- Deployable on Railway (free tier)

## Setup

1. Create a Telegram bot via @BotFather → get `TELEGRAM_BOT_TOKEN`.
2. (Optional) ElevenLabs API key for voice → `ELEVEN_API_KEY` and `ELEVEN_VOICE_ID`.
3. Get a Groq API key from https://groq.com.
4. Create a Railway service or use local `.env`:
```bash
git clone https://github.com/theking196/tutor-bot.git
cd tutor-bot
cp .env.example .env
# edit .env with your credentials
npm install
npm start
```
5. Send your bot `/start` and then `/plan Python` (or any topic).

## Environment Variables

| Variable | Required? | Description |
|----------|-----------|-------------|
| `TELEGRAM_BOT_TOKEN` | yes | Bot token from @BotFather |
| `TELEGRAM_ADMIN_CHAT_ID` | no | Your Telegram user ID; not used yet |
| `GROQ_API_KEY` | yes | Groq API key |
| `ELEVEN_API_KEY` | no | ElevenLabs API key for voice notes |
| `ELEVEN_VOICE_ID` | no (default) | Default is Adam; change in .env |
| `PORT` | no (default 3000) | Health endpoint & server port |
| `DATABASE_PATH` | no (default `data/tutor.json`) | Path to DB file |

## Commands

| Command | Purpose |
|---------|---------|
| `/start` | Initialize user |
| `/plan <topic> [weeks]` | Generate curriculum (default 4 weeks) |
| `/next` | Deliver the next lesson in the curriculum |
| `/quiz` | Generate and send a quiz on the current topic |
| `/status` | View progress & quiz scores |
| `/voice on\|off` | Enable/disable voice notes |
| `/help` | Show commands |

Simply chatting with the bot after a curriculum is set will continue the lesson conversationally; ask anything and the bot adapts.

## Data Model

- `users`: `{ chatId, username, curriculum, voiceEnabled, ... }`
- `sessions`: `{ chatId, curriculum, currentModule, currentTopic, history[], quizBuffer, quizScore, weakAreas, ... }`

Data is stored in a single JSON file via `lowdb`.

## Deployment to Railway

1. Fork this repo.
2. Create a new project in Railway → `Deploy from GitHub repo`.
3. Service: Node.js.
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables in Railway dashboard.
7. Healthcheck: `/health` (provided).

[ ![Deploy on Railway](https://railway.app/button.svg) ](https://railway.com/new/template?template=https://github.com/theking196/tutor-bot/tree/main)

## Roadmap

- Spaced repetition for flashcards
- Code execution in sandbox (Docker) for programming students
- Export curriculum & progress to PDF
- Multi‑language support
- Group tutoring mode

## License

MIT

---

Made with patience and Groq. 🎓
