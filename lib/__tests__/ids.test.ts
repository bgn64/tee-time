import { newRoundId, newPlayerId, newCourseId } from '@/lib/ids';

describe('id generators', () => {
  test('newRoundId returns a uuid-test-* value (mocked) and is unique across calls', () => {
    const a = newRoundId();
    const b = newRoundId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^uuid-test-/);
  });
  test('newPlayerId returns a uuid-test-* value', () => {
    expect(newPlayerId()).toMatch(/^uuid-test-/);
  });
  test('newCourseId returns a uuid-test-* value', () => {
    expect(newCourseId()).toMatch(/^uuid-test-/);
  });
  test('ids are unique in a tight loop', () => {
    const set = new Set();
    for (let i = 0; i < 100; i++) set.add(newRoundId());
    expect(set.size).toBe(100);
  });
});
