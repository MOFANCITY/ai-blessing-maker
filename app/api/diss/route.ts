import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { generateBlessing } from "@/lib/ai-service";
import { createDissPrompt } from "@/lib/prompt-templates";
import { validateDissInput } from "@/lib/validation";
import { dissDb } from "@/lib/db";

const VALID_TONES = [
  "优雅反击",
  "一针见血",
  "幽默调侃",
  "高级讽刺",
  "直接怼",
  "捧杀式",
] as const;

interface DissRequest {
  situation?: unknown;
  tone?: unknown;
  target?: unknown;
  presetId?: unknown;
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
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
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

export async function POST(req: NextRequest) {
  try {
    const isDevelopment = process.env.NODE_ENV === "development";
    if (!isDevelopment) {
      const userAgent = req.headers.get("user-agent") || "";
      if (!userAgent.includes("MicroMessenger")) {
        return NextResponse.json(
          { error: "此应用仅支持微信小程序访问，请在微信中打开" },
          { status: 403 },
        );
      }
    }

    const auth = resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const body = (await req.json()) as DissRequest;
    const validation = validateDissInput(body);
    if (!validation.valid || !validation.cleaned) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { situation, tone, target, presetId } = validation.cleaned;
    if (!VALID_TONES.includes(tone as (typeof VALID_TONES)[number])) {
      return NextResponse.json({ error: "请选择怼人风格" }, { status: 400 });
    }

    const prompt = createDissPrompt(situation, tone, target);
    const diss = await generateBlessing(prompt);

    // Best-effort DB save; never block the response on it.
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
      dissId = record?.id;
    } catch (dbError) {
      console.error("插入怼人记录失败:", dbError);
    }

    return NextResponse.json({
      success: true,
      diss,
      tone,
      situation,
      dissId: dissId ?? null,
    });
  } catch (error) {
    console.error("生成回击失败:", error);

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
