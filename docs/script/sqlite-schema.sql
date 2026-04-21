-- SQLite schema for Turso
-- Run: turso db shell <db-name> < docs/script/sqlite-schema.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  openid TEXT UNIQUE NOT NULL,
  unionid TEXT,
  nickname TEXT NOT NULL DEFAULT '微信用户',
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT DEFAULT (datetime('now')),
  total_blessings_generated INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  blessing TEXT NOT NULL,
  occasion TEXT,
  target_person TEXT,
  style TEXT DEFAULT '传统',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);
CREATE INDEX IF NOT EXISTS idx_user_history_user_id ON user_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_history_created_at ON user_history(created_at DESC);
