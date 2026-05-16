import { firstName } from '@/lib/userIdentity';

describe('firstName', () => {
  test('single name returns as-is', () => {
    expect(firstName('Ben')).toBe('Ben');
  });

  test('two-word name returns first token', () => {
    expect(firstName('Ben Gardner')).toBe('Ben');
  });

  test('multi-word name returns first token', () => {
    expect(firstName('Mary Anne Smith Jones')).toBe('Mary');
  });

  test('trims leading whitespace', () => {
    expect(firstName('   Ben Gardner')).toBe('Ben');
  });

  test('trims trailing whitespace', () => {
    expect(firstName('Ben   ')).toBe('Ben');
  });

  test('collapses internal whitespace runs', () => {
    expect(firstName('Ben    Gardner')).toBe('Ben');
  });

  test('undefined input returns empty string', () => {
    expect(firstName(undefined)).toBe('');
  });

  test('null input returns empty string', () => {
    expect(firstName(null)).toBe('');
  });

  test('empty string returns empty string', () => {
    expect(firstName('')).toBe('');
  });

  test('whitespace-only string returns empty string', () => {
    expect(firstName('   ')).toBe('');
  });

  test('unicode name preserves accented characters', () => {
    expect(firstName('José Ángel')).toBe('José');
  });

  test('unicode multi-byte first name', () => {
    expect(firstName('Ángel Martínez')).toBe('Ángel');
  });
});
