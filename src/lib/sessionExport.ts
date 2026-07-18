/**
 * Telegram session parse + export helpers.
 *
 * Formats:
 * - GramJS (web): "1" + base64(dc + len + host + port + authKey)
 * - Telethon:     "1" + base64(dc + ipv4(4) + port + authKey)  [352-char body]
 * - Pyrogram:     urlsafe_b64(>BI?256sQ? = dc, api_id, test, auth, user_id, is_bot)
 *
 * Session strings give full account access — only for the owner's own account.
 */

import { Buffer } from 'buffer'

/** Official Telegram production DC IPv4 (used by Telethon StringSession). */
export const DC_IPV4: Record<number, string> = {
  1: '149.154.175.53',
  2: '149.154.167.51',
  3: '149.154.175.100',
  4: '149.154.167.91',
  5: '91.108.56.130',
}

export type ParsedSession = {
  dcId: number
  serverAddress: string
  port: number
  authKey: Buffer
  format: 'gramjs' | 'telethon'
}

export type ExportedSessions = {
  gramjs: string
  telethon: string
  pyrogram: string
  dcId: number
  serverAddress: string
  port: number
  apiId: number
  userId: string
  isBot: boolean
}

/** Standard base64 (GramJS). */
function b64Encode(buf: Buffer): string {
  return buf.toString('base64')
}

/**
 * URL-safe base64 WITH padding.
 * Node's `base64url` omits `=`; Telethon StringSession body is 352 chars with padding.
 */
function b64UrlEncodePadded(buf: Buffer): string {
  const s = buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
  return s
}

/** URL-safe base64 without padding (Pyrogram). */
function b64EncodeNoPad(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function parseIpv4(host: string): string | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host
  return null
}

/**
 * Parse a GramJS or Telethon string session (version "1").
 */
export function parseSessionString(sessionString: string): ParsedSession {
  const raw = sessionString.trim()
  if (!raw || raw[0] !== '1') {
    throw new Error('Invalid session: must start with version "1"')
  }

  const body = raw.slice(1)
  if (!body) throw new Error('Invalid session: empty body')

  let data: Buffer
  try {
    data = Buffer.from(body, 'base64')
  } catch {
    throw new Error('Invalid session: base64 decode failed')
  }

  if (data.length < 1 + 2 + 256) {
    throw new Error('Invalid session: too short')
  }

  // Telethon: body base64 length is 352 → 263 bytes (dc + ipv4 + port + key)
  if (body.length === 352 || data.length === 263) {
    const dcId = data.readUInt8(0)
    const serverAddress = `${data[1]}.${data[2]}.${data[3]}.${data[4]}`
    const port = data.readUInt16BE(5)
    const authKey = Buffer.from(data.subarray(7, 7 + 256))
    if (authKey.length !== 256) throw new Error('Invalid Telethon session: auth key length')
    return { dcId, serverAddress, port, authKey, format: 'telethon' }
  }

  // GramJS web: dc(1) + addrLen(2 BE) + addr + port(2 BE) + authKey(256)
  let offset = 0
  const dcId = data.readUInt8(offset)
  offset += 1
  const addrLen = data.readInt16BE(offset)
  offset += 2

  if (addrLen < 0 || addrLen > 200 || offset + addrLen + 2 + 256 > data.length) {
    throw new Error('Invalid GramJS session: bad address length')
  }

  const serverAddress = Buffer.from(data.subarray(offset, offset + addrLen)).toString('utf8')
  offset += addrLen
  const port = data.readUInt16BE(offset)
  offset += 2
  const authKey = Buffer.from(data.subarray(offset, offset + 256))
  if (authKey.length !== 256) throw new Error('Invalid GramJS session: auth key length')

  return { dcId, serverAddress, port, authKey, format: 'gramjs' }
}

/** Write unsigned 64-bit big-endian (browser Buffer typings may lack writeBigUInt64BE). */
function writeUInt64BE(buf: Buffer, value: bigint, offset: number) {
  const hi = Number((value >> 32n) & 0xffffffffn)
  const lo = Number(value & 0xffffffffn)
  buf.writeUInt32BE(hi >>> 0, offset)
  buf.writeUInt32BE(lo >>> 0, offset + 4)
}

