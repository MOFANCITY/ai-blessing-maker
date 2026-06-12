import { createClient } from "@libsql/client/http";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const TABLES = {
  USERS: "users",
  USER_HISTORY: "user_history",
  DISS_RECORDS: "diss_records",
  POEM_RECORDS: "poem_records",
  FAVORITES: "favorites",
};

// 怼人记录表（运行时幂等创建）
let dissTableReady: Promise<void> | null = null;
function ensureDissTable() {
  if (dissTableReady) return dissTableReady;
  dissTableReady = db
    .execute(
      `CREATE TABLE IF NOT EXISTS diss_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        situation TEXT NOT NULL,
        tone TEXT NOT NULL,
        target TEXT,
        preset_id TEXT,
        result TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    )
    .then(() =>
      db.execute(
        `CREATE INDEX IF NOT EXISTS idx_diss_records_user_id_created
          ON diss_records (user_id, created_at DESC)`,
      ),
    )
    .then(() => undefined)
    .catch((err) => {
      dissTableReady = null;
      throw err;
    });
  return dissTableReady;
}

export const userDb = {
  async getUserByOpenid(openid: string) {
    const result = await db.execute({
      sql: "SELECT * FROM users WHERE openid = ? LIMIT 1",
      args: [openid],
    });
    return result.rows[0] ?? null;
  },

  async createUser(userData: {
    openid: string;
    unionid?: string;
    nickname: string;
    avatar_url?: string;
  }) {
    const result = await db.execute({
      sql: "INSERT INTO users (openid, unionid, nickname, avatar_url) VALUES (?, ?, ?, ?) RETURNING *",
      args: [
        userData.openid,
        userData.unionid ?? null,
        userData.nickname,
        userData.avatar_url ?? null,
      ],
    });
    return result.rows[0];
  },

  async updateUser(
    openid: string,
    updates: {
      nickname?: string;
      avatar_url?: string;
      last_login_at?: boolean;
      total_blessings_generated?: number;
    },
  ) {
    const fields: string[] = [];
    const args: unknown[] = [];
    if (updates.nickname !== undefined) {
      fields.push("nickname = ?");
      args.push(updates.nickname);
    }
    if (updates.avatar_url !== undefined) {
      fields.push("avatar_url = ?");
      args.push(updates.avatar_url);
    }
    if (updates.total_blessings_generated !== undefined) {
      fields.push("total_blessings_generated = ?");
      args.push(updates.total_blessings_generated);
    }
    if (updates.last_login_at) {
      fields.push("last_login_at = ?");
      args.push(new Date().toISOString());
    }
    if (fields.length === 0) return null;
    args.push(openid);
    const result = await db.execute({
      sql: `UPDATE users SET ${fields.join(", ")} WHERE openid = ? RETURNING *`,
      args,
    });
    return result.rows[0] ?? null;
  },

  async incrementBlessingCount(openid: string) {
    await db.execute({
      sql: "UPDATE users SET total_blessings_generated = total_blessings_generated + 1 WHERE openid = ?",
      args: [openid],
    });
  },
};

export const historyDb = {
  async getUserHistory(userId: string, page = 1, pageSize = 10) {
    const offset = (page - 1) * pageSize;
    const [countResult, dataResult] = await Promise.all([
      db.execute({
        sql: "SELECT COUNT(*) as total FROM user_history WHERE user_id = ?",
        args: [userId],
      }),
      db.execute({
        sql: "SELECT * FROM user_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        args: [userId, pageSize, offset],
      }),
    ]);
    return { data: dataResult.rows, total: Number(countResult.rows[0].total) };
  },

  async addHistory(data: {
    user_id: string;
    blessing: string;
    occasion?: string;
    target_person?: string;
    style?: string;
  }) {
    const result = await db.execute({
      sql: "INSERT INTO user_history (user_id, blessing, occasion, target_person, style) VALUES (?, ?, ?, ?, ?) RETURNING *",
      args: [
        data.user_id,
        data.blessing,
        data.occasion ?? null,
        data.target_person ?? null,
        data.style ?? "传统",
      ],
    });
    return result.rows[0];
  },

  async deleteHistory(historyId: string, userId: string) {
    await db.execute({
      sql: "DELETE FROM user_history WHERE id = ? AND user_id = ?",
      args: [historyId, userId],
    });
    return true;
  },

  async clearUserHistory(userId: string) {
    await db.execute({
      sql: "DELETE FROM user_history WHERE user_id = ?",
      args: [userId],
    });
    return true;
  },

  async getStats(userId: string) {
    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    ).toISOString();
    const [totalResult, monthlyResult] = await Promise.all([
      db.execute({
        sql: "SELECT COUNT(*) as total FROM user_history WHERE user_id = ?",
        args: [userId],
      }),
      db.execute({
        sql: "SELECT COUNT(*) as total FROM user_history WHERE user_id = ? AND created_at >= ? AND created_at <= ?",
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
    difficulty?: "simple" | "medium" | "hard";
  }) {
    const result = await db.execute({
      sql: `INSERT INTO couplet_records (openid, upper_line, lower_line, theme, difficulty, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id, openid, upper_line, lower_line, theme, difficulty, score, created_at`,
      args: [
        data.openid,
        data.upperLine,
        data.lowerLine ?? null,
        data.theme,
        data.difficulty ?? "medium",
        new Date().toISOString(),
      ],
    });
    return result.rows[0];
  },

  // 获取单条对联记录
  async getCoupletRecord(recordId: number) {
    const result = await db.execute({
      sql: "SELECT * FROM couplet_records WHERE id = ? LIMIT 1",
      args: [recordId],
    });
    return result.rows[0] ?? null;
  },

  // 更新对联记录评分和下联
  async updateCoupletScore(
    recordId: number,
    lowerLine: string,
    score: number,
    reviewSummary: string,
    canShare: boolean,
  ) {
    const result = await db.execute({
      sql: `UPDATE couplet_records
            SET lower_line = ?, score = ?, review_summary = ?, can_share = ?, updated_at = ?
            WHERE id = ?
            RETURNING *`,
      args: [
        lowerLine,
        score,
        reviewSummary,
        canShare ? 1 : 0,
        new Date().toISOString(),
        recordId,
      ],
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
      sql: "SELECT COUNT(*) as total FROM couplet_records WHERE openid = ? AND score IS NOT NULL",
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
      sql: "SELECT * FROM user_stats WHERE openid = ? LIMIT 1",
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
  async updateStats(
    openid: string,
    updates: { coupletCount?: number; shareCount?: number },
  ) {
    const fields: string[] = [];
    const args: unknown[] = [];

    if (updates.coupletCount !== undefined) {
      fields.push("total_couplets = ?");
      args.push(updates.coupletCount);
    }
    if (updates.shareCount !== undefined) {
      fields.push("total_shares = ?");
      args.push(updates.shareCount);
    }

    if (fields.length === 0) return null;

    fields.push("updated_at = ?");
    args.push(new Date().toISOString());
    args.push(openid);

    const result = await db.execute({
      sql: `UPDATE user_stats SET ${fields.join(", ")} WHERE openid = ? RETURNING *`,
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
    const badges = [
      "novice",
      "enthusiast",
      "master",
      "spring_expert",
      "lantern_expert",
      "sharing_expert",
      "viral",
    ];
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
      sql: "SELECT * FROM daily_challenges WHERE challenge_date = ? LIMIT 1",
      args: [date],
    });
    return result.rows[0] ?? null;
  },

  // 创建每日挑战
  async createDailyChallenge(data: {
    date: string;
    upperLine: string;
    theme: string;
    difficulty: string;
  }) {
    const result = await db.execute({
      sql: `INSERT INTO daily_challenges (challenge_date, upper_line, theme, difficulty, created_at)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        data.date,
        data.upperLine,
        data.theme,
        data.difficulty,
        new Date().toISOString(),
      ],
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
      args: [
        data.openid,
        data.date,
        data.score,
        data.timeSpent,
        data.isLimitMode ? 1 : 0,
        new Date().toISOString(),
      ],
    });
    return result.rows[0];
  },
};

