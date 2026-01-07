/**
 * Supabase 数据库客户端
 * 用于用户认证和历史记录存储
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase 配置
const getSupabaseConfig = () => ({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_KEY,
});

// 延迟创建 Supabase 客户端
let supabaseInstance: SupabaseClient | null = null;

/**
 * 获取 Supabase 客户端
 * 延迟初始化，避免构建时缺少环境变量
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    const config = getSupabaseConfig();
    if (!config.url || !config.key) {
      throw new Error('Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.');
    }
    supabaseInstance = createClient(config.url, config.key);
  }
  return supabaseInstance;
}

// 导出 supabase 客户端
export const supabase = {
  from: (table: string) => getSupabaseClient().from(table),
  rpc: (procedure: string, params?: Record<string, unknown>) => getSupabaseClient().rpc(procedure, params),
};

/**
 * 数据库表名常量
 */
export const TABLES = {
  USERS: 'users',
  USER_HISTORY: 'user_history',
};

/**
 * 用户相关数据库操作
 */
export const userDb = {
  /**
   * 根据 openid 获取用户
   */
  async getUserByOpenid(openid: string) {
    const { data, error } = await getSupabaseClient()
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
    const { data, error } = await getSupabaseClient()
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
    const updateData: Record<string, unknown> = {};
    
    if (updates.nickname !== undefined) updateData.nickname = updates.nickname;
    if (updates.avatar_url !== undefined) updateData.avatar_url = updates.avatar_url;
    if (updates.total_blessings_generated !== undefined) updateData.total_blessings_generated = updates.total_blessings_generated;
    if (updates.last_login_at) updateData.last_login_at = new Date().toISOString();
    
    const { data, error } = await getSupabaseClient()
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
    const { data, error } = await getSupabaseClient().rpc('increment_blessing_count', {
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
    const { data, error } = await getSupabaseClient()
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
    const { data, error } = await getSupabaseClient()
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
    const { error } = await getSupabaseClient()
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
    const { error } = await getSupabaseClient()
      .from(TABLES.USER_HISTORY)
      .delete()
      .eq('user_id', userId);
    
    if (error) throw error;
    return true;
  },
};
