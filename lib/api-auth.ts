import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

export interface AuthInfo {
  userId: string;
  openid: string;
}

function getBearerToken(req: NextRequest): string | null {
  const authorization = req.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Resolve a verified identity for protected API routes.
 *
 * In production, tokens are accepted from the HttpOnly `auth_token` cookie
 * or an `Authorization: Bearer <token>` header used by the Mini Program.
 * Both paths pass through `verifyToken`, which verifies the HMAC signature
 * and expiration before returning an identity.
 */
export function getAuthToken(req: NextRequest): string | null {
  return req.cookies.get("auth_token")?.value ?? getBearerToken(req);
}

export function resolveAuth(req: NextRequest): AuthInfo | null {
  if (process.env.NODE_ENV === "development") {
    return { userId: "dev_user_12345", openid: "dev_openid_12345" };
  }

  const token = getAuthToken(req);
  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded || !decoded.userId || !decoded.openid) return null;

  return { userId: decoded.userId, openid: decoded.openid };
}

export function resolveMiniProgramAuth(req: NextRequest): AuthInfo | null {
  if (!isWeChatRequest(req)) return null;
  return resolveAuth(req);
}

/** Check that a production request originates from the WeChat Mini Program. */
export function isWeChatRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return (req.headers.get("user-agent") || "").includes("MicroMessenger");
}
