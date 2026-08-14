import { NextRequest } from "next/server";
import { isWeChatRequest, resolveAuth } from "@/lib/api-auth";

export interface CoupletAuthContext {
  isDevelopment: boolean;
  openid: string;
}

/**
 * Compatibility wrapper for couplet routes.
 * Authentication itself is delegated to the shared, signature-verifying API
 * helper so all protected endpoints apply the same token rules.
 */
export function resolveCoupletAuth(req: NextRequest): CoupletAuthContext | null {
  if (!isWeChatRequest(req)) return null;

  const auth = resolveAuth(req);
  if (!auth) return null;

  return {
    isDevelopment: process.env.NODE_ENV === "development",
    openid: auth.openid,
  };
}
