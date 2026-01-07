-- Supabase 数据库初始化脚本
-- 在 Supabase SQL 编辑器中执行此脚本

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  openid VARCHAR(64) UNIQUE NOT NULL,
  unionid VARCHAR(64),
  nickname VARCHAR(100) NOT NULL DEFAULT '微信用户',
  avatar_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_blessings_generated INTEGER DEFAULT 0
);

-- 创建用户历史记录表
CREATE TABLE IF NOT EXISTS user_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  blessing TEXT NOT NULL,
  occasion VARCHAR(100),
  target_person VARCHAR(100),
  style VARCHAR(50) DEFAULT '传统',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);
CREATE INDEX IF NOT EXISTS idx_user_history_user_id ON user_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_history_created_at ON user_history(created_at DESC);

-- 启用行级安全策略（RLS）
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_history ENABLE ROW LEVEL SECURITY;

-- 创建策略：用户只能查看和修改自己的数据
CREATE POLICY "用户只能查看自己的信息" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "用户只能更新自己的信息" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "用户只能查看自己的历史记录" ON user_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = user_history.user_id AND openid = auth.jwt() ->> 'openid')
  );

CREATE POLICY "用户只能添加自己的历史记录" ON user_history
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = user_history.user_id AND openid = auth.jwt() ->> 'openid')
  );

CREATE POLICY "用户只能删除自己的历史记录" ON user_history
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = user_history.user_id AND openid = auth.jwt() ->> 'openid')
  );
