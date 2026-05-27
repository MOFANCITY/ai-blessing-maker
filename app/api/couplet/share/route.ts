import { NextRequest, NextResponse } from "next/server";
import { resolveCoupletAuth } from "@/lib/couplet-api-auth";
import { coupletDb, userStatsDb } from "@/lib/db";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { recordId, shareType } = body;

    if (!recordId || !['friend', 'timeline'].includes(shareType)) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }

    // 确保用户统计表存在
    await userStatsDb.initUserStats(auth.openid);

    // 标记对联为已分享
    await coupletDb.markAsShared(recordId);

    // 根据分享类型计算积分
    const points = shareType === 'timeline' ? 10 : 5;

    // 添加积分
    await userStatsDb.addPoints(
      auth.openid,
      points,
      `分享对联到${shareType === 'timeline' ? '朋友圈' : '朋友'}`
    );

    // 获取更新后的用户统计
    const stats = await userStatsDb.getUserStats(auth.openid);

    return NextResponse.json({
      success: true,
      pointsAdded: points,
      totalPoints: stats?.total_points || 0,
      message: `+${points}积分`,
    });
  } catch (error) {
    console.error("分享记录失败:", error);
    return NextResponse.json({ error: "分享失败，请重试" }, { status: 500 });
  }
}
