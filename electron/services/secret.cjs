// API Key 安全存储：electron.safeStorage 加密
// 落库格式：settings 表的 'apiKeys.encrypted' 键，存放 { [providerId]: base64(encryptedBuffer) }
// 兼容旧版：首次读取时透明迁移 'apiKeys'（明文 JSON）→ 'apiKeys.encrypted'，并清空旧键
//
// safeStorage 不可用时（Linux 无 keyring 等极端情况）退化为 base64 明显标记的"伪加密"，
// 至少把明文从 SQLite 移除；UI 应在 isEncryptionAvailable() 为 false 时给出提示

const { safeStorage } = require('electron')
const { getDb } = require('./database.cjs')

const KEY_ENCRYPTED = 'apiKeys.encrypted'
const KEY_LEGACY_PLAINTEXT = 'apiKeys'

function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encrypt(plain) {
  if (!plain) return ''
  if (isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(plain)
    return 'enc:v1:' + buf.toString('base64')
  }
  // 退化方案：标记为 b64，至少不是赤裸明文（提醒后续读取者）
  return 'b64:v1:' + Buffer.from(plain, 'utf-8').toString('base64')
}

function decrypt(stored) {
  if (!stored) return ''
  if (stored.startsWith('enc:v1:')) {
    if (!isEncryptionAvailable()) {
      throw new Error('safeStorage unavailable, cannot decrypt prior enc:v1 record')
    }
    const buf = Buffer.from(stored.slice(7), 'base64')
    return safeStorage.decryptString(buf)
  }
  if (stored.startsWith('b64:v1:')) {
    return Buffer.from(stored.slice(7), 'base64').toString('utf-8')
  }
  // 异常 / 旧格式：当作已经是明文（防御性，避免崩溃）
  return stored
}

function readEncryptedMap() {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY_ENCRYPTED)
  if (!row) return {}
  try {
    const parsed = JSON.parse(row.value)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function writeEncryptedMap(map) {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(KEY_ENCRYPTED, JSON.stringify(map))
}

/** 一次性把旧版明文 JSON 迁移到加密表，迁移完成后删除旧键 */
function migrateLegacyIfNeeded() {
  const db = getDb()
  const legacy = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY_LEGACY_PLAINTEXT)
  if (!legacy) return

  let parsed
  try { parsed = JSON.parse(legacy.value) } catch { parsed = null }

  if (parsed && typeof parsed === 'object') {
    const enc = readEncryptedMap()
    let migrated = 0
    for (const [provider, key] of Object.entries(parsed)) {
      if (typeof key !== 'string' || !key) continue
      if (enc[provider]) continue // 不覆盖加密表里已有的
      enc[provider] = encrypt(key)
      migrated++
    }
    if (migrated > 0) writeEncryptedMap(enc)
    console.log(`[secret] Migrated ${migrated} legacy plaintext key(s) to encrypted store`)
  }
  db.prepare('DELETE FROM settings WHERE key = ?').run(KEY_LEGACY_PLAINTEXT)
}

function getApiKey(providerId) {
  if (!providerId) return null
  const map = readEncryptedMap()
  const stored = map[providerId]
  if (!stored) return null
  try {
    return decrypt(stored)
  } catch (e) {
    console.warn(`[secret] decrypt failed for ${providerId}:`, e.message)
    return null
  }
}

function setApiKey(providerId, plain) {
  if (!providerId) return
  const map = readEncryptedMap()
  if (plain && plain.trim()) {
    map[providerId] = encrypt(plain.trim())
  } else {
    delete map[providerId]
  }
  writeEncryptedMap(map)
}

function deleteApiKey(providerId) {
  if (!providerId) return
  const map = readEncryptedMap()
  if (providerId in map) {
    delete map[providerId]
    writeEncryptedMap(map)
  }
}

/** 列出已配置的 provider id；不返回 key 内容 */
function listApiKeyProviders() {
  return Object.keys(readEncryptedMap())
}

/** 一次性返回全部解密后的 keys（仅在主进程内使用，例如同步给 mimo serve） */
function getAllApiKeys() {
  const map = readEncryptedMap()
  const out = {}
  for (const [provider, stored] of Object.entries(map)) {
    try {
      out[provider] = decrypt(stored)
    } catch (e) {
      console.warn(`[secret] decrypt failed for ${provider}:`, e.message)
    }
  }
  return out
}

module.exports = {
  isEncryptionAvailable,
  migrateLegacyIfNeeded,
  getApiKey,
  setApiKey,
  deleteApiKey,
  listApiKeyProviders,
  getAllApiKeys,
}
