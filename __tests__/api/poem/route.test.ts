import { NextRequest } from 'next/server';
import * as aiService from '@/lib/ai-service';
import * as promptTemplates from '@/lib/prompt-templates';
import * as dbModule from '@/lib/db';
import axios from 'axios';

jest.mock('@/lib/ai-service');
jest.mock('@/lib/prompt-templates');
jest.mock('@/lib/db', () => ({
  __esModule: true,
  db: { execute: jest.fn() },
  poemDb: {
    insertPoemRecord: jest.fn().mockResolvedValue({ id: 1 }),
    updatePoemUserLines: jest.fn().mockResolvedValue({ id: 1 }),
    getPoemHistory: jest.fn().mockResolvedValue([]),
  },
  dissDb: { insertDissRecord: jest.fn(), getDissHistory: jest.fn() },
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
const mockCreatePoemPrompt = promptTemplates.createPoemPrompt as jest.MockedFunction<typeof promptTemplates.createPoemPrompt>;
const mockInsertPoemRecord = dbModule.poemDb.insertPoemRecord as jest.MockedFunction<typeof dbModule.poemDb.insertPoemRecord>;
const mockIsAxiosError = axios.isAxiosError as jest.MockedFunction<typeof axios.isAxiosError>;

import { POST } from '@/app/api/poem/route';

function makeRequest(body: unknown) {
  return {
    json: jest.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

function makeProdRequest(body: unknown) {
  const headers = {
    get: (name: string) => {
      if (name.toLowerCase() === 'user-agent') return 'Mozilla/5.0 (MicroMessenger) test';
      return null;
    },
  };
  return {
    json: jest.fn().mockResolvedValue(body),
    headers,
    cookies: {
      get: () => undefined,
    },
  } as unknown as NextRequest;
}

describe('POST /api/poem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAxiosError.mockReturnValue(false);
    process.env.NODE_ENV = 'development';
  });

  describe('happy path', () => {
    it('200 — valid poem5 input returns 2 lines of exactly 5 chars each', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockGenerateBlessing.mockResolvedValue('春风拂柳岸\n细雨润花香');

      const response = await POST(makeRequest({ type: 'poem5', theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        lines: ['春风拂柳岸', '细雨润花香'],
        type: 'poem5',
        theme: '春天',
      });
      expect(mockGenerateBlessing).toHaveBeenCalledWith('PROMPT');
    });

    it('200 — valid poem7 input returns 2 lines of exactly 7 chars each', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockGenerateBlessing.mockResolvedValue('春风又绿江南岸\n明月何时照我还');

      const response = await POST(makeRequest({ type: 'poem7', theme: '思念' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.lines).toHaveLength(2);
      expect([...data.lines[0]]).toHaveLength(7);
      expect([...data.lines[1]]).toHaveLength(7);
    });

    it('200 — when AI returns more than 2 lines, takes the first 2', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockGenerateBlessing.mockResolvedValue('春风拂柳岸\n细雨润花香\n燕归寻旧垒\n人静倚斜阳');

      const response = await POST(makeRequest({ type: 'poem5', theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.lines).toEqual(['春风拂柳岸', '细雨润花香']);
    });

    it('passes extras to createPoemPrompt', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockGenerateBlessing.mockResolvedValue('春风拂柳岸\n细雨润花香');

      await POST(makeRequest({ type: 'poem5', theme: '春天', extras: '希望带梅花的意象' }));

      expect(mockCreatePoemPrompt).toHaveBeenCalledWith('poem5', '春天', false, '希望带梅花的意象');
    });

    it('passes gameMode=true to createPoemPrompt', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockGenerateBlessing.mockResolvedValue('春风拂柳岸\n细雨润花香');

      await POST(makeRequest({ type: 'poem5', theme: '春天', gameMode: true }));

      expect(mockCreatePoemPrompt).toHaveBeenCalledWith('poem5', '春天', true, undefined);
    });

    it('saves poem record to DB with joined aiLines and gameMode flag', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockGenerateBlessing.mockResolvedValue('春风拂柳岸\n细雨润花香');

      await POST(makeRequest({ type: 'poem5', theme: '春天', gameMode: true }));

      expect(mockInsertPoemRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'dev_openid_12345',
          type: 'poem5',
          theme: '春天',
          gameMode: true,
          aiLines: '春风拂柳岸\n细雨润花香',
        })
      );
    });
  });

  describe('input validation (400)', () => {
    it('400 — missing type', async () => {
      const response = await POST(makeRequest({ theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
      expect(mockGenerateBlessing).not.toHaveBeenCalled();
    });

    it('400 — invalid type', async () => {
      const response = await POST(makeRequest({ type: 'poem3', theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/类型/);
    });

    it('400 — missing theme', async () => {
      const response = await POST(makeRequest({ type: 'poem5' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/主题/);
    });

    it('400 — invalid theme', async () => {
      const response = await POST(makeRequest({ type: 'poem5', theme: '科幻' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/主题/);
    });

    it('400 — extras too long', async () => {
      const response = await POST(makeRequest({
        type: 'poem5',
        theme: '春天',
        extras: 'a'.repeat(201),
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/额外要求/);
    });
  });

  describe('AI response validation (500)', () => {
    it('500 — AI returns only 1 line', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockGenerateBlessing.mockResolvedValue('春风拂柳岸');

      const response = await POST(makeRequest({ type: 'poem5', theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });

    it('500 — AI returns lines with wrong char count', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockGenerateBlessing.mockResolvedValue('春风拂柳\n细雨润花香');

      const response = await POST(makeRequest({ type: 'poem5', theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });

    it('500 — AI service throws', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockGenerateBlessing.mockRejectedValue(new Error('AI down'));

      const response = await POST(makeRequest({ type: 'poem5', theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('生成失败，请重试');
    });

    it('500 — AI service throws axios 429', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockIsAxiosError.mockReturnValue(true);
      mockGenerateBlessing.mockRejectedValue({
        isAxiosError: true,
        response: { status: 429 },
        message: 'rate limit',
      });

      const response = await POST(makeRequest({ type: 'poem5', theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('请求太频繁，请稍后再试');
    });

    it('500 — AI service throws axios 401', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockIsAxiosError.mockReturnValue(true);
      mockGenerateBlessing.mockRejectedValue({
        isAxiosError: true,
        response: { status: 401 },
        message: 'unauthorized',
      });

      const response = await POST(makeRequest({ type: 'poem5', theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('服务暂时不可用');
    });

    it('500 — AI service throws axios 403', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockIsAxiosError.mockReturnValue(true);
      mockGenerateBlessing.mockRejectedValue({
        isAxiosError: true,
        response: { status: 403 },
        message: 'forbidden',
      });

      const response = await POST(makeRequest({ type: 'poem5', theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('服务暂时不可用');
    });

    it('500 — non-axios Error containing 429 in message', async () => {
      mockCreatePoemPrompt.mockReturnValue('PROMPT');
      mockIsAxiosError.mockReturnValue(false);
      mockGenerateBlessing.mockRejectedValue(new Error('Upstream returned 429'));

      const response = await POST(makeRequest({ type: 'poem5', theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('请求太频繁，请稍后再试');
    });
  });

  describe('auth', () => {
    it('401 — no auth token in production', async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const response = await POST(makeProdRequest({ type: 'poem5', theme: '春天' }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
      process.env.NODE_ENV = prev;
    });

    it('403 — non-WeChat user-agent in production', async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const req = {
        json: jest.fn().mockResolvedValue({ type: 'poem5', theme: '春天' }),
        headers: {
          get: (name: string) => (name.toLowerCase() === 'user-agent' ? 'Mozilla/5.0' : null),
        },
        cookies: { get: () => undefined },
      } as unknown as NextRequest;

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toMatch(/微信/);
      process.env.NODE_ENV = prev;
    });
  });
});