// Direct query helper for routes that need raw queries
export { db };

// ========================
// 古诗记录相关数据库操作
// ========================

let poemTableReady: Promise<void> | null = null;
function ensurePoemTable() {
  if (poemTableReady) return poemTableReady;
  poemTableReady = db
    .execute(
      `CREATE TABLE IF NOT EXISTS poem_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      type TEXT NOT NULL,
      theme TEXT NOT NULL,
      game_mode INTEGER,
      extras TEXT,
      ai_lines TEXT NOT NULL,
      user_lines TEXT,
      result TEXT,
      created_at INTEGER NOT NULL
    )`,
    )
    .then(() =>
      db.execute(
        `CREATE INDEX IF NOT EXISTS idx_poem_records_user_id_created
          ON poem_records (user_id, created_at DESC)`,
      ),
    )
    .then(() => undefined)
    .catch((err) => {
      poemTableReady = null;
      throw err;
    });
  return poemTableReady;
}

export const poemDb = {
  /**
   * 插入一条古诗记录
   * aiLines 为 2 行诗用 \n 拼接的字符串
   */
  async insertPoemRecord(data: {
    user_id: string;
    type: "poem5" | "poem7";
    theme: string;
    gameMode: boolean;
    extras?: string | null;
    aiLines: string;
    userLines?: string | null;
    result?: string | null;
  }) {
    await ensurePoemTable();
    const createdAt = Date.now();
    const result = await db.execute({
      sql: `INSERT INTO poem_records
            (user_id, type, theme, game_mode, extras, ai_lines, user_lines, result, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        data.user_id,
        data.type,
        data.theme,
        data.gameMode ? 1 : 0,
        data.extras ?? null,
        data.aiLines,
        data.userLines ?? null,
        data.result ?? null,
        createdAt,
      ],
    });
    return result.rows[0];
  },

  /**
   * 更新古诗记录的用户诗句与最终结果
   */
  async updatePoemUserLines(
    recordId: number | string,
    userLines: string[],
    result?: string | null,
  ) {
    await ensurePoemTable();
    const updated = await db.execute({
      sql: `UPDATE poem_records
            SET user_lines = ?, result = ?
            WHERE id = ?
            RETURNING *`,
      args: [userLines.join("\n"), result ?? null, recordId],
    });
    return updated.rows[0];
  },

  /**
   * 获取用户的古诗历史
   */
  async getPoemHistory(userId: string, limit = 20) {
    await ensurePoemTable();
    const result = await db.execute({
      sql: `SELECT * FROM poem_records
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?`,
      args: [userId, Math.max(1, Math.min(100, limit))],
    });
    return result.rows;
  },
};

// ========================
// 怼人记录相关数据库操作
// ========================

export const dissDb = {
  /**
   * 插入一条怼人记录
   */
  async insertDissRecord(data: {
    user_id: string;
    situation: string;
    tone: string;
    target?: string | null;
    preset_id?: string | null;
    result: string;
  }) {
    await ensureDissTable();
    const createdAt = Date.now();
    const result = await db.execute({
      sql: `INSERT INTO diss_records
            (user_id, situation, tone, target, preset_id, result, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        data.user_id,
        data.situation,
        data.tone,
        data.target ?? null,
        data.preset_id ?? null,
        data.result,
        createdAt,
      ],
    });
    return result.rows[0];
  },

  /**
   * 获取用户的怼人历史
   */
  async getDissHistory(userId: string, limit = 20) {
    await ensureDissTable();
    const result = await db.execute({
      sql: `SELECT * FROM diss_records
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?`,
      args: [userId, Math.max(1, Math.min(100, limit))],
    });
    return result.rows;
  },
};

