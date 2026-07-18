/** Browser shim for Node `os` — GramJS/teleproto may touch this during client init. */
export function type() {
  return 'Browser'
}

export function platform() {
  return 'browser'
}

export function arch() {
  return 'x64'
}

export function release() {
  return '1.0.0'
}

export function hostname() {
  return 'web'
}

export function homedir() {
  return '/'
}

export function tmpdir() {
  return '/tmp'
}

export function cpus() {
  return []
}

export function networkInterfaces() {
  return {}
}

export function freemem() {
  return 0
}

export function totalmem() {
  return 0
}

export function endianness() {
  return 'LE'
}

export function loadavg() {
  return [0, 0, 0]
}

export function uptime() {
  return 0
}

export function userInfo() {
  return { username: 'web', uid: -1, gid: -1, shell: null, homedir: '/' }
}

export const EOL = '\n'
export const constants = {}

const os = {
  type,
  platform,
  arch,
  release,
  hostname,
  homedir,
  tmpdir,
  cpus,
  networkInterfaces,
  freemem,
  totalmem,
  endianness,
  loadavg,
  uptime,
  userInfo,
  EOL,
  constants,
}

export default os
