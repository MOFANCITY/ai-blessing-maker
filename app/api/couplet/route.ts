import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { generateBlessing } from "@/lib/ai-service";
import { createCoupletUpperPrompt } from "@/lib/prompt-templates";
import {
  normalizeUpperLineFromAI,
  validateCoupletUpperRequest,
} from "@/lib/couplet-validation";
import { resolveCoupletAuth } from "@/lib/couplet-api-auth";

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
    const validation = validateCoupletUpperRequest(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const prompt = createCoupletUpperPrompt(validation.theme!);
    const raw = await generateBlessing(prompt);
    const upperLine = normalizeUpperLineFromAI(raw);

    if (!upperLine || [...upperLine].length < 4) {
      return NextResponse.json(
        { error: "生成上联失败，请重试" },
        { status: 500 }
      );
    }

    return NextResponse.json({ upperLine });
  } catch (error) {
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
