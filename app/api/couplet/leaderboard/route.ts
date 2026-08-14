import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isWeChatRequest, resolveAuth } from "@/lib/api-auth";

interface RankingRow {
  id: number;
  openid: string;
  upper_line: string;
  lower_line: string | null;
  theme: string;
  difficulty: string | null;
  score: number;
  review_summary: string | null;
  shared_at: string;
  nickname: string | null;
  avatar_url: string | null;
}

interface PersonalRecordRow {
  id: number;
  upper_line: string;
  lower_line: string | null;
  theme: string;
  difficulty: string | null;
  score: number | null;
  review_summary: string | null;
  is_shared: number;
  created_at: string;
}

interface PersonalStatsRow {
  total_count: number;
  completed_count: number;
  avg_score: number | null;
  share_count: number;
}

function parseLimit(value: string | null): number | null {
  if (!value) return 20;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, 50);
}

function currentWeekStart(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - weekday + 1);
  return start.toISOString();
}

async function getWeeklyUserRank(openid: string, weekStart: string): Promise<number | null> {
  const bestResult = await db.execute({
    sql: `SELECT score, shared_at
          FROM couplet_records
          WHERE openid = ? AND score >= 3 AND is_shared = 1 AND shared_at >= ?
          ORDER BY score DESC, shared_at ASC
          LIMIT 1`,
    args: [openid, weekStart],
  });
  const best = bestResult.rows[0] as unknown as { score: number; shared_at: string } | undefined;
  if (!best) return null;

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) AS rank_position
          FROM couplet_records
          WHERE score >= 3 AND is_shared = 1 AND shared_at >= ?
            AND (score > ? OR (score = ? AND shared_at < ?))`,
    args: [weekStart, best.score, best.score, best.shared_at],
  });
  const count = Number((countResult.rows[0] as unknown as { rank_position?: number })?.rank_position ?? 0);
  return count + 1;
}

export async function GET(req: NextRequest) {
  try {
    if (!isWeChatRequest(req)) {
      return NextResponse.json(
        { error: "此应用仅支持微信小程序访问，请在微信中打开" },
        { status: 403 },
      );
    }
    const auth = resolveAuth(req);
    if (!auth) return NextResponse.json({ error: "用户未登录" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "weekly";
    const limit = parseLimit(searchParams.get("limit"));
    if (!limit || (type !== "weekly" && type !== "personal")) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }

    if (type === "weekly") {
      const weekStart = currentWeekStart();
      const result = await db.execute({
        sql: `SELECT cr.id, cr.openid, cr.upper_line, cr.lower_line, cr.theme,
                     cr.difficulty, cr.score, cr.review_summary, cr.shared_at,
                     u.nickname, u.avatar_url
              FROM couplet_records cr
              LEFT JOIN users u ON cr.openid = u.openid
              WHERE cr.score >= 3 AND cr.is_shared = 1 AND cr.shared_at >= ?
              ORDER BY cr.score DESC, cr.shared_at ASC
              LIMIT ?`,
        args: [weekStart, limit],
      });
      const rows = result.rows as unknown as RankingRow[];
      const rankings = rows.map((row, index) => ({
        rank: index + 1,
        recordId: row.id,
        openid: row.openid,
        nickname: row.nickname || "匿名用户",
        avatar: row.avatar_url,
        upperLine: row.upper_line,
        lowerLine: row.lower_line,
        score: row.score,
        theme: row.theme,
        difficulty: row.difficulty,
        summary: row.review_summary,
        sharedAt: row.shared_at,
      }));

      return NextResponse.json({
        type: "weekly",
        rankings,
        userRank: await getWeeklyUserRank(auth.openid, weekStart),
        total: rankings.length,
      });
    }

    // Never take the owner from query params: a valid token only exposes its
    // own private couplet history.
    const result = await db.execute({
      sql: `SELECT * FROM couplet_records
            WHERE openid = ?
            ORDER BY created_at DESC
            LIMIT ?`,
      args: [auth.openid, limit],
    });
    const statsResult = await db.execute({
      sql: `SELECT COUNT(*) AS total_count,
                   SUM(CASE WHEN score IS NOT NULL THEN 1 ELSE 0 END) AS completed_count,
                   AVG(CASE WHEN score IS NOT NULL THEN score END) AS avg_score,
                   COUNT(CASE WHEN is_shared = 1 THEN 1 END) AS share_count
            FROM couplet_records
            WHERE openid = ?`,
      args: [auth.openid],
    });
    const stats = (statsResult.rows[0] as unknown as PersonalStatsRow | undefined) ?? {
      total_count: 0,
      completed_count: 0,
      avg_score: null,
      share_count: 0,
    };

    return NextResponse.json({
      type: "personal",
      records: (result.rows as unknown as PersonalRecordRow[]).map((row) => ({
        recordId: row.id,
        upperLine: row.upper_line,
        lowerLine: row.lower_line,
        theme: row.theme,
        difficulty: row.difficulty,
        score: row.score,
        summary: row.review_summary,
        isShared: row.is_shared,
        createdAt: row.created_at,
      })),
      stats: {
        totalCount: Number(stats.total_count) || 0,
        completedCount: Number(stats.completed_count) || 0,
        avgScore: Number(stats.avg_score ?? 0).toFixed(2),
        shareCount: Number(stats.share_count) || 0,
      },
    });
  } catch (error) {
    console.error("获取排行榜失败:", error);
    return NextResponse.json({ error: "获取排行榜失败，请重试" }, { status: 500 });
  }
}
