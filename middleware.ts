import { NextRequest, NextResponse } from "next/server";
import { getClientIP, checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMITED_GENERATION_PATHS = new Set([
  "/api/blessing",
  "/api/diss",
  "/api/poem",
  "/api/couplet",
  "/api/couplet/review",
  "/api/moments",
  "/api/speech",
  "/api/comic",
  "/api/novel",
  "/api/lyrics",
]);

function isWeChatMiniProgram(userAgent: string): boolean {
  return userAgent.includes("MicroMessenger");
}

function isRateLimitedGenerationRequest(req: NextRequest): boolean {
  return req.method === "POST" && RATE_LIMITED_GENERATION_PATHS.has(req.nextUrl.pathname);
}

export async function middleware(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    const userAgent = req.headers.get("user-agent") || "";
    if (!isWeChatMiniProgram(userAgent)) {
      return NextResponse.json(
        { error: "此应用仅支持微信小程序访问，请在微信中打开" },
        { status: 403 },
      );
    }
  }

  if (!isRateLimitedGenerationRequest(req)) {
    return NextResponse.next();
  }

  try {
    const limitResult = await checkRateLimit(getClientIP(req));
    if (!limitResult.success) {
      const response = NextResponse.json(
        {
          error: limitResult.error || "请求太频繁",
          resetTime: limitResult.resetTime,
          limit: limitResult.limit,
        },
        { status: 429 },
      );
      response.headers.set("X-RateLimit-Limit", String(limitResult.limit));
      response.headers.set("X-RateLimit-Remaining", String(limitResult.remaining));
      response.headers.set("X-RateLimit-Reset", String(limitResult.resetTime));
      return response;
    }

    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(limitResult.limit));
    response.headers.set("X-RateLimit-Remaining", String(limitResult.remaining));
    response.headers.set("X-RateLimit-Reset", String(limitResult.resetTime));
    return response;
  } catch (error) {
    console.error("中间件限流错误:", error);
    return NextResponse.json(
      { error: "服务暂时不可用，请稍后重试" },
      { status: 503 },
    );
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
