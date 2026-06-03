import { NextRequest } from 'next/server';
import * as aiService from '@/lib/ai-service';
import * as promptTemplates from '@/lib/prompt-templates';
import * as dissDb from '@/lib/db';
import axios from 'axios';

jest.mock('@/lib/ai-service');
jest.mock('@/lib/prompt-templates');
jest.mock('@/lib/db', () => ({
  __esModule: true,
  db: { execute: jest.fn() },
  dissDb: {
    insertDissRecord: jest.fn().mockResolvedValue({ id: 1 }),
    getDissHistory: jest.fn().mockResolvedValue([]),
  },
  userDb: {},
  historyDb: {},
  coupletDb: {},
  userStatsDb: {},
  achievementDb: {},
  dailyChallengeDb: {},
  TABLES: {},
}));
jest.mock('axios', () => ({
  isAxiosError: jest.fn(),
}));

const mockGenerateBlessing = aiService.generateBlessing as jest.MockedFunction<typeof aiService.generateBlessing>;
const mockCreateDissPrompt = promptTemplates.createDissPrompt as jest.MockedFunction<typeof promptTemplates.createDissPrompt>;
const mockInsertDissRecord = dissDb.dissDb.insertDissRecord as jest.MockedFunction<typeof dissDb.dissDb.insertDissRecord>;
const mockIsAxiosError = axios.isAxiosError as jest.MockedFunction<typeof axios.isAxiosError>;

// Import the route AFTER mocks are set up
import { POST } from '@/app/api/diss/route';

describe('POST /api/diss', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAxiosError.mockReturnValue(false);
    process.env.NODE_ENV = 'development';
  });

  function makeRequest(body: unknown) {
    return {
      json: jest.fn().mockResolvedValue(body),
    } as unknown as NextRequest;
  }

  it('200 — valid input generates diss and saves record', async () => {
    const body = {
      situation: '老板天天画饼说年轻人要多奉献',
      tone: '高级讽刺',
    };
    const fakePrompt = 'PROMPT';
    const fakeReply = '您这饼画得比我小学美术课还抽象';

    mockCreateDissPrompt.mockReturnValue(fakePrompt);
    mockGenerateBlessing.mockResolvedValue(fakeReply);
    mockInsertDissRecord.mockResolvedValue({ id: 1 } as any);

    const response = await POST(makeRequest(body));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      diss: fakeReply,
      tone: '高级讽刺',
      situation: '老板天天画饼说年轻人要多奉献',
    });
    expect(mockCreateDissPrompt).toHaveBeenCalledWith('老板天天画饼说年轻人要多奉献', '高级讽刺', undefined);
    expect(mockGenerateBlessing).toHaveBeenCalledWith(fakePrompt);
    expect(mockInsertDissRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        situation: '老板天天画饼说年轻人要多奉献',
        tone: '高级讽刺',
        result: fakeReply,
      })
    );
  });

  it('200 — passes target and presetId through to prompt and DB', async () => {
    const body = {
      situation: '同事天天让我帮他带咖啡',
      tone: '幽默调侃',
      target: '同事老王',
      presetId: 'colleague',
    };

    mockCreateDissPrompt.mockReturnValue('PROMPT');
    mockGenerateBlessing.mockResolvedValue('我开的是友情咖啡馆吗？');

    const response = await POST(makeRequest(body));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.diss).toBe('我开的是友情咖啡馆吗？');
    expect(mockCreateDissPrompt).toHaveBeenCalledWith('同事天天让我帮他带咖啡', '幽默调侃', '同事老王');
    expect(mockInsertDissRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        target: '同事老王',
        preset_id: 'colleague',
      })
    );
  });

  it('400 — missing situation', async () => {
    const response = await POST(makeRequest({ tone: '优雅反击' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
    expect(mockGenerateBlessing).not.toHaveBeenCalled();
  });

  it('400 — situation too short', async () => {
    const response = await POST(makeRequest({ situation: '你好', tone: '优雅反击' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('太短');
  });

  it('400 — situation too long', async () => {
    const longSituation = 'a'.repeat(501);
    const response = await POST(makeRequest({ situation: longSituation, tone: '优雅反击' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('太长');
  });

  it('400 — invalid tone', async () => {
    const response = await POST(makeRequest({ situation: '老板天天画饼', tone: '脏话回击' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('风格');
  });

  it('400 — target too long', async () => {
    const response = await POST(makeRequest({
      situation: '老板天天画饼',
      tone: '优雅反击',
      target: 'x'.repeat(51),
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('称呼');
  });

  it('400 — blocked pattern in situation', async () => {
    const response = await POST(makeRequest({
      situation: '<script>alert(1)</script> 老板天天画饼',
      tone: '直接怼',
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
  });

  it('500 — AI service error returns friendly message', async () => {
    mockCreateDissPrompt.mockReturnValue('PROMPT');
    mockGenerateBlessing.mockRejectedValue(new Error('AI down'));

    const response = await POST(makeRequest({
      situation: '老板天天画饼',
      tone: '优雅反击',
    }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('生成失败，请重试');
  });

  it('500 — axios 429 returns rate limit message', async () => {
    mockCreateDissPrompt.mockReturnValue('PROMPT');
    mockIsAxiosError.mockReturnValue(true);
    mockGenerateBlessing.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429 },
      message: 'rate limit',
    });

    const response = await POST(makeRequest({
      situation: '老板天天画饼',
      tone: '优雅反击',
    }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('请求太频繁，请稍后再试');
  });

  it('500 — request body parse error returns friendly message', async () => {
    const badRequest = {
      json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
    } as unknown as NextRequest;

    const response = await POST(badRequest);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('生成失败，请重试');
  });
});
