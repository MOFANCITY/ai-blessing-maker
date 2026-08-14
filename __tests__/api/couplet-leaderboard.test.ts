import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isWeChatRequest, resolveAuth } from "@/lib/api-auth";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: { execute: jest.fn() },
}));
jest.mock("@/lib/api-auth", () => ({
  isWeChatRequest: jest.fn(() => true),
  resolveAuth: jest.fn(() => ({ openid: "owner-openid" })),
}));

import { GET } from "@/app/api/couplet/leaderboard/route";

const mockExecute = db.execute as jest.MockedFunction<typeof db.execute>;
const mockIsWeChatRequest = isWeChatRequest as jest.MockedFunction<typeof isWeChatRequest>;
const mockResolveAuth = resolveAuth as jest.MockedFunction<typeof resolveAuth>;

function makeRequest(path: string) {
  return new NextRequest(`https://example.test${path}`);
}

describe("GET /api/couplet/leaderboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsWeChatRequest.mockReturnValue(true);
    mockResolveAuth.mockReturnValue({ openid: "owner-openid" });
  });

  it("uses the authenticated identity for personal history and ignores query openid", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [{
          id: 7,
          upper_line: "春风送暖",
          lower_line: "福气临门",
          theme: "新春",
          difficulty: "normal",
          score: 5,
          review_summary: "工整",
          is_shared: 0,
          created_at: "2026-01-01T00:00:00.000Z",
        }],
      } as never)
      .mockResolvedValueOnce({
        rows: [{ total_count: 1, completed_count: 1, avg_score: 5, share_count: 0 }],
      } as never);

    const response = await GET(makeRequest("/api/couplet/leaderboard?type=personal&limit=20&openid=victim-openid"));

    expect(response.status).toBe(200);
    expect(mockExecute.mock.calls[0][0]).toEqual(expect.objectContaining({ args: ["owner-openid", 20] }));
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      type: "personal",
      records: [expect.objectContaining({ recordId: 7, isShared: 0 })],
    }));
  });

  it("requires authenticated identity before accessing any leaderboard data", async () => {
    mockResolveAuth.mockReturnValue(null);

    const response = await GET(makeRequest("/api/couplet/leaderboard?type=personal"));

    expect(response.status).toBe(401);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejects invalid type and limit before querying the database", async () => {
    const invalidLimitResponse = await GET(makeRequest("/api/couplet/leaderboard?type=weekly&limit=0"));
    const invalidTypeResponse = await GET(makeRequest("/api/couplet/leaderboard?type=all&limit=20"));

    expect(invalidLimitResponse.status).toBe(400);
    expect(invalidTypeResponse.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("uses the current weekly window and authenticated user for weekly rank", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ score: 5, shared_at: "2026-08-10T01:00:00.000Z" }] } as never)
      .mockResolvedValueOnce({ rows: [{ rank_position: 3 }] } as never);

    const response = await GET(makeRequest("/api/couplet/leaderboard?type=weekly&limit=20"));

    expect(response.status).toBe(200);
    const weeklyQuery = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    const userBestQuery = mockExecute.mock.calls[1][0] as { sql: string; args: unknown[] };
    expect(weeklyQuery.sql).toContain("cr.shared_at >= ?");
    expect(weeklyQuery.args).toHaveLength(2);
    expect(userBestQuery.args[0]).toBe("owner-openid");
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ type: "weekly", userRank: 4 }));
  });
});
