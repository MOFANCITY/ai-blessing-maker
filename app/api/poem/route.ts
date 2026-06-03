import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { generateBlessing } from "@/lib/ai-service";
import { createPoemPrompt } from "@/lib/prompt-templates";
import { validatePoemInput } from "@/lib/validation";
import { poemDb } from "@/lib/db";

interface PoemRequest {
  type?: unknown;
  theme?: unknown;
  gameMode?: unknown;
  extras?: unknown;
}

function resolveAuth(req: NextRequest): { openid: string } | null {
  const isDevelopment = process.env.NODE_ENV === "development";
  if (isDevelopment) {
    return { openid: "dev_openid_12345" };
  }

  const userAgent = req.headers.get("user-agent") || "";
  if (!userAgent.includes("MicroMessenger")) {
    return null;
  }

  const token =
    req.cookies.get("auth_token")?.value ||
    req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) return null;

  // Inline lightweight decode to avoid coupling this route to a specific auth lib.
  // In dev we never reach here; production callers must send a real token.
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString());
    if (typeof decoded.openid === "string" && decoded.openid.length > 0) {
      return { openid: decoded.openid };
    }
  } catch {
    return null;
  }
  return null;
}

function parsePoemResponse(raw: string, expectedCharsPerLine: number): string[] | null {
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
    const expectedCharsPerLine = type === 'poem7' ? 7 : 5;

    const prompt = createPoemPrompt(type, theme, gameMode, extras);
    const raw = await generateBlessing(prompt);

    const lines = parsePoemResponse(raw, expectedCharsPerLine);
    if (!lines) {
      return NextResponse.json(
        { error: "古诗生成格式不正确，请重试" },
        { status: 500 }
      );
    }

    // Best-effort DB save; never block the response on it.
    try {
      await poemDb.insertPoemRecord({
        user_id: auth.openid,
        type,
        theme,
        gameMode,
        extras: extras ?? null,
        aiLines: lines.join('\n'),
        result: null,
      });
    } catch (dbError) {
      console.error("插入古诗记录失败:", dbError);
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
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage = "服务暂时不可用";
      }
    } else if (error instanceof Error && error.message.includes("429")) {
      errorMessage = "请求太频繁，请稍后再试";
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
