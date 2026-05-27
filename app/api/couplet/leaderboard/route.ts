import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const isDevelopment = process.env.NODE_ENV === "development";
    if (!isDevelopment) {
      const userAgent = req.headers.get("user-agent") || "";
      if (!userAgent.includes("MicroMessenger")) {
        return NextResponse.json(
          { error: "此应用仅支持微信小程序访问，请在微信中打开" },
          { status: 403 }
        );
      }
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "weekly";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const openid = searchParams.get("openid");

    if (type === "weekly") {
      // 获取本周排行榜（≥3星且已分享）
      const result = await db.execute({
        sql: `SELECT 
              cr.id,
              cr.openid,
              cr.upper_line,
              cr.lower_line,
              cr.theme,
              cr.difficulty,
              cr.score,
              cr.review_summary,
              cr.shared_at,
              u.nickname,
              u.avatar_url
            FROM couplet_records cr
            LEFT JOIN users u ON cr.openid = u.openid
            WHERE cr.score >= 3 AND cr.is_shared = 1
            ORDER BY cr.score DESC, cr.shared_at DESC
            LIMIT ?`,
        args: [limit],
      });

      const rankings = (result.rows as any[]).map((row, index) => ({
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

      // 如果提供了 openid，找出用户的排名
      let userRank = null;
      if (openid) {
        const userRankResult = await db.execute({
          sql: `SELECT COUNT(*) as rank_position
                FROM couplet_records
                WHERE score >= 3 AND is_shared = 1
                AND (score > (
                  SELECT score FROM couplet_records 
                  WHERE openid = ? 
                  ORDER BY score DESC LIMIT 1
                ) OR (
                  score = (
                    SELECT score FROM couplet_records 
                    WHERE openid = ? 
                    ORDER BY score DESC LIMIT 1
                  ) AND shared_at < (
                    SELECT shared_at FROM couplet_records 
                    WHERE openid = ? 
                    ORDER BY score DESC LIMIT 1
                  )
                ))`,
          args: [openid, openid, openid],
        });
        const rankPos = Number(userRankResult.rows[0].rank_position) || 0;
        userRank = rankPos + 1;
      }

      return NextResponse.json({
        type: "weekly",
        rankings,
        userRank,
        total: rankings.length,
      });
    } else if (type === "personal" && openid) {
      // 获取用户个人对联历史
      const result = await db.execute({
        sql: `SELECT *
              FROM couplet_records
              WHERE openid = ?
              ORDER BY created_at DESC
              LIMIT ?`,
        args: [openid, limit],
      });

      // 计算统计信息
      const statsResult = await db.execute({
        sql: `SELECT 
              COUNT(*) as total_count,
              SUM(CASE WHEN score IS NOT NULL THEN 1 ELSE 0 END) as completed_count,
              AVG(CASE WHEN score IS NOT NULL THEN score END) as avg_score,
              COUNT(CASE WHEN is_shared = 1 THEN 1 END) as share_count
            FROM couplet_records
            WHERE openid = ?`,
        args: [openid],
      });

      const stats = statsResult.rows[0] as any;

      return NextResponse.json({
        type: "personal",
        records: (result.rows as any[]).map((row) => ({
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
          avgScore: parseFloat(stats.avg_score || 0).toFixed(2),
          shareCount: Number(stats.share_count) || 0,
        },
      });
    } else {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }
  } catch (error) {
    console.error("获取排行榜失败:", error);
    return NextResponse.json({ error: "获取排行榜失败，请重试" }, { status: 500 });
  }
}
