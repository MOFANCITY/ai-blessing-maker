import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { generateBlessing } from "@/lib/ai-service";
import { createCoupletReviewPrompt } from "@/lib/prompt-templates";
import {
  COUPLET_REVIEW_FALLBACK,
  parseCoupletReviewJson,
  validateCoupletReviewRequest,
} from "@/lib/couplet-validation";
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
    const validation = validateCoupletReviewRequest(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const prompt = createCoupletReviewPrompt(
      validation.upperLine!,
      validation.lowerLine!
    );
    const raw = await generateBlessing(prompt);
    const review = parseCoupletReviewJson(raw);

    if (!review.canShare) {
      return NextResponse.json(
        {
          error: "对联内容不符合分享要求，请修改后重试",
          review: COUPLET_REVIEW_FALLBACK,
        },
        { status: 400 }
      );
    }

    // 更新对联记录：保存下联、评分、总结等信息
    if (validation.recordId) {
      await coupletDb.updateCoupletScore(
        validation.recordId,
        review.score,
        review.summary,
        review.canShare
      );
    }

    // 初始化用户统计（如果不存在）
    await userStatsDb.initUserStats(auth.openid);

    return NextResponse.json({ review });
  } catch (error) {
    console.error("评下联失败:", error);

    let errorMessage = "评联失败，请重试";
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        errorMessage = "请求太频繁，请稍后再试";
      } else if (
        error.response?.status === 401 ||
        error.response?.status === 403
      ) {
        errorMessage = "服务暂时不可用";
      }
    } else if (error instanceof Error && error.message.includes("429")) {
      errorMessage = "请求太频繁，请稍后再试";
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
