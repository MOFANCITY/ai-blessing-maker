import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { generateBlessing } from "@/lib/ai-service";
import { createCoupletReviewPrompt } from "@/lib/prompt-templates";
import {
  COUPLET_REVIEW_FALLBACK,
  parseCoupletReviewJson,
  isCoupletContentShareable,
  normalizeCoupletLine,
  validateCoupletReviewRequest,
} from "@/lib/couplet-validation";
import { resolveCoupletAuth } from "@/lib/couplet-api-auth";
import { db, coupletDb } from "@/lib/db";
import { checkAndDeduct, refundUsage } from "@/lib/credits";

export async function POST(req: NextRequest) {
  let chargedOpenid: string | null = null;
  let refundStarted = false;

  const refundOnce = async (openid: string) => {
    if (refundStarted) return;
    refundStarted = true;
    await refundUsage(db, openid, "couplet_review");
  };

  try {
    const auth = resolveCoupletAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const validation = validateCoupletReviewRequest(await req.json());
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    let difficulty: "simple" | "medium" | "hard" | undefined = "medium";
    let reviewedUpperLine = validation.upperLine!;
    if (validation.recordId) {
      const record = await coupletDb.getCoupletRecord(validation.recordId);
      if (!record || record.openid !== auth.openid) {
        return NextResponse.json({ error: "对联记录不存在" }, { status: 404 });
      }

      const storedUpperLine = normalizeCoupletLine(String(record.upper_line || ""));
      if (!storedUpperLine || storedUpperLine !== validation.upperLine) {
        return NextResponse.json(
          { error: "上联与原始对联记录不一致" },
          { status: 400 },
        );
      }
      reviewedUpperLine = storedUpperLine;
      if (record.difficulty) {
        difficulty = record.difficulty as "simple" | "medium" | "hard";
      }
    }

    // A shareable record must be approved from the exact persisted pair;
    // the model's response cannot grant this permission.
    if (!isCoupletContentShareable(reviewedUpperLine, validation.lowerLine!)) {
      return NextResponse.json(
        { error: "对联内容不符合分享要求，请修改后重试" },
        { status: 400 },
      );
    }

    const creditsCheck = await checkAndDeduct(db, auth.openid, "couplet_review");
    if (!creditsCheck.ok) {
      return NextResponse.json(
        {
          error: "当日免费次数已用尽，积分不足",
          code: "INSUFFICIENT_CREDITS",
          balance: creditsCheck.balance,
          needed: creditsCheck.needed,
        },
        { status: 403 },
      );
    }
    chargedOpenid = auth.openid;

    const raw = await generateBlessing(
      createCoupletReviewPrompt(
        reviewedUpperLine,
        validation.lowerLine!,
        difficulty,
      ),
    );
    const parsedReview = parseCoupletReviewJson(raw);
    if (!parsedReview.canShare) {
      await refundOnce(auth.openid);
      chargedOpenid = null;
      return NextResponse.json(
        {
          error: "点评结果格式异常，请重试",
          review: COUPLET_REVIEW_FALLBACK,
        },
        { status: 502 },
      );
    }
    // Only deterministic validation decides whether a record may be shared.
    const review = { ...parsedReview, canShare: true };

    if (validation.recordId) {
      const updated = await coupletDb.updateCoupletScore(
        validation.recordId,
        validation.lowerLine!,
        review.score,
        review.summary,
        review.canShare,
      );
      if (!updated) throw new Error("对联记录更新失败");
    }

    chargedOpenid = null;
    return NextResponse.json({ review });
  } catch (error) {
    if (chargedOpenid) {
      try {
        await refundOnce(chargedOpenid);
      } catch (refundError) {
        console.error("评联退款失败:", refundError);
      }
    }

    console.error("评下联失败:", error);
    let errorMessage = "评联失败，请重试";
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) errorMessage = "请求太频繁，请稍后再试";
      else if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage = "服务暂时不可用";
      }
    } else if (error instanceof Error && error.message.includes("429")) {
      errorMessage = "请求太频繁，请稍后再试";
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
