import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { generateBlessing } from "@/lib/ai-service";
import { createCoupletUpperPrompt } from "@/lib/prompt-templates";
import {
  normalizeUpperLineFromAI,
  validateCoupletUpperRequest,
} from "@/lib/couplet-validation";
import { resolveCoupletAuth } from "@/lib/couplet-api-auth";
import { db, coupletDb } from "@/lib/db";
import { checkAndDeduct, refundUsage } from "@/lib/credits";

export async function POST(req: NextRequest) {
  let chargedOpenid: string | null = null;

  try {
    const auth = resolveCoupletAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const body = await req.json();
    const validation = validateCoupletUpperRequest(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Validate before charging. This keeps malformed requests free.
    const creditsCheck = await checkAndDeduct(db, auth.openid, "couplet");
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

    const prompt = createCoupletUpperPrompt(
      validation.theme!,
      validation.difficulty,
    );
    const raw = await generateBlessing(prompt);
    const upperLine = normalizeUpperLineFromAI(raw);

    if (!upperLine || [...upperLine].length < 4) {
      try {
        await refundUsage(db, auth.openid, "couplet");
      } catch (refundError) {
        console.error("对联格式失败退款失败:", refundError);
      }
      chargedOpenid = null;
      return NextResponse.json(
        { error: "生成上联失败，请重试" },
        { status: 500 },
      );
    }

    // 创建对联记录，保存上联和难度信息
    const record = await coupletDb.createCoupletRecord({
      openid: auth.openid,
      upperLine,
      theme: validation.theme!,
      difficulty: validation.difficulty as
        | "simple"
        | "medium"
        | "hard"
        | undefined,
    });

    chargedOpenid = null;
    return NextResponse.json({
      upperLine,
      recordId: record.id,
    });
  } catch (error) {
    if (chargedOpenid) {
      try {
        await refundUsage(db, chargedOpenid, "couplet");
      } catch (refundError) {
        console.error("对联生成退款失败:", refundError);
      }
    }
    console.error("生成上联失败:", error);

    let errorMessage = "生成失败，请重试";
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
