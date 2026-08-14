import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { generateBlessing } from "@/lib/ai-service";
import { createDissPrompt } from "@/lib/prompt-templates";
import { validateDissInput } from "@/lib/validation";
import { db, dissDb } from "@/lib/db";
import { resolveAuth, isWeChatRequest } from "@/lib/api-auth";
import { checkAndDeduct, refundUsage } from "@/lib/credits";

const VALID_TONES = ["优雅反击", "一针见血", "幽默调侃", "高级讽刺", "直接怼", "捧杀式"] as const;

interface DissRequest {
  situation?: unknown;
  tone?: unknown;
  target?: unknown;
  presetId?: unknown;
}

export async function POST(req: NextRequest) {
  let chargedOpenid: string | null = null;

  try {
    if (!isWeChatRequest(req)) {
      return NextResponse.json(
        { error: "此应用仅支持微信小程序访问，请在微信中打开" },
        { status: 403 },
      );
    }
    const auth = resolveAuth(req);
    if (!auth) return NextResponse.json({ error: "用户未登录" }, { status: 401 });

    const validation = validateDissInput((await req.json()) as DissRequest);
    if (!validation.valid || !validation.cleaned) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { situation, tone, target, presetId } = validation.cleaned;
    if (!VALID_TONES.includes(tone as (typeof VALID_TONES)[number])) {
      return NextResponse.json({ error: "请选择怼人风格" }, { status: 400 });
    }

    const creditsCheck = await checkAndDeduct(db, auth.openid, "diss");
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

    const diss = await generateBlessing(createDissPrompt(situation, tone, target));

    // Persistence is non-critical after a successful generation, so do not
    // remove the user's charge merely because history storage is unavailable.
    let dissId: number | undefined;
    try {
      const record = await dissDb.insertDissRecord({
        user_id: auth.openid,
        situation,
        tone,
        target: target ?? null,
        preset_id: presetId ?? null,
        result: diss,
      });
      dissId = Number((record as unknown as { id?: number })?.id ?? 0) || undefined;
    } catch (dbError) {
      console.error("插入怼人记录失败:", dbError);
    }

    chargedOpenid = null;
    return NextResponse.json({ success: true, diss, tone, situation, dissId: dissId ?? null });
  } catch (error) {
    if (chargedOpenid) {
      try {
        await refundUsage(db, chargedOpenid, "diss");
      } catch (refundError) {
        console.error("巧妙回应退款失败:", refundError);
      }
    }
    console.error("生成回击失败:", error);

    let errorMessage = "生成失败，请重试";
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) errorMessage = "请求太频繁，请稍后再试";
      else if (error.response?.status === 401 || error.response?.status === 403) errorMessage = "服务暂时不可用";
    } else if (error instanceof Error && error.message.includes("429")) {
      errorMessage = "请求太频繁，请稍后再试";
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
