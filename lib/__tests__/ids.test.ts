import { newRoundId, newPlayerId, newCourseId } from '@/lib/ids';

const UUIDV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('id generators', () => {
  test('newRoundId returns a v4 UUID and is unique across calls', () => {
    const a = newRoundId();
    const b = newRoundId();
    expect(a).not.toBe(b);
    expect(a).toMatch(UUIDV4);
  });
  test('newPlayerId returns a v4 UUID', () => {
    expect(newPlayerId()).toMatch(UUIDV4);
  });
  test('newCourseId returns a v4 UUID', () => {
    expect(newCourseId()).toMatch(UUIDV4);
  });
  test('ids are unique in a tight loop', () => {
    const set = new Set();
    for (let i = 0; i < 1000; i++) set.add(newRoundId());
    expect(set.size).toBe(1000);
  });
});
