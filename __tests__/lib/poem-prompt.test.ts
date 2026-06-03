import { createPoemPrompt } from '@/lib/prompt-templates';

describe('createPoemPrompt', () => {
  describe('basic structure', () => {
    it('returns a non-empty string', () => {
      const prompt = createPoemPrompt('poem5', '春天');
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('includes the theme', () => {
      const prompt = createPoemPrompt('poem5', '春天');
      expect(prompt).toContain('春天');
    });

    it('includes the poem type label 五言 for poem5', () => {
      const prompt = createPoemPrompt('poem5', '春天');
      expect(prompt).toContain('五言');
    });

    it('includes the poem type label 七言 for poem7', () => {
      const prompt = createPoemPrompt('poem7', '新年');
      expect(prompt).toContain('七言');
    });
  });

  describe('generation mode (default gameMode=false)', () => {
    it('instructs AI to generate 2 lines (起承)', () => {
      const prompt = createPoemPrompt('poem5', '春天');
      expect(prompt).toMatch(/起|承/);
      expect(prompt).toMatch(/两行|2\s*行|两句/);
    });

    it('specifies 5-char lines for poem5', () => {
      const prompt = createPoemPrompt('poem5', '春天');
      expect(prompt).toContain('5');
    });

    it('specifies 7-char lines for poem7', () => {
      const prompt = createPoemPrompt('poem7', '新年');
      expect(prompt).toContain('7');
    });

    it('instructs one line per output line', () => {
      const prompt = createPoemPrompt('poem5', '春天');
      expect(prompt).toMatch(/一行|每行|分两行/);
    });

    it('instructs no quotes or labels in output', () => {
      const prompt = createPoemPrompt('poem5', '春天');
      expect(prompt).toMatch(/不带|不要|无需/);
    });
  });

  describe('gameMode evaluation (gameMode=true)', () => {
    it('instructs AI to evaluate user lines for tonal/rhyme consistency', () => {
      const prompt = createPoemPrompt('poem5', '春天', true);
      expect(prompt).toMatch(/评估|评价|评判|点评|审/);
      expect(prompt).toMatch(/平仄|韵|格律|音律/);
    });

    it('mentions all 4 user lines when provided via extras', () => {
      const userLines = '春风拂柳岸\n细雨润花香\n燕归寻旧垒\n人静倚斜阳';
      const prompt = createPoemPrompt('poem5', '春天', true, userLines);
      expect(prompt).toContain('春风拂柳岸');
      expect(prompt).toContain('细雨润花香');
      expect(prompt).toContain('燕归寻旧垒');
      expect(prompt).toContain('人静倚斜阳');
    });

    it('handles empty extras in gameMode (placeholder lines)', () => {
      const prompt = createPoemPrompt('poem5', '春天', true);
      expect(prompt).toContain('（空）');
    });

    it('does not require writing 2 lines (just evaluation)', () => {
      const prompt = createPoemPrompt('poem5', '春天', true);
      expect(prompt).toMatch(/评|审|判断/);
    });
  });

  describe('extras support', () => {
    it('includes extras when provided', () => {
      const prompt = createPoemPrompt('poem5', '春天', false, '希望带梅花的意象');
      expect(prompt).toContain('希望带梅花的意象');
    });

    it('does not include extras marker when not provided', () => {
      const prompt = createPoemPrompt('poem5', '春天');
      expect(prompt).not.toContain('额外要求：');
      expect(prompt).not.toContain('extras：');
    });
  });

  describe('output constraints', () => {
    it('instructs AI to stay on theme topic', () => {
      const prompt = createPoemPrompt('poem5', '春天');
      expect(prompt).toMatch(/主题|围绕/);
    });

    it('forbids mention of dangerous content (politics/violence/low-brow)', () => {
      const prompt = createPoemPrompt('poem5', '春天');
      expect(prompt).toMatch(/不.*[政暴低俗]|红线|敏感/);
    });
  });
});
