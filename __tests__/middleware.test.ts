import { NextRequest } from "next/server";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

jest.mock("next/server", () => ({
  NextResponse: {
    next: jest.fn(() => new Response(null, { status: 200 })),
    json: jest.fn((body, init) => new Response(JSON.stringify(body), init)),
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  getClientIP: jest.fn(() => "127.0.0.1"),
  checkRateLimit: jest.fn(),
}));

import { config, middleware } from "@/middleware";

const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;
const mockGetClientIP = getClientIP as jest.MockedFunction<typeof getClientIP>;

function makeRequest(pathname: string, method: string) {
  return {
    method,
    nextUrl: { pathname },
    headers: new Headers({ "user-agent": "MicroMessenger" }),
  } as unknown as NextRequest;
}

describe("API middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      limit: 8,
      remaining: 7,
      resetTime: 123456,
    });
  });

  it("matches every API path so rate limiting can execute", () => {
    expect(config.matcher).toEqual(["/api/:path*"]);
  });

  it("rate-limits a high-cost generation POST", async () => {
    const request = makeRequest("/api/blessing", "POST");

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(mockGetClientIP).toHaveBeenCalledWith(request);
    expect(mockCheckRateLimit).toHaveBeenCalledWith("127.0.0.1");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("8");
  });

  it("does not spend rate-limit capacity on read-only API requests", async () => {
    const request = makeRequest("/api/couplet/leaderboard", "GET");

    await middleware(request);

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });
});