// ========================
// 收藏相关数据库操作
// ========================

let favoritesTableReady: Promise<void> | null = null;
function ensureFavoritesTable() {
  if (favoritesTableReady) return favoritesTableReady;
  favoritesTableReady = db
    .execute(
      `CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content_id TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    )
    .then(() =>
      db.execute(
        `CREATE INDEX IF NOT EXISTS idx_favorites_user_type_created
          ON favorites (user_id, content_type, created_at DESC)`,
      ),
    )
    .then(() => undefined)
    .catch((err) => {
      favoritesTableReady = null;
      throw err;
    });
  return favoritesTableReady;
}

export const favoriteDb = {
  /**
   * 添加收藏
   */
  async addFavorite(data: {
    user_id: string;
    content_type: "blessing" | "diss" | "couplet" | "poem";
    content_id?: string | null;
    title: string;
    content: string;
  }) {
    await ensureFavoritesTable();
    const createdAt = Date.now();
    const result = await db.execute({
      sql: `INSERT INTO favorites
            (user_id, content_type, content_id, title, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        data.user_id,
        data.content_type,
        data.content_id ?? null,
        data.title,
        data.content,
        createdAt,
      ],
    });
    return result.rows[0];
  },

  /**
   * 取消收藏
   */
  async removeFavorite(favoriteId: number | string, userId: string) {
    await ensureFavoritesTable();
    const result = await db.execute({
      sql: `DELETE FROM favorites
            WHERE id = ? AND user_id = ?
            RETURNING *`,
      args: [favoriteId, userId],
    });
    return result.rows[0] ?? null;
  },

  /**
   * 获取用户收藏列表
   */
  async getUserFavorites(
    userId: string,
    options?: { contentType?: string; limit?: number; offset?: number },
  ) {
    await ensureFavoritesTable();
    const limit = Math.max(1, Math.min(100, options?.limit ?? 50));
    const offset = options?.offset ?? 0;

    let sql = `SELECT * FROM favorites WHERE user_id = ?`;
    const args: unknown[] = [userId];

    if (options?.contentType) {
      sql += ` AND content_type = ?`;
      args.push(options.contentType);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    args.push(limit, offset);

    const result = await db.execute({ sql, args });
    return result.rows;
  },

  /**
   * 获取用户收藏总数
   */
  async getUserFavoritesCount(userId: string, contentType?: string) {
    await ensureFavoritesTable();
    let sql = `SELECT COUNT(*) as total FROM favorites WHERE user_id = ?`;
    const args: unknown[] = [userId];

    if (contentType) {
      sql += ` AND content_type = ?`;
      args.push(contentType);
    }

    const result = await db.execute({ sql, args });
    return Number(result.rows[0].total);
  },

  /**
   * 检查是否已收藏
   */
  async isFavorited(userId: string, contentType: string, contentId: string) {
    await ensureFavoritesTable();
    const result = await db.execute({
      sql: `SELECT id FROM favorites
            WHERE user_id = ? AND content_type = ? AND content_id = ?
            LIMIT 1`,
      args: [userId, contentType, contentId],
    });
    return result.rows.length > 0;
  },
};

