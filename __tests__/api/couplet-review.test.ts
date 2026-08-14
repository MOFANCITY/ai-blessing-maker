import { checkAndDeduct, refundUsage } from "@/lib/credits";
import { generateBlessing } from "@/lib/ai-service";
import { coupletDb } from "@/lib/db";
import {
  isCoupletContentShareable,
  parseCoupletReviewJson,
  validateCoupletReviewRequest,
} from "@/lib/couplet-validation";

jest.mock("@/lib/db", () => ({ __esModule: true, db: { execute: jest.fn() }, coupletDb: { getCoupletRecord: jest.fn() } }));
jest.mock("@/lib/credits", () => ({ checkAndDeduct: jest.fn(), refundUsage: jest.fn() }));
jest.mock("@/lib/ai-service", () => ({ generateBlessing: jest.fn() }));
jest.mock("@/lib/prompt-templates", () => ({ createCoupletReviewPrompt: jest.fn(() => "PROMPT") }));
jest.mock("@/lib/couplet-api-auth", () => ({ resolveCoupletAuth: jest.fn(() => ({ openid: "openid-1" })) }));
jest.mock("@/lib/couplet-validation", () => ({
  COUPLET_REVIEW_FALLBACK: { score: 4, summary: "格式异常", strengths: [], suggestions: [], canShare: false },
  validateCoupletReviewRequest: jest.fn(() => ({ valid: true, upperLine: "春风送暖", lowerLine: "福气临门" })),
  isCoupletContentShareable: jest.fn(() => true),
  normalizeCoupletLine: jest.fn((line: string) => line),
  parseCoupletReviewJson: jest.fn(() => ({ score: 4, summary: "工整", strengths: ["对仗"], suggestions: [], canShare: true })),
}));
jest.mock("axios", () => ({ isAxiosError: jest.fn() }));

import { POST } from "@/app/api/couplet/review/route";

const mockCheckAndDeduct = checkAndDeduct as jest.MockedFunction<typeof checkAndDeduct>;
const mockRefundUsage = refundUsage as jest.MockedFunction<typeof refundUsage>;
const mockGenerateBlessing = generateBlessing as jest.MockedFunction<typeof generateBlessing>;
const mockShareable = isCoupletContentShareable as jest.MockedFunction<typeof isCoupletContentShareable>;
const mockParse = parseCoupletReviewJson as jest.MockedFunction<typeof parseCoupletReviewJson>;
const mockValidate = validateCoupletReviewRequest as jest.MockedFunction<typeof validateCoupletReviewRequest>;
const mockGetCoupletRecord = coupletDb.getCoupletRecord as jest.MockedFunction<typeof coupletDb.getCoupletRecord>;

describe("POST /api/couplet/review", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAndDeduct.mockResolvedValue({ ok: true, balanceAfter: 10 });
    mockGenerateBlessing.mockResolvedValue("review output");
    mockShareable.mockReturnValue(true);
    mockValidate.mockReturnValue({ valid: true, upperLine: "春风送暖", lowerLine: "福气临门" });
    mockParse.mockReturnValue({ score: 4, summary: "工整", strengths: ["对仗"], suggestions: [], canShare: true });
  });

  it("uses programmatic share policy rather than a model moderation claim", async () => {
    const response = await POST({ json: jest.fn().mockResolvedValue({}) } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      review: expect.objectContaining({ canShare: true, score: 4 }),
    });
    expect(mockRefundUsage).not.toHaveBeenCalled();
  });

  it("rejects deterministic unsafe content before charging or calling the model", async () => {
    mockShareable.mockReturnValue(false);

    const response = await POST({ json: jest.fn().mockResolvedValue({}) } as never);

    expect(response.status).toBe(400);
    expect(mockCheckAndDeduct).not.toHaveBeenCalled();
    expect(mockGenerateBlessing).not.toHaveBeenCalled();
    expect(mockRefundUsage).not.toHaveBeenCalled();
  });

  it("rejects a review whose submitted upper line differs from the owned record", async () => {
    mockValidate.mockReturnValue({ valid: true, upperLine: "替换上联", lowerLine: "福气临门", recordId: 7 });
    mockGetCoupletRecord.mockResolvedValue({ openid: "openid-1", upper_line: "原始上联", difficulty: "medium" } as never);

    const response = await POST({ json: jest.fn().mockResolvedValue({}) } as never);

    expect(response.status).toBe(400);
    expect(mockCheckAndDeduct).not.toHaveBeenCalled();
    expect(mockGenerateBlessing).not.toHaveBeenCalled();
  });

  it("refunds once if the model response fails strict schema validation", async () => {
    mockParse.mockReturnValue({ score: 4, summary: "格式异常", strengths: [], suggestions: [], canShare: false });

    const response = await POST({ json: jest.fn().mockResolvedValue({}) } as never);

    expect(response.status).toBe(502);
    expect(mockRefundUsage).toHaveBeenCalledTimes(1);
  });
});
