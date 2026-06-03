import { validatePoemInput, VALID_POEM_THEMES } from '@/lib/validation';

const VALID_THEMES = VALID_POEM_THEMES as unknown as string[];

describe('validatePoemInput', () => {
  describe('valid input', () => {
    it('passes with poem5 + theme', () => {
      const result = validatePoemInput({ type: 'poem5', theme: '春天' });
      expect(result.valid).toBe(true);
      expect(result.cleaned).toEqual({
        type: 'poem5',
        theme: '春天',
        gameMode: false,
        extras: undefined,
      });
    });

    it('passes with poem7 + theme', () => {
      const result = validatePoemInput({ type: 'poem7', theme: '新年' });
      expect(result.valid).toBe(true);
      expect(result.cleaned?.type).toBe('poem7');
    });

    it('passes with gameMode=true', () => {
      const result = validatePoemInput({ type: 'poem5', theme: '春天', gameMode: true });
      expect(result.valid).toBe(true);
      expect(result.cleaned?.gameMode).toBe(true);
    });

    it('passes with extras under 200 chars', () => {
      const result = validatePoemInput({
        type: 'poem5',
        theme: '春天',
        extras: '希望带一些梅花的意象',
      });
      expect(result.valid).toBe(true);
      expect(result.cleaned?.extras).toBe('希望带一些梅花的意象');
    });

    it('trims whitespace from theme and extras', () => {
      const result = validatePoemInput({
        type: 'poem5',
        theme: '  春天  ',
        extras: '  风格清雅  ',
      });
      expect(result.valid).toBe(true);
      expect(result.cleaned?.theme).toBe('春天');
      expect(result.cleaned?.extras).toBe('风格清雅');
    });

    it('cleaned object contains exactly 4 fields', () => {
      const result = validatePoemInput({ type: 'poem5', theme: '春天' });
      expect(result.valid).toBe(true);
      expect(Object.keys(result.cleaned!).sort()).toEqual(
        ['extras', 'gameMode', 'theme', 'type']
      );
    });
  });

  describe('type validation', () => {
    it('rejects missing type', () => {
      const result = validatePoemInput({ theme: '春天' });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/类型/);
    });

    it('rejects invalid type', () => {
      const result = validatePoemInput({ type: 'poem3', theme: '春天' });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/类型/);
    });

    it.each(['poem5', 'poem7'])('accepts valid type %s', (type) => {
      const result = validatePoemInput({ type, theme: '春天' });
      expect(result.valid).toBe(true);
    });
  });

  describe('theme validation', () => {
    it('rejects missing theme', () => {
      const result = validatePoemInput({ type: 'poem5' });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/主题/);
    });

    it('rejects invalid theme not in list', () => {
      const result = validatePoemInput({ type: 'poem5', theme: '科幻' });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/主题/);
    });

    it.each(VALID_THEMES)('accepts valid theme %s', (theme) => {
      const result = validatePoemInput({ type: 'poem5', theme });
      expect(result.valid).toBe(true);
      expect(result.cleaned?.theme).toBe(theme);
    });
  });

  describe('gameMode validation', () => {
    it('defaults gameMode to false when missing', () => {
      const result = validatePoemInput({ type: 'poem5', theme: '春天' });
      expect(result.cleaned?.gameMode).toBe(false);
    });

    it('rejects non-boolean gameMode', () => {
      const result = validatePoemInput({ type: 'poem5', theme: '春天', gameMode: 'yes' });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/游戏模式/);
    });
  });

  describe('extras validation', () => {
    it('rejects extras longer than 200 chars', () => {
      const result = validatePoemInput({
        type: 'poem5',
        theme: '春天',
        extras: 'a'.repeat(201),
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/额外要求/);
    });

    it('accepts extras of exactly 200 chars', () => {
      const result = validatePoemInput({
        type: 'poem5',
        theme: '春天',
        extras: 'a'.repeat(200),
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('rejects null input', () => {
      const result = validatePoemInput(null as unknown as Record<string, unknown>);
      expect(result.valid).toBe(false);
    });

    it('rejects non-object input', () => {
      const result = validatePoemInput('not an object' as unknown as Record<string, unknown>);
      expect(result.valid).toBe(false);
    });
  });
});
