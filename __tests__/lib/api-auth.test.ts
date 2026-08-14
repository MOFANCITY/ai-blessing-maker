import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";
import { resolveAuth } from "@/lib/api-auth";

function createRequest(options: {
  cookieToken?: string;
  authorization?: string;
} = {}): NextRequest {
  return {
    cookies: { get: jest.fn(() => options.cookieToken ? { value: options.cookieToken } : undefined) },
    headers: { get: jest.fn((name: string) => name.toLowerCase() === "authorization" ? options.authorization ?? null : null) },
  } as unknown as NextRequest;
}

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, "NODE_ENV", { configurable: true, value, writable: true });
}

describe("resolveAuth", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    setNodeEnv("production");
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv);
  });

  it("accepts a valid Mini Program Bearer token", () => {
    const token = generateToken("user-123", "openid-123");

    expect(resolveAuth(createRequest({ authorization: `Bearer ${token}` }))).toEqual({
      userId: "user-123",
      openid: "openid-123",
    });
  });

  it("rejects a token with a forged payload even when it names an openid", () => {
    const signature = generateToken("user-123", "openid-123").split(".")[2];
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "attacker", openid: "victim", exp: 4102444800 }))
      .toString("base64url");
    const forgedToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${forgedPayload}.${signature}`;

    expect(resolveAuth(createRequest({ authorization: `Bearer ${forgedToken}` }))).toBeNull();
  });

  it("accepts a valid auth_token cookie", () => {
    const token = generateToken("user-456", "openid-456");

    expect(resolveAuth(createRequest({ cookieToken: token }))).toEqual({
      userId: "user-456",
      openid: "openid-456",
    });
  });

  it("uses the explicit development identity only in development", () => {
    setNodeEnv("development");

    expect(resolveAuth(createRequest())).toEqual({
      userId: "dev_user_12345",
      openid: "dev_openid_12345",
    });
  });
});
