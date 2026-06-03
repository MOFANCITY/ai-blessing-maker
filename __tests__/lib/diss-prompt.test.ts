import { createDissPrompt } from '@/lib/prompt-templates';

describe('createDissPrompt', () => {
  describe('basic structure', () => {
    it('returns a non-empty string', () => {
      const prompt = createDissPrompt('老板天天画饼', '高级讽刺');
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('includes the situation', () => {
      const prompt = createDissPrompt('老板天天画饼说年轻人要多奉献', '高级讽刺');
      expect(prompt).toContain('老板天天画饼说年轻人要多奉献');
    });

    it('includes the tone', () => {
      const prompt = createDissPrompt('老板天天画饼', '幽默调侃');
      expect(prompt).toContain('幽默调侃');
    });

    it('includes target when provided', () => {
      const prompt = createDissPrompt('你这件事办得不行', '一针见血', '同事');
      expect(prompt).toContain('同事');
    });

    it('omits target when not provided', () => {
      const prompt = createDissPrompt('你这件事办得不行', '一针见血');
      // Prompt should not contain "涉及人物" or empty target marker
      expect(prompt).not.toContain('涉及人物');
    });
  });

  describe('tone-specific guidance', () => {
    it.each([
      ['优雅反击'],
      ['一针见血'],
      ['幽默调侃'],
      ['高级讽刺'],
      ['直接怼'],
      ['捧杀式'],
    ])('includes guidance for tone %s', (tone) => {
      const prompt = createDissPrompt('老板天天画饼', tone);
      // Each tone should be referenced in the prompt guidance
      expect(prompt).toContain(tone);
    });

    it('refers to no profanity rule', () => {
      const prompt = createDissPrompt('老板天天画饼', '优雅反击');
      expect(prompt).toMatch(/[Mm]?粗口|不爆粗口|人身攻击|辱骂/);
    });

    it('refers to no protected class attacks', () => {
      const prompt = createDissPrompt('老板天天画饼', '优雅反击');
      expect(prompt).toMatch(/[Pp]rotected|受保护|歧视|群体|族群|宗教|性别/);
    });
  });

  describe('output constraints', () => {
    it('specifies 30-150 char output range', () => {
      const prompt = createDissPrompt('老板天天画饼', '高级讽刺');
      expect(prompt).toContain('30');
      expect(prompt).toContain('150');
    });

    it('instructs to output only the quote without labels', () => {
      const prompt = createDissPrompt('老板天天画饼', '高级讽刺');
      // Should instruct no quotes/labels/surrounding text
      expect(prompt).toMatch(/[Nn]o\s*(quote|labels?)|不要[「"《]|不要[「"《]?|不带标签|不要引号|不带引号/);
    });
  });

  describe('edge cases', () => {
    it('handles empty situation (still returns a string)', () => {
      const prompt = createDissPrompt('', '优雅反击');
      expect(typeof prompt).toBe('string');
    });

    it('handles tone that is one of the valid list', () => {
      const prompt = createDissPrompt('x'.repeat(50), '捧杀式', '老板');
      expect(prompt).toContain('捧杀式');
      expect(prompt).toContain('老板');
    });
  });
});
