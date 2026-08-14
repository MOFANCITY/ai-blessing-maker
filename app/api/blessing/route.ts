import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { generateBlessing } from "@/lib/ai-service";
import { createBlessingPrompt } from "@/lib/prompt-templates";
import { validateInput, cleanText } from "@/lib/validation";
import { db, historyDb } from "@/lib/db";
import { resolveAuth, isWeChatRequest } from "@/lib/api-auth";
import { checkAndDeduct, refundUsage } from "@/lib/credits";

interface BlessingRequest {
  occasion?: string;
  festival?: string;
  targetPerson?: string;
  style?: string;
  customDescription?: string;
  useSmartMode?: boolean;
  timestamp?: number;
  version?: string;
  userProfile?: "elderly" | "standard" | "young";
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

    const body: BlessingRequest = await req.json();
    const validation = validateInput(body);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
    if (body.customDescription) body.customDescription = cleanText(body.customDescription);
    if (body.occasion) body.occasion = cleanText(body.occasion);
    if (body.targetPerson) body.targetPerson = cleanText(body.targetPerson);
    if (body.style) body.style = cleanText(body.style);
    if (body.festival) body.festival = cleanText(body.festival);

    const creditsCheck = await checkAndDeduct(db, auth.openid, "blessing");
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

    const blessing = await generateBlessing(createBlessingPrompt(body));
    const userResult = await db.execute({
      sql: "SELECT id FROM users WHERE openid = ? LIMIT 1",
      args: [auth.openid],
    });
    const user = userResult.rows[0] as unknown as { id: string } | undefined;
    if (!user) throw new Error("用户不存在");

    // The generated content has already been delivered even if this optional
    // history write fails, so a history failure must not trigger a refund.
    let recordId: number | null = null;
    try {
      const record = await historyDb.addHistory({
        user_id: user.id,
        blessing,
        occasion: body.occasion,
        target_person: body.targetPerson,
        style: body.style || "传统",
      });
      recordId = Number((record as unknown as { id?: number })?.id ?? 0) || null;
    } catch (historyError) {
      console.error("插入历史记录失败:", historyError);
    }

    chargedOpenid = null;
    return NextResponse.json({ blessing, recordId });
  } catch (error) {
    if (chargedOpenid) {
      try {
        await refundUsage(db, chargedOpenid, "blessing");
      } catch (refundError) {
        console.error("祝福生成退款失败:", refundError);
      }
    }
    console.error("生成祝福语失败:", error);

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
