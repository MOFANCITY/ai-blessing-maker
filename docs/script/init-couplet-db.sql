-- Migration: Initialize couplet system tables
-- Date: 2026-05-26

-- 对联记录表
CREATE TABLE IF NOT EXISTS couplet_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openid VARCHAR(100) NOT NULL,
  upper_line VARCHAR(100) NOT NULL,
  lower_line VARCHAR(100),
  theme VARCHAR(20) NOT NULL,
  difficulty VARCHAR(10) DEFAULT 'medium',
  score DECIMAL(3,2),
  review_summary VARCHAR(100),
  can_share BOOLEAN DEFAULT 1,
  is_shared BOOLEAN DEFAULT 0,
  shared_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  FOREIGN KEY (openid) REFERENCES users(openid)
);

CREATE INDEX IF NOT EXISTS idx_couplet_records_openid_created ON couplet_records(openid, created_at);
CREATE INDEX IF NOT EXISTS idx_couplet_records_score_shared ON couplet_records(score, is_shared);

-- 用户统计表
CREATE TABLE IF NOT EXISTS user_stats (
  openid VARCHAR(100) PRIMARY KEY,
  total_points INTEGER DEFAULT 0,
  total_couplets INTEGER DEFAULT 0,
  total_shares INTEGER DEFAULT 0,
  avg_score DECIMAL(3,2),
  weekly_ranking_position INTEGER,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  FOREIGN KEY (openid) REFERENCES users(openid)
);

-- 积分日志表
CREATE TABLE IF NOT EXISTS points_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openid VARCHAR(100) NOT NULL,
  points INTEGER NOT NULL,
  reason VARCHAR(100),
  created_at TIMESTAMP NOT NULL,
  FOREIGN KEY (openid) REFERENCES users(openid)
);

CREATE INDEX IF NOT EXISTS idx_points_log_openid ON points_log(openid);

-- 成就系统表
CREATE TABLE IF NOT EXISTS user_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openid VARCHAR(100) NOT NULL,
  badge_id VARCHAR(50) NOT NULL,
  progress INTEGER DEFAULT 0,
  unlocked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  UNIQUE (openid, badge_id),
  FOREIGN KEY (openid) REFERENCES users(openid)
);

-- 每日挑战表
CREATE TABLE IF NOT EXISTS daily_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_date DATE UNIQUE NOT NULL,
  upper_line VARCHAR(100) NOT NULL,
  theme VARCHAR(20) NOT NULL,
  difficulty VARCHAR(10) NOT NULL,
  created_at TIMESTAMP NOT NULL
);

-- 用户每日记录表
CREATE TABLE IF NOT EXISTS user_daily_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openid VARCHAR(100) NOT NULL,
  challenge_date DATE NOT NULL,
  score DECIMAL(3,2),
  time_spent INTEGER,
  is_limit_mode BOOLEAN DEFAULT 0,
  shared_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  UNIQUE (openid, challenge_date),
  FOREIGN KEY (openid) REFERENCES users(openid)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_records_date ON user_daily_records(challenge_date);

-- 周榜快照表（用于缓存计算结果）
CREATE TABLE IF NOT EXISTS weekly_leaderboard_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start_date DATE NOT NULL,
  ranking_data JSON NOT NULL,
  calculated_at TIMESTAMP NOT NULL,
  UNIQUE (week_start_date)
);
