# Working Places · Professional Hub

A modern multi-workspace web app with a collapsible sidebar and **10 Working Places**.

| # | Workspace | Status |
|---|-----------|--------|
| 1 | **Telegram** — login, read chats, send messages | Live |
| 2 | **World Cup Spot** — live scores, fixtures, table, official highlights | Live |
| 3 | **Temp Mail** — disposable inbox, persists after browser refresh | Live |
| 4 | **Facebook Recovery** — official forgot-password guide (own account only) | Live |
| 5 | **Bot Automation** — Telegram group custom auto-reply + Node worker | Live |
| 6 | **Session Extractor** — export own Telegram session (GramJS / Telethon / Pyrogram) | Live |
| 7–10 | Dev, Finance, CRM, Web | Coming soon |

### Session Extractor (WP06)

Exports the session already signed in via **WP01** (browser `localStorage` only).

1. Login on **WP01 · Telegram** with API ID/Hash from [my.telegram.org](https://my.telegram.org)
2. Open **Session** (WP06) → confirm security warning → **Extract session**
3. Copy or download **GramJS**, **Telethon**, and **Pyrogram** string sessions

**Warning:** a session string is full account access. Never share it.

### Telegram bot auto-reply (WP05)

Works **in the browser while the website tab is open** (no separate bot server).

1. Create bot with [@BotFather](https://t.me/BotFather), copy token  
2. Add bot to your group; `/setprivacy` → **Disable**  
3. Open **Bot Auto** → paste token → **Start auto-reply**  
4. Groups appear automatically → enable them → set keyword rules  
5. Keep the tab open on PC/mobile — close tab = stop  

Optional offline worker still available: `npm run bot` + `bot-config.json`

## Features

- Professional dark UI (sidebar + top bar + responsive mobile drawer)
- **Telegram Workspace**
  - API ID / API Hash setup ([my.telegram.org](https://my.telegram.org))
  - Phone login + OTP + 2FA cloud password
  - Chat list, message history, send message
  - Session stored only in your browser (`localStorage`)
- Ready for **Vercel** static deploy

## Stack

- React 19 + TypeScript + Vite
- GramJS (`telegram`) client for MTProto
- Lucide icons

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Deploy on Vercel

1. Import this GitHub repo in Vercel
2. Framework preset: **Vite**
3. Build command: `npm run build`
4. Output directory: `dist`
5. Deploy

No server env vars are required. Telegram API keys are entered in the UI and stay in the browser.

## Telegram setup

1. Open [https://my.telegram.org](https://my.telegram.org)
2. Log in → **API development tools**
3. Create an app → copy **api_id** and **api_hash**
4. In this site open **Telegram Workspace** and paste the keys
5. Login with phone + code (and 2FA if enabled)

## Security notes

- Do not commit real API credentials
- Sessions are local to the user’s browser
- Use only on trusted devices

## License

Private / personal use for the repository owner.
