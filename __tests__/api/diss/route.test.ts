import { NextRequest } from "next/server";
import axios from "axios";
import * as aiService from "@/lib/ai-service";
import * as promptTemplates from "@/lib/prompt-templates";
import { db, dissDb } from "@/lib/db";
import { checkAndDeduct, refundUsage } from "@/lib/credits";

jest.mock("@/lib/ai-service");
jest.mock("@/lib/prompt-templates");
jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: { execute: jest.fn() },
  dissDb: { insertDissRecord: jest.fn() },
}));
jest.mock("@/lib/api-auth", () => ({
  isWeChatRequest: jest.fn(() => true),
  resolveAuth: jest.fn(() => ({ openid: "openid-1" })),
}));
jest.mock("@/lib/credits", () => ({
  checkAndDeduct: jest.fn(),
  refundUsage: jest.fn(),
}));
jest.mock("axios", () => ({ isAxiosError: jest.fn() }));

import { POST } from "@/app/api/diss/route";

const mockGenerateBlessing = aiService.generateBlessing as jest.MockedFunction<typeof aiService.generateBlessing>;
const mockCreateDissPrompt = promptTemplates.createDissPrompt as jest.MockedFunction<typeof promptTemplates.createDissPrompt>;
const mockInsertDissRecord = dissDb.insertDissRecord as jest.MockedFunction<typeof dissDb.insertDissRecord>;
const mockCheckAndDeduct = checkAndDeduct as jest.MockedFunction<typeof checkAndDeduct>;
const mockRefundUsage = refundUsage as jest.MockedFunction<typeof refundUsage>;
const mockIsAxiosError = axios.isAxiosError as jest.MockedFunction<typeof axios.isAxiosError>;

function makeRequest(body: unknown) {
  return { json: jest.fn().mockResolvedValue(body) } as unknown as NextRequest;
}

const validRequest = {
  situation: "老板天天画饼说年轻人要多奉献",
  tone: "高级讽刺",
};

describe("POST /api/diss", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAndDeduct.mockResolvedValue({ ok: true, balance: 10, needed: 0 });
    mockInsertDissRecord.mockResolvedValue({ id: 9 } as never);
    mockIsAxiosError.mockReturnValue(false);
  });

  it("generates, persists, and returns a response after charging", async () => {
    mockCreateDissPrompt.mockReturnValue("PROMPT");
    mockGenerateBlessing.mockResolvedValue("您这饼画得比小学美术课还抽象");

    const response = await POST(makeRequest(validRequest));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      diss: "您这饼画得比小学美术课还抽象",
      tone: "高级讽刺",
      situation: validRequest.situation,
      dissId: 9,
    });
    expect(mockCheckAndDeduct).toHaveBeenCalledWith(db, "openid-1", "diss");
    expect(mockInsertDissRecord).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "openid-1",
      result: "您这饼画得比小学美术课还抽象",
    }));
    expect(mockRefundUsage).not.toHaveBeenCalled();
  });

  it("refunds exactly once when AI generation fails after charging", async () => {
    mockCreateDissPrompt.mockReturnValue("PROMPT");
    mockGenerateBlessing.mockRejectedValue(new Error("AI unavailable"));

    const response = await POST(makeRequest(validRequest));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "生成失败，请重试" });
    expect(mockRefundUsage).toHaveBeenCalledTimes(1);
    expect(mockRefundUsage).toHaveBeenCalledWith(db, "openid-1", "diss");
  });

  it("does not refund when only best-effort record storage fails", async () => {
    mockCreateDissPrompt.mockReturnValue("PROMPT");
    mockGenerateBlessing.mockResolvedValue("已生成回应");
    mockInsertDissRecord.mockRejectedValue(new Error("record store unavailable"));

    const response = await POST(makeRequest(validRequest));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ diss: "已生成回应", dissId: null }));
    expect(mockRefundUsage).not.toHaveBeenCalled();
  });

  it("rejects invalid input before charging", async () => {
    const response = await POST(makeRequest({ tone: "优雅反击" }));

    expect(response.status).toBe(400);
    expect(mockCheckAndDeduct).not.toHaveBeenCalled();
  });

  it("uses the friendly upstream rate-limit message and refunds", async () => {
    mockCreateDissPrompt.mockReturnValue("PROMPT");
    mockIsAxiosError.mockReturnValue(true);
    mockGenerateBlessing.mockRejectedValue({ response: { status: 429 } });

    const response = await POST(makeRequest(validRequest));

    await expect(response.json()).resolves.toEqual({ error: "请求太频繁，请稍后再试" });
    expect(mockRefundUsage).toHaveBeenCalledTimes(1);
  });
});