let feedbackTableReady: Promise<void> | null = null;

function ensureFeedbackTable() {
  if (feedbackTableReady) return feedbackTableReady;
  feedbackTableReady = db
    .execute(
      `CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        record_id INTEGER,
        feedback_type TEXT NOT NULL DEFAULT 'dislike',
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, content_type, record_id)
      )`,
    )
    .then(() =>
      db.execute(
        `CREATE INDEX IF NOT EXISTS idx_feedback_user_content
         ON feedback (user_id, content_type, created_at DESC)`,
      ),
    )
    .then(() => undefined)
    .catch((err) => {
      feedbackTableReady = null;
      throw err;
    });
  return feedbackTableReady;
}

export const feedbackDb = {
  async addFeedback(data: {
    user_id: string;
    content_type: string;
    record_id: number;
  }) {
    await ensureFeedbackTable();
    const result = await db.execute({
      sql: `INSERT INTO feedback (user_id, content_type, record_id, feedback_type, created_at)
            VALUES (?, ?, ?, 'dislike', ?) RETURNING *`,
      args: [data.user_id, data.content_type, data.record_id, Date.now()],
    });
    return result.rows[0] ?? null;
  },

  async removeFeedback(data: {
    user_id: string;
    content_type: string;
    record_id: number;
  }) {
    await ensureFeedbackTable();
    const result = await db.execute({
      sql: `DELETE FROM feedback
            WHERE user_id = ? AND content_type = ? AND record_id = ?
            RETURNING *`,
      args: [data.user_id, data.content_type, data.record_id],
    });
    return result.rows[0] ?? null;
  },
};
