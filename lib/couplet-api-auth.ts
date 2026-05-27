import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

export interface CoupletAuthContext {
  isDevelopment: boolean;
  openid: string;
}

export function resolveCoupletAuth(req: NextRequest): CoupletAuthContext | null {
  const isDevelopment = process.env.NODE_ENV === "development";

  if (!isDevelopment) {
    const userAgent = req.headers.get("user-agent") || "";
    if (!userAgent.includes("MicroMessenger")) {
      return null;
    }
  }

  if (isDevelopment) {
    return { isDevelopment: true, openid: "dev_openid_12345" };
  }

  const token =
    req.cookies.get("auth_token")?.value ||
    req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return null;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return null;
  }

  return { isDevelopment: false, openid: decoded.openid };
}
