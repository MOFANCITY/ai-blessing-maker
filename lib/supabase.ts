/**
 * Supabase 数据库客户端
 * 用于用户认证和历史记录存储
 */

import { createClient } from '@supabase/supabase-js';

// Supabase 配置
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// 创建 Supabase 客户端（使用 service key 进行服务端操作）
export const supabase = createClient(supabaseUrl!, supabaseKey!);

/**
 * 数据库表名常量
 */
export const TABLES = {
  USERS: 'users',
  USER_HISTORY: 'user_history',
};

/**
 * 初始化数据库表
 * 创建所需的表（如果不存在）
 */
export async function initDatabase() {
  try {
    // 创建 users 表
    const { error: usersError } = await supabase.rpc('exec_sql', {
      sql: `
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
        
        CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);
      `,
    });
    
    if (usersError) {
      // 如果 rpc 方法不支持，尝试直接创建表
      console.warn('尝试使用 SQL 创建表...');
    }
    
    // 创建 user_history 表
    const { error: historyError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS user_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          blessing TEXT NOT NULL,
          occasion VARCHAR(100),
          target_person VARCHAR(100),
          style VARCHAR(50) DEFAULT '传统',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_user_history_user_id ON user_history(user_id);
      `,
    });
    
    if (historyError) {
      console.warn('初始化表时出现错误:', historyError);
    }
    
    console.log('数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
}

/**
 * 用户相关数据库操作
 */
export const userDb = {
  /**
   * 根据 openid 获取用户
   */
  async getUserByOpenid(openid: string) {
    const { data, error } = await supabase
      .from(TABLES.USERS)
      .select('*')
      .eq('openid', openid)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    return data;
  },
  
  /**
   * 创建新用户
   */
  async createUser(userData: {
    openid: string;
    unionid?: string;
    nickname: string;
    avatar_url?: string;
  }) {
    const { data, error } = await supabase
      .from(TABLES.USERS)
      .insert({
        openid: userData.openid,
        unionid: userData.unionid,
        nickname: userData.nickname,
        avatar_url: userData.avatar_url,
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  
  /**
   * 更新用户信息
   */
  async updateUser(openid: string, updates: {
    nickname?: string;
    avatar_url?: string;
    last_login_at?: boolean;
    total_blessings_generated?: number;
  }) {
    const updateData: Record<string, any> = { ...updates };
    
    if (updates.last_login_at) {
      updateData.last_login_at = new Date().toISOString();
      delete updateData.last_login_at;
    }
    
    const { data, error } = await supabase
      .from(TABLES.USERS)
      .update(updateData)
      .eq('openid', openid)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  
  /**
   * 增加祝福语生成计数
   */
  async incrementBlessingCount(openid: string) {
    const { data, error } = await supabase.rpc('increment_blessing_count', {
      openid_param: openid,
    });
    
    if (error) throw error;
    return data;
  },
};

/**
 * 用户历史记录相关数据库操作
 */
export const historyDb = {
  /**
   * 获取用户历史记录
   */
  async getUserHistory(userId: string, limit = 50) {
    const { data, error } = await supabase
      .from(TABLES.USER_HISTORY)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  },
  
  /**
   * 添加历史记录
   */
  async addHistory(historyData: {
    user_id: string;
    blessing: string;
    occasion?: string;
    target_person?: string;
    style?: string;
  }) {
    const { data, error } = await supabase
      .from(TABLES.USER_HISTORY)
      .insert(historyData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  
  /**
   * 删除历史记录
   */
  async deleteHistory(historyId: string, userId: string) {
    const { error } = await supabase
      .from(TABLES.USER_HISTORY)
      .delete()
      .eq('id', historyId)
      .eq('user_id', userId);
    
    if (error) throw error;
    return true;
  },
  
  /**
   * 清空用户历史记录
   */
  async clearUserHistory(userId: string) {
    const { error } = await supabase
      .from(TABLES.USER_HISTORY)
      .delete()
      .eq('user_id', userId);
    
    if (error) throw error;
    return true;
  },
};
