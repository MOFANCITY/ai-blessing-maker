import { NextRequest, NextResponse } from "next/server";
import { resolveCoupletAuth } from "@/lib/couplet-api-auth";
import { achievementDb, userStatsDb, coupletDb } from "@/lib/db";

const BADGE_DEFINITIONS = {
  novice: {
    id: "novice",
    name: "新手对联师",
    description: "完成首个3星评分的下联",
    icon: "🌟",
    requirement: { type: "first_3_star", value: 1 },
  },
  enthusiast: {
    id: "enthusiast",
    name: "对联爱好者",
    description: "累计完成5个对联",
    icon: "⭐",
    requirement: { type: "total_couplets", value: 5 },
  },
  master: {
    id: "master",
    name: "对联大师",
    description: "5个对联平均分≥4星",
    icon: "⭐⭐",
    requirement: { type: "avg_score", value: 4 },
  },
  sharing_expert: {
    id: "sharing_expert",
    name: "分享达人",
    description: "分享10次对联",
    icon: "🎁",
    requirement: { type: "total_shares", value: 10 },
  },
  spring_expert: {
    id: "spring_expert",
    name: "春节达人",
    description: "春节主题对联≥5个",
    icon: "🧧",
    requirement: { type: "theme_count", value: 5, theme: "春节" },
  },
  lantern_expert: {
    id: "lantern_expert",
    name: "元宵达人",
    description: "元宵主题对联≥5个",
    icon: "🏮",
    requirement: { type: "theme_count", value: 5, theme: "元宵" },
  },
  viral: {
    id: "viral",
    name: "炸裂分享",
    description: "某个对联被分享≥5次",
    icon: "🚀",
    requirement: { type: "viral_share", value: 5 },
  },
};

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

    const auth = resolveCoupletAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    // 初始化用户成就（第一次调用时）
    await achievementDb.initAchievements(auth.openid);

    // 获取用户所有成就
    const achievements = await achievementDb.getUserAchievements(auth.openid);

    // 检查是否需要解锁新成就
    const stats = await userStatsDb.getUserStats(auth.openid);
    const coupletCount = await coupletDb.getUserCoupletCount(auth.openid);

    const userAchievementsMap = new Map(
      achievements.map((a: any) => [a.badge_id, a])
    );

    const result = Object.values(BADGE_DEFINITIONS).map((badge: any) => ({
      id: badge.id,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      unlocked: userAchievementsMap.get(badge.id)?.unlocked_at ? true : false,
      progress: userAchievementsMap.get(badge.id)?.progress || 0,
      unlockedAt: userAchievementsMap.get(badge.id)?.unlocked_at || null,
    }));

    return NextResponse.json({
      achievements: result,
      stats: {
        totalPoints: stats?.total_points || 0,
        totalCouplets: coupletCount || 0,
        totalShares: stats?.total_shares || 0,
        avgScore: stats?.avg_score || 0,
      },
    });
  } catch (error) {
    console.error("获取成就失败:", error);
    return NextResponse.json({ error: "获取成就失败，请重试" }, { status: 500 });
  }
}
