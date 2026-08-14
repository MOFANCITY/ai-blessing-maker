import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { generateBlessing } from "@/lib/ai-service";
import { createPoemPrompt } from "@/lib/prompt-templates";
import { validatePoemInput } from "@/lib/validation";
import { db, poemDb } from "@/lib/db";
import { resolveAuth, isWeChatRequest } from "@/lib/api-auth";
import { checkAndDeduct, refundUsage } from "@/lib/credits";

interface PoemRequest {
  type?: unknown;
  theme?: unknown;
  gameMode?: unknown;
  extras?: unknown;
}

function parsePoemResponse(
  raw: string,
  expectedCharsPerLine: number,
): string[] | null {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const firstTwo = lines.slice(0, 2);
  for (const line of firstTwo) {
    const characters = Array.from(line);
    if (
      characters.length !== expectedCharsPerLine ||
      characters.some((character) => !/[\u4e00-\u9fff]/.test(character))
    ) {
      return null;
    }
  }
  return firstTwo;
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
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const body = (await req.json()) as PoemRequest;
    const validation = validatePoemInput(body);
    if (!validation.valid || !validation.cleaned) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { type, theme, extras } = validation.cleaned;
    const expectedCharsPerLine = type === "poem7" ? 7 : 5;

    const creditsCheck = await checkAndDeduct(db, auth.openid, "poem");
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

    // Stage one always produces the first two lines. Reviewing a completed
    // poem is a separate responsibility and must not change this contract.
    const raw = await generateBlessing(createPoemPrompt(type, theme, false, extras));
    const lines = parsePoemResponse(raw, expectedCharsPerLine);
    if (!lines) {
      await refundUsage(db, auth.openid, "poem");
      chargedOpenid = null;
      return NextResponse.json(
        { error: "古诗生成格式不正确，请重试" },
        { status: 500 },
      );
    }

    // A draft is the server-side source of truth for the collaborative poem.
    // Completing it later is restricted to this owner and this record.
    const record = await poemDb.insertPoemRecord({
      user_id: auth.openid,
      type,
      theme,
      gameMode: true,
      extras: extras ?? null,
      aiLines: lines.join("\n"),
    });

    chargedOpenid = null;
    return NextResponse.json({
      success: true,
      lines,
      type,
      theme,
      recordId: Number((record as unknown as { id: number }).id),
    });
  } catch (error) {
    if (chargedOpenid) {
      try {
        await refundUsage(db, chargedOpenid, "poem");
      } catch (refundError) {
        console.error("古诗生成退款失败:", refundError);
      }
    }

    console.error("生成古诗失败:", error);
    let errorMessage = "生成失败，请重试";
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
