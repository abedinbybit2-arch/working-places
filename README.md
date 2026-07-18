# Working Places · Professional Hub

A modern multi-workspace web app with a collapsible sidebar and **10 Working Places**.

| # | Workspace | Status |
|---|-----------|--------|
| 1 | **Telegram** — login, read chats, send messages | Live |
| 2 | **World Cup Spot** — live scores, fixtures, table, official highlights | Live |
| 3 | **Temp Mail** — disposable inbox, persists after browser refresh | Live |
| 4–10 | Bots, Cloud, Security, Dev, Finance, CRM, Web | Coming soon |

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
