import { NextRequest, NextResponse } from "next/server";
import { resolveCoupletAuth } from "@/lib/couplet-api-auth";
import { dailyChallengeDb } from "@/lib/db";

function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

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

    const today = getTodayDateString();

    // 获取或创建今日挑战
    let challenge = await dailyChallengeDb.getDailyChallenge(today);

    if (!challenge) {
      // 如果今日挑战不存在，生成一个新的
      // 实际应用中，这里应该调用 AI 生成上联
      const themes = ["春节", "元宵", "贺寿", "乔迁", "日常"];
      const difficulties = ["simple", "medium", "hard"];
      const randomTheme = themes[Math.floor(Math.random() * themes.length)];
      const randomDifficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

      // 这里暂时使用示例上联，实际应该调用生成 API
      const exampleUpperLines = {
        "春节": "新春到来百花艳",
        "元宵": "灯谜烁烁春宵明",
        "贺寿": "寿星耀彩百年康",
        "乔迁": "新居落成家业昌",
        "日常": "岁月如歌人生长",
      };

      const upperLine = (exampleUpperLines as any)[randomTheme] || exampleUpperLines["日常"];

      challenge = await dailyChallengeDb.createDailyChallenge({
        date: today,
        upperLine,
        theme: randomTheme,
        difficulty: randomDifficulty,
      });
    }

    // 获取用户今日记录（如果存在）
    const userRecord = await dailyChallengeDb.getUserDailyRecord(auth.openid, today);

    return NextResponse.json({
      date: today,
      upperLine: challenge.upper_line,
      theme: challenge.theme,
      difficulty: challenge.difficulty,
      userRecord: userRecord ? {
        score: userRecord.score,
        timeSpent: userRecord.time_spent,
        isLimitMode: userRecord.is_limit_mode,
        sharedAt: userRecord.shared_at,
      } : null,
    });
  } catch (error) {
    console.error("获取每日挑战失败:", error);
    return NextResponse.json({ error: "获取每日挑战失败，请重试" }, { status: 500 });
  }
}
