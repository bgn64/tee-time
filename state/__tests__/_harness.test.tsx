/**
 * Test-harness smoke test.
 *
 * Verifies the Phase 0 scaffolding loads — the manual supabase mock is
 * picked up, the provider tree renders, and the basic mock control helpers
 * work end-to-end. If this test fails, every later phase is dead in the
 * water; fix the harness first.
 */

import { renderHook, act } from '@testing-library/react-native';

jest.mock('@/state/supabaseClient');

import { supabase } from '@/state/supabaseClient';

import {
  mockSupabaseReset,
  mockSupabaseSeedTable,
  mockSupabaseSeedSession,
  mockSupabaseEmitAuthEvent,
  mockSupabaseEmitChannel,
  mockSupabaseChannelSubscribeCount,
  renderHookWithProviders,
} from './test-utils';
import { useTheme } from '@/state/ThemeContext';

beforeEach(() => {
  mockSupabaseReset();
});

describe('supabase mock surface', () => {
  test('from(table).select() returns seeded rows', async () => {
    mockSupabaseSeedTable('profiles', [
      { user_id: 'u1', handle: 'alice', display_name: 'Alice', avatar_color: '#fff' },
    ]);
    const { data, error } = await supabase.from('profiles').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].handle).toBe('alice');
  });

  test('from(table).eq() filters rows', async () => {
    mockSupabaseSeedTable('profiles', [
      { user_id: 'u1', handle: 'alice' },
      { user_id: 'u2', handle: 'bob' },
    ]);
    const { data } = await supabase.from('profiles').select('*').eq('handle', 'bob');
    expect(data).toHaveLength(1);
    expect(data?.[0].user_id).toBe('u2');
  });

  test('upsert with onConflict updates in place', async () => {
    mockSupabaseSeedTable('roster_players', [
      { owner_user_id: 'me', id: 'player-1', nickname: 'old', linked_user_id: 'u1' },
    ]);
    await supabase
      .from('roster_players')
      .upsert(
        { owner_user_id: 'me', id: 'player-1', nickname: 'new', linked_user_id: 'u1' },
        { onConflict: 'owner_user_id,id' }
      );
    const { data } = await supabase.from('roster_players').select('*').eq('id', 'player-1');
    expect(data).toHaveLength(1);
    expect(data?.[0].nickname).toBe('new');
  });

  test('auth.onAuthStateChange receives emitted events', () => {
    const cb = jest.fn();
    supabase.auth.onAuthStateChange(cb);
    mockSupabaseEmitAuthEvent('TOKEN_REFRESHED', { user: { id: 'u1' } });
    expect(cb).toHaveBeenCalledWith('TOKEN_REFRESHED', { user: { id: 'u1' } });
  });

  test('channel(name).subscribe() is tracked', () => {
    supabase
      .channel('demo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 't' }, () => {})
      .subscribe();
    expect(mockSupabaseChannelSubscribeCount('demo')).toBe(1);
  });

  test('mockSupabaseEmitChannel delivers to handlers', () => {
    const cb = jest.fn();
    supabase
      .channel('demo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 't' }, cb)
      .subscribe();
    mockSupabaseEmitChannel('demo', 't', 'INSERT', { new: { id: 1 } });
    expect(cb).toHaveBeenCalledWith({ eventType: 'INSERT', new: { id: 1 } });
  });
});

describe('renderHookWithProviders', () => {
  test('provider tree mounts and Theme hook works', async () => {
    const { result } = renderHookWithProviders(() => useTheme());
    // ThemeProvider hydrates async; wait a tick.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.colors).toBeDefined();
    expect(typeof result.current.themeName).toBe('string');
  });

  test('seeded session is visible via supabase.auth.getSession', async () => {
    mockSupabaseSeedSession({ user: { id: 'u-seed', email: 't@example.com' } });
    const { data } = await supabase.auth.getSession();
    expect(data.session?.user.id).toBe('u-seed');
  });
});
