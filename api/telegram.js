/**
 * Same-site proxy so the browser can call Telegram Bot API without CORS.
 * No separate bot server — only while the website tab is open (client polls).
 * Body: { token: string, method: string, params?: object }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, description: 'POST only' })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const token = String(body.token || '').trim()
    const method = String(body.method || '').trim()
    const params = body.params && typeof body.params === 'object' ? body.params : {}

    if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
      res.status(400).json({ ok: false, description: 'Invalid bot token format' })
      return
    }
    if (!method || !/^[a-zA-Z]+$/.test(method)) {
      res.status(400).json({ ok: false, description: 'Invalid method' })
      return
    }

    const url = `https://api.telegram.org/bot${token}/${method}`
    const tgRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    const data = await tgRes.json()
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({
      ok: false,
      description: e instanceof Error ? e.message : 'Proxy error',
    })
  }
}
