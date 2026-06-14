// MiMo Free API — JWT Bootstrap + Token 管理

const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const path = require('path')

const BOOTSTRAP_URL = 'https://api.xiaomimimo.com/api/free-ai/bootstrap'

let cachedJwt = null
let cachedExp = 0
let inflightBootstrap = null

function getClientFingerprint() {
  const cpu = os.cpus()[0]?.model || 'unknown-cpu'
  let username = 'unknown-user'
  try { username = os.userInfo().username } catch {}
  const seed = [os.hostname(), process.platform, process.arch, cpu, username].join('|')
  return crypto.createHash('sha256').update(seed).digest('hex')
}

function parseJwtExp(jwt) {
  try {
    const parts = jwt.split('.')
    if (parts.length < 2) return Date.now() + 50 * 60_000
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
    if (typeof payload.exp === 'number') return payload.exp * 1000
  } catch {}
  return Date.now() + 50 * 60_000
}

async function bootstrap() {
  const fingerprint = getClientFingerprint()
  const res = await fetch(BOOTSTRAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client: fingerprint }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`MiMo bootstrap failed: ${res.status} ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  if (!data.jwt) throw new Error('MiMo bootstrap response missing jwt')
  return { jwt: data.jwt, exp: parseJwtExp(data.jwt) }
}

const REFRESH_BUFFER_MS = 5 * 60_000

async function getJwt() {
  if (cachedJwt && cachedExp - Date.now() > REFRESH_BUFFER_MS) return cachedJwt
  if (inflightBootstrap) return (await inflightBootstrap).jwt
  cachedJwt = null
  inflightBootstrap = bootstrap()
  try {
    const result = await inflightBootstrap
    cachedJwt = result.jwt
    cachedExp = result.exp
    return result.jwt
  } finally {
    inflightBootstrap = null
  }
}

function clearCache() {
  cachedJwt = null
  cachedExp = 0
  inflightBootstrap = null
}

module.exports = { getJwt, clearCache, bootstrap, getClientFingerprint }