/** Build GramJS web-style string session (hostname form, matches WP01 storage). */
export function toGramJsSession(parsed: ParsedSession): string {
  const address = Buffer.from(parsed.serverAddress || DC_IPV4[parsed.dcId] || '', 'utf8')
  if (!address.length) throw new Error(`Unknown DC ${parsed.dcId} — cannot build GramJS session`)

  const dcBuffer = Buffer.from([parsed.dcId])
  const addressLengthBuffer = Buffer.alloc(2)
  addressLengthBuffer.writeInt16BE(address.length, 0)
  const portBuffer = Buffer.alloc(2)
  portBuffer.writeInt16BE(parsed.port || 443, 0)

  return (
    '1' +
    b64Encode(Buffer.concat([dcBuffer, addressLengthBuffer, address, portBuffer, parsed.authKey]))
  )
}

/** Build Telethon StringSession (IPv4 packed). */
export function toTelethonSession(parsed: ParsedSession): string {
  const ip =
    parseIpv4(parsed.serverAddress) ||
    DC_IPV4[parsed.dcId] ||
    null
  if (!ip) throw new Error(`Unknown DC ${parsed.dcId} — cannot map IPv4 for Telethon`)

  const parts = ip.split('.').map((n) => Number(n))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid IPv4 for DC ${parsed.dcId}: ${ip}`)
  }

  const buf = Buffer.alloc(1 + 4 + 2 + 256)
  buf.writeUInt8(parsed.dcId, 0)
  buf[1] = parts[0]
  buf[2] = parts[1]
  buf[3] = parts[2]
  buf[4] = parts[3]
  buf.writeUInt16BE(parsed.port || 443, 5)
  parsed.authKey.copy(buf, 7)

  // Telethon uses urlsafe base64 with padding (body length 352)
  return '1' + b64UrlEncodePadded(buf)
}

/**
 * Build Pyrogram string session.
 * Format: struct.pack(">BI?256sQ?", dc_id, api_id, test_mode, auth_key, user_id, is_bot)
 */
export function toPyrogramSession(
  parsed: ParsedSession,
  apiId: number,
  userId: number | bigint | string,
  isBot = false,
  testMode = false,
): string {
  if (!apiId || apiId < 1) throw new Error('API ID is required for Pyrogram session')

  let uid: bigint
  try {
    uid = BigInt(userId)
  } catch {
    throw new Error('Invalid user id for Pyrogram session')
  }
  if (uid < 0n) throw new Error('Invalid user id for Pyrogram session')

  // > B I ? 256s Q ?
  // sizes: 1 + 4 + 1 + 256 + 8 + 1 = 271
  const buf = Buffer.alloc(271)
  let o = 0
  buf.writeUInt8(parsed.dcId, o)
  o += 1
  buf.writeUInt32BE(apiId >>> 0, o)
  o += 4
  buf.writeUInt8(testMode ? 1 : 0, o)
  o += 1
  parsed.authKey.copy(buf, o)
  o += 256
  writeUInt64BE(buf, uid, o)
  o += 8
  buf.writeUInt8(isBot ? 1 : 0, o)

  return b64EncodeNoPad(buf)
}

export function buildExports(params: {
  sessionString: string
  apiId: number
  userId: number | bigint | string
  isBot?: boolean
}): ExportedSessions {
  const parsed = parseSessionString(params.sessionString)
  const gramjs =
    parsed.format === 'gramjs' ? params.sessionString.trim() : toGramJsSession(parsed)
  const telethon = toTelethonSession(parsed)
  const pyrogram = toPyrogramSession(
    parsed,
    params.apiId,
    params.userId,
    params.isBot ?? false,
  )

  return {
    gramjs,
    telethon,
    pyrogram,
    dcId: parsed.dcId,
    serverAddress: parseIpv4(parsed.serverAddress) || DC_IPV4[parsed.dcId] || parsed.serverAddress,
    port: parsed.port || 443,
    apiId: params.apiId,
    userId: String(params.userId),
    isBot: params.isBot ?? false,
  }
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
