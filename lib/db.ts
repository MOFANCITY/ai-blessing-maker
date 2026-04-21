import { createClient } from '@libsql/client/http';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const TABLES = { USERS: 'users', USER_HISTORY: 'user_history' };

export const userDb = {
  async getUserByOpenid(openid: string) {
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE openid = ? LIMIT 1',
      args: [openid],
    });
    return result.rows[0] ?? null;
  },

  async createUser(userData: { openid: string; unionid?: string; nickname: string; avatar_url?: string }) {
    const result = await db.execute({
      sql: 'INSERT INTO users (openid, unionid, nickname, avatar_url) VALUES (?, ?, ?, ?) RETURNING *',
      args: [userData.openid, userData.unionid ?? null, userData.nickname, userData.avatar_url ?? null],
    });
    return result.rows[0];
  },

  async updateUser(openid: string, updates: { nickname?: string; avatar_url?: string; last_login_at?: boolean; total_blessings_generated?: number }) {
    const fields: string[] = [];
    const args: unknown[] = [];
    if (updates.nickname !== undefined) { fields.push('nickname = ?'); args.push(updates.nickname); }
    if (updates.avatar_url !== undefined) { fields.push('avatar_url = ?'); args.push(updates.avatar_url); }
    if (updates.total_blessings_generated !== undefined) { fields.push('total_blessings_generated = ?'); args.push(updates.total_blessings_generated); }
    if (updates.last_login_at) { fields.push('last_login_at = ?'); args.push(new Date().toISOString()); }
    if (fields.length === 0) return null;
    args.push(openid);
    const result = await db.execute({
      sql: `UPDATE users SET ${fields.join(', ')} WHERE openid = ? RETURNING *`,
      args,
    });
    return result.rows[0] ?? null;
  },

  async incrementBlessingCount(openid: string) {
    await db.execute({
      sql: 'UPDATE users SET total_blessings_generated = total_blessings_generated + 1 WHERE openid = ?',
      args: [openid],
    });
  },
};

export const historyDb = {
  async getUserHistory(userId: string, page = 1, pageSize = 10) {
    const offset = (page - 1) * pageSize;
    const [countResult, dataResult] = await Promise.all([
      db.execute({ sql: 'SELECT COUNT(*) as total FROM user_history WHERE user_id = ?', args: [userId] }),
      db.execute({
        sql: 'SELECT * FROM user_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        args: [userId, pageSize, offset],
      }),
    ]);
    return { data: dataResult.rows, total: Number(countResult.rows[0].total) };
  },

  async addHistory(data: { user_id: string; blessing: string; occasion?: string; target_person?: string; style?: string }) {
    const result = await db.execute({
      sql: 'INSERT INTO user_history (user_id, blessing, occasion, target_person, style) VALUES (?, ?, ?, ?, ?) RETURNING *',
      args: [data.user_id, data.blessing, data.occasion ?? null, data.target_person ?? null, data.style ?? '传统'],
    });
    return result.rows[0];
  },

  async deleteHistory(historyId: string, userId: string) {
    await db.execute({
      sql: 'DELETE FROM user_history WHERE id = ? AND user_id = ?',
      args: [historyId, userId],
    });
    return true;
  },

  async clearUserHistory(userId: string) {
    await db.execute({
      sql: 'DELETE FROM user_history WHERE user_id = ?',
      args: [userId],
    });
    return true;
  },

  async getStats(userId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const [totalResult, monthlyResult] = await Promise.all([
      db.execute({ sql: 'SELECT COUNT(*) as total FROM user_history WHERE user_id = ?', args: [userId] }),
      db.execute({
        sql: 'SELECT COUNT(*) as total FROM user_history WHERE user_id = ? AND created_at >= ? AND created_at <= ?',
        args: [userId, startOfMonth, endOfMonth],
      }),
    ]);
    return {
      total: Number(totalResult.rows[0].total),
      monthly: Number(monthlyResult.rows[0].total),
    };
  },
};

// Direct query helper for routes that need raw queries
export { db };
