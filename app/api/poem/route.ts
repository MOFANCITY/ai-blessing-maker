import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { generateBlessing } from "@/lib/ai-service";
import { createPoemPrompt } from "@/lib/prompt-templates";
import { validatePoemInput } from "@/lib/validation";
import { db } from "@/lib/db";
import { resolveAuth, isWeChatRequest } from "@/lib/api-auth";
import { checkAndDeduct } from "@/lib/credits";

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
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return null;

  const firstTwo = lines.slice(0, 2);
  for (const line of firstTwo) {
    // Count only CJK chars; reject if any non-CJK chars remain or length doesn't match
    const cjkCount = [...line].filter((c) => /[\u4e00-\u9fff]/.test(c)).length;
    if (cjkCount !== expectedCharsPerLine) return null;
    // Also reject if there are any extra non-CJK chars (digits, latin, punctuation)
    if (line.length !== cjkCount) return null;
  }
  return firstTwo;
}

export async function POST(req: NextRequest) {
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

    const { type, theme, gameMode, extras } = validation.cleaned;
    const expectedCharsPerLine = type === "poem7" ? 7 : 5;

    // ── 积分检查 ──
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

    const prompt = createPoemPrompt(type, theme, gameMode, extras);
    const raw = await generateBlessing(prompt);

    const lines = parsePoemResponse(raw, expectedCharsPerLine);
    if (!lines) {
      return NextResponse.json(
        { error: "古诗生成格式不正确，请重试" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      lines,
      type,
      theme,
    });
  } catch (error) {
    console.error("生成古诗失败:", error);

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
