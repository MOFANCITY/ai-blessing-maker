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

// ========================
// 对下联相关数据库操作
// ========================

export const coupletDb = {
  // 创建对联记录
  async createCoupletRecord(data: {
    openid: string;
    upperLine: string;
    lowerLine?: string;
    theme: string;
    difficulty?: 'simple' | 'medium' | 'hard';
  }) {
    const result = await db.execute({
      sql: `INSERT INTO couplet_records (openid, upper_line, lower_line, theme, difficulty, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id, openid, upper_line, lower_line, theme, difficulty, score, created_at`,
      args: [data.openid, data.upperLine, data.lowerLine ?? null, data.theme, data.difficulty ?? 'medium', new Date().toISOString()],
    });
    return result.rows[0];
  },

  // 获取单条对联记录
  async getCoupletRecord(recordId: number) {
    const result = await db.execute({
      sql: 'SELECT * FROM couplet_records WHERE id = ? LIMIT 1',
      args: [recordId],
    });
    return result.rows[0] ?? null;
  },

  // 更新对联记录评分和下联
  async updateCoupletScore(recordId: number, lowerLine: string, score: number, reviewSummary: string, canShare: boolean) {
    const result = await db.execute({
      sql: `UPDATE couplet_records
            SET lower_line = ?, score = ?, review_summary = ?, can_share = ?, updated_at = ?
            WHERE id = ?
            RETURNING *`,
      args: [lowerLine, score, reviewSummary, canShare ? 1 : 0, new Date().toISOString(), recordId],
    });
    return result.rows[0];
  },

  // 标记对联为已分享
  async markAsShared(recordId: number) {
    const result = await db.execute({
      sql: `UPDATE couplet_records
            SET is_shared = 1, shared_at = ?
            WHERE id = ?
            RETURNING *`,
      args: [new Date().toISOString(), recordId],
    });
    return result.rows[0];
  },

  // 获取用户的所有对联（只获取已完成品联的记录）
  async getUserCouplets(openid: string, limit = 20, offset = 0) {
    const result = await db.execute({
      sql: `SELECT * FROM couplet_records
            WHERE openid = ? AND score IS NOT NULL
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?`,
      args: [openid, limit, offset],
    });
    return result.rows;
  },

  // 获取用户对联总数（只计算已完成品联的记录）
  async getUserCoupletCount(openid: string) {
    const result = await db.execute({
      sql: 'SELECT COUNT(*) as total FROM couplet_records WHERE openid = ? AND score IS NOT NULL',
      args: [openid],
    });
    return Number(result.rows[0].total);
  },
};

export const userStatsDb = {
  // 初始化用户统计
  async initUserStats(openid: string) {
    const result = await db.execute({
      sql: `INSERT OR IGNORE INTO user_stats (openid, total_points, total_couplets, total_shares, created_at)
            VALUES (?, 0, 0, 0, ?)
            RETURNING *`,
      args: [openid, new Date().toISOString()],
    });
    return result.rows[0];
  },

  // 获取用户统计
  async getUserStats(openid: string) {
    const result = await db.execute({
      sql: 'SELECT * FROM user_stats WHERE openid = ? LIMIT 1',
      args: [openid],
    });
    return result.rows[0] ?? null;
  },

  // 增加用户积分
  async addPoints(openid: string, points: number, reason: string) {
    await db.execute({
      sql: `UPDATE user_stats
            SET total_points = total_points + ?, updated_at = ?
            WHERE openid = ?`,
      args: [points, new Date().toISOString(), openid],
    });

    // 记录积分日志
    await db.execute({
      sql: `INSERT INTO points_log (openid, points, reason, created_at)
            VALUES (?, ?, ?, ?)`,
      args: [openid, points, reason, new Date().toISOString()],
    });
  },

  // 更新用户统计（对联数、分享数）
  async updateStats(openid: string, updates: { coupletCount?: number; shareCount?: number }) {
    const fields: string[] = [];
    const args: unknown[] = [];

    if (updates.coupletCount !== undefined) {
      fields.push('total_couplets = ?');
      args.push(updates.coupletCount);
    }
    if (updates.shareCount !== undefined) {
      fields.push('total_shares = ?');
      args.push(updates.shareCount);
    }

    if (fields.length === 0) return null;

    fields.push('updated_at = ?');
    args.push(new Date().toISOString());
    args.push(openid);

    const result = await db.execute({
      sql: `UPDATE user_stats SET ${fields.join(', ')} WHERE openid = ? RETURNING *`,
      args,
    });
    return result.rows[0];
  },
};

export const achievementDb = {
  // 获取用户成就
  async getUserAchievements(openid: string) {
    const result = await db.execute({
      sql: `SELECT * FROM user_achievements
            WHERE openid = ?
            ORDER BY unlocked_at DESC`,
      args: [openid],
    });
    return result.rows;
  },

  // 初始化用户所有成就
  async initAchievements(openid: string) {
    const badges = ['novice', 'enthusiast', 'master', 'spring_expert', 'lantern_expert', 'sharing_expert', 'viral'];
    for (const badgeId of badges) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO user_achievements (openid, badge_id, progress, created_at)
              VALUES (?, ?, 0, ?)`,
        args: [openid, badgeId, new Date().toISOString()],
      });
    }
  },

  // 解锁成就
  async unlockAchievement(openid: string, badgeId: string) {
    const result = await db.execute({
      sql: `UPDATE user_achievements
            SET progress = 100, unlocked_at = ?
            WHERE openid = ? AND badge_id = ?
            RETURNING *`,
      args: [new Date().toISOString(), openid, badgeId],
    });
    return result.rows[0];
  },

  // 更新成就进度
  async updateProgress(openid: string, badgeId: string, progress: number) {
    const result = await db.execute({
      sql: `UPDATE user_achievements
            SET progress = ?
            WHERE openid = ? AND badge_id = ?
            RETURNING *`,
      args: [progress, openid, badgeId],
    });
    return result.rows[0];
  },
};

export const dailyChallengeDb = {
  // 获取指定日期的每日挑战
  async getDailyChallenge(date: string) {
    const result = await db.execute({
      sql: 'SELECT * FROM daily_challenges WHERE challenge_date = ? LIMIT 1',
      args: [date],
    });
    return result.rows[0] ?? null;
  },

  // 创建每日挑战
  async createDailyChallenge(data: { date: string; upperLine: string; theme: string; difficulty: string }) {
    const result = await db.execute({
      sql: `INSERT INTO daily_challenges (challenge_date, upper_line, theme, difficulty, created_at)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *`,
      args: [data.date, data.upperLine, data.theme, data.difficulty, new Date().toISOString()],
    });
    return result.rows[0];
  },

  // 获取用户今日挑战记录
  async getUserDailyRecord(openid: string, date: string) {
    const result = await db.execute({
      sql: `SELECT * FROM user_daily_records
            WHERE openid = ? AND challenge_date = ?
            LIMIT 1`,
      args: [openid, date],
    });
    return result.rows[0] ?? null;
  },

  // 保存用户每日挑战记录
  async saveDailyRecord(data: {
    openid: string;
    date: string;
    score: number;
    timeSpent: number;
    isLimitMode: boolean;
  }) {
    const result = await db.execute({
      sql: `INSERT OR REPLACE INTO user_daily_records (openid, challenge_date, score, time_spent, is_limit_mode, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING *`,
      args: [data.openid, data.date, data.score, data.timeSpent, data.isLimitMode ? 1 : 0, new Date().toISOString()],
    });
    return result.rows[0];
  },
};

// Direct query helper for routes that need raw queries
export { db };
