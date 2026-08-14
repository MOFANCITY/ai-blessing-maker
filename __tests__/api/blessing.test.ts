import { NextRequest } from "next/server";
import axios from "axios";
import * as aiService from "@/lib/ai-service";
import * as promptTemplates from "@/lib/prompt-templates";
import { db, historyDb } from "@/lib/db";
import { checkAndDeduct, refundUsage } from "@/lib/credits";

jest.mock("@/lib/ai-service");
jest.mock("@/lib/prompt-templates");
jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: { execute: jest.fn() },
  historyDb: { addHistory: jest.fn() },
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

import { POST } from "@/app/api/blessing/route";

const mockGenerateBlessing = aiService.generateBlessing as jest.MockedFunction<typeof aiService.generateBlessing>;
const mockCreateBlessingPrompt = promptTemplates.createBlessingPrompt as jest.MockedFunction<typeof promptTemplates.createBlessingPrompt>;
const mockExecute = db.execute as jest.MockedFunction<typeof db.execute>;
const mockAddHistory = historyDb.addHistory as jest.MockedFunction<typeof historyDb.addHistory>;
const mockCheckAndDeduct = checkAndDeduct as jest.MockedFunction<typeof checkAndDeduct>;
const mockRefundUsage = refundUsage as jest.MockedFunction<typeof refundUsage>;
const mockIsAxiosError = axios.isAxiosError as jest.MockedFunction<typeof axios.isAxiosError>;

function makeRequest(body: unknown) {
  return { json: jest.fn().mockResolvedValue(body) } as unknown as NextRequest;
}

const validRequest = {
  occasion: "birthday",
  festival: "",
  targetPerson: "friend",
  useSmartMode: false,
};

describe("POST /api/blessing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAxiosError.mockReturnValue(false);
    mockCheckAndDeduct.mockResolvedValue({ ok: true, balance: 10, needed: 0 });
    mockExecute.mockResolvedValue({ rows: [{ id: "user-1" }] } as never);
    mockAddHistory.mockResolvedValue({ id: 42 } as never);
  });

  it("returns generated content and its history id after charging", async () => {
    mockCreateBlessingPrompt.mockReturnValue("PROMPT");
    mockGenerateBlessing.mockResolvedValue("祝你生日快乐，健康快乐每一天！");

    const response = await POST(makeRequest(validRequest));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      blessing: "祝你生日快乐，健康快乐每一天！",
      recordId: 42,
    });
    expect(mockCheckAndDeduct).toHaveBeenCalledWith(db, "openid-1", "blessing");
    expect(mockRefundUsage).not.toHaveBeenCalled();
  });

  it("refunds exactly once when generation fails after charging", async () => {
    mockCreateBlessingPrompt.mockReturnValue("PROMPT");
    const error = new Error("AI unavailable");
    mockGenerateBlessing.mockRejectedValue(error);

    const response = await POST(makeRequest(validRequest));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "生成失败，请重试" });
    expect(mockRefundUsage).toHaveBeenCalledTimes(1);
    expect(mockRefundUsage).toHaveBeenCalledWith(db, "openid-1", "blessing");
  });

  it("does not refund when only the optional history write fails", async () => {
    mockCreateBlessingPrompt.mockReturnValue("PROMPT");
    mockGenerateBlessing.mockResolvedValue("已生成祝福");
    mockAddHistory.mockRejectedValue(new Error("history unavailable"));

    const response = await POST(makeRequest(validRequest));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ blessing: "已生成祝福", recordId: null });
    expect(mockRefundUsage).not.toHaveBeenCalled();
  });

  it("uses the friendly rate-limit message for an upstream 429", async () => {
    mockCreateBlessingPrompt.mockReturnValue("PROMPT");
    mockIsAxiosError.mockReturnValue(true);
    mockGenerateBlessing.mockRejectedValue({ response: { status: 429 } });

    const response = await POST(makeRequest(validRequest));

    await expect(response.json()).resolves.toEqual({ error: "请求太频繁，请稍后再试" });
    expect(mockRefundUsage).toHaveBeenCalledTimes(1);
  });
});
