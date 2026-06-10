/**
 * 统一 API 认证解析
 *
 * 从 Next.js Request 中提取并验证用户身份。
 * 消除各路由中重复的 resolveAuth 内联函数。
 *
 * 使用方式：
 *   import { resolveAuth } from "@/lib/api-auth";
 *
 *   const auth = resolveAuth(req);
 *   if (!auth) return NextResponse.json({ error: "用户未登录" }, { status: 401 });
 *
 *   // auth.openid 可用
 */

import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

export interface AuthInfo {
  openid: string;
}

/**
 * 从请求中解析认证信息
 *
 * 优先级：
 *   1. Cookie: auth_token
 *   2. Header: Authorization: Bearer <token>
 *
 * @returns AuthInfo 如果认证成功，null 如果未登录或 token 无效
 */
export function resolveAuth(req: NextRequest): AuthInfo | null {
  const isDevelopment = process.env.NODE_ENV === "development";
  if (isDevelopment) {
    return { openid: "dev_openid_12345" };
  }

  const token =
    req.cookies.get("auth_token")?.value ||
    req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded || typeof decoded.openid !== "string") return null;

  return { openid: decoded.openid };
}

/**
 * 检查请求是否来自微信小程序（仅生产环境启用）
 */
export function isWeChatRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const ua = req.headers.get("user-agent") || "";
  return ua.includes("MicroMessenger");
}
