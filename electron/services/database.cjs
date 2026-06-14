// MiMo Code Desktop — Electron Main Process
// 数据库服务：SQLite 初始化 + 查询

const Database = require('better-sqlite3')
const path = require('path')
const os = require('os')
const fs = require('fs')

let db

function getDbPath() {
  return path.join(getMimoDataDir(), 'mimo-code.db')
}

function getMimoDataDir() {
  return path.join(os.homedir(), '.mimocode')
}

function initDatabase() {
  const dir = getMimoDataDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const dbPath = getDbPath()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'mimo-free',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      system_prompt TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      model TEXT,
      provider TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      provider TEXT PRIMARY KEY,
      key TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      auth_type TEXT NOT NULL,
      api_key TEXT,
      bootstrap_url TEXT,
      enabled INTEGER DEFAULT 1,
      config TEXT
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      command TEXT,
      args TEXT,
      url TEXT,
      env TEXT,
      enabled INTEGER DEFAULT 1,
      status TEXT DEFAULT 'stopped'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // 预置 MiMo Free provider
  db.prepare(`
    INSERT OR IGNORE INTO providers (id, name, type, endpoint, auth_type, bootstrap_url, enabled)
    VALUES ('mimo-free', 'MiMo Auto', 'mimo-free',
            'https://api.xiaomimimo.com/api/free-ai/openai',
            'jwt-bootstrap', 'https://api.xiaomimimo.com/api/free-ai/bootstrap', 1)
  `).run()

  // 预置默认设置
  db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('defaultModel', 'mimo-auto')
  `).run()
  db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('defaultProvider', 'mimo-free')
  `).run()
  db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('first-launch', 'true')
  `).run()

  return db
}

function getDb() {
  return db
}

function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}

module.exports = { initDatabase, getDb, closeDatabase, getMimoDataDir }
