import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { checkAndDeduct, refundUsage } from "@/lib/credits";
import { generateBlessing } from "@/lib/ai-service";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: { execute: jest.fn() },
  coupletDb: { createCoupletRecord: jest.fn() },
}));
jest.mock("@/lib/credits", () => ({
  checkAndDeduct: jest.fn(),
  refundUsage: jest.fn(),
}));
jest.mock("@/lib/ai-service", () => ({ generateBlessing: jest.fn() }));
jest.mock("@/lib/prompt-templates", () => ({ createCoupletUpperPrompt: jest.fn(() => "PROMPT") }));
jest.mock("@/lib/couplet-validation", () => ({
  validateCoupletUpperRequest: jest.fn(() => ({ valid: true, theme: "新春", difficulty: "medium" })),
  normalizeUpperLineFromAI: jest.fn(() => "短句"),
}));
jest.mock("@/lib/couplet-api-auth", () => ({
  resolveCoupletAuth: jest.fn(() => ({ openid: "openid-1" })),
}));
jest.mock("axios", () => ({ isAxiosError: jest.fn() }));

import { POST } from "@/app/api/couplet/route";

const mockCheckAndDeduct = checkAndDeduct as jest.MockedFunction<typeof checkAndDeduct>;
const mockRefundUsage = refundUsage as jest.MockedFunction<typeof refundUsage>;
const mockGenerateBlessing = generateBlessing as jest.MockedFunction<typeof generateBlessing>;

describe("POST /api/couplet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAndDeduct.mockResolvedValue({ ok: true, balance: 10, needed: 0 });
  });

  it("refunds when the AI output cannot form a valid upper line", async () => {
    mockGenerateBlessing.mockResolvedValue("不合格输出");
    const request = { json: jest.fn().mockResolvedValue({ theme: "新春" }) } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "生成上联失败，请重试" });
    expect(mockRefundUsage).toHaveBeenCalledTimes(1);
    expect(mockRefundUsage).toHaveBeenCalledWith(db, "openid-1", "couplet");
  });
});
