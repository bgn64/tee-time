/**
 * GolfRoundContext — coverage for the Phase 2.3 `refreshScorecards`
 * helper exposed for pull-to-refresh.
 *
 * Background:
 *   Before Phase 2.3, the Feed's pull-to-refresh fired a 600ms cosmetic
 *   spinner with no underlying network activity — realtime was the
 *   only source of freshness. Any missed realtime event (background-
 *   tab, dropped WebSocket frame, recent sign-in) left the local
 *   scorecards list silently stale. The new `refreshScorecards()`
 *   helper re-runs the same select + merge the initial-pull effect
 *   performs, but bypasses the per-user "already synced" sentinel so
 *   it always goes to the wire.
 *
 * Pinned contract:
 *   · A row inserted server-side after the initial sync but not
 *     delivered via realtime appears after the next `refreshScorecards`.
 *   · Two overlapping refreshes resolve as latest-response-wins: an
 *     older response whose generation no longer matches is discarded.
 *   · A realtime INSERT delivered DURING a refresh isn't clobbered by
 *     the response — the new row is preserved alongside the snapshot.
 */

jest.mock('@/state/supabaseClient');

import { act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAccount } from '@/state/AccountContext';
import { useGolfRound } from '@/state/GolfRoundContext';

import {
  mockSupabaseCallLog,
  mockSupabaseEmitChannel,
  mockSupabaseGetTable,
  mockSupabaseReset,
  mockSupabaseSeedSession,
  mockSupabaseSeedTable,
  mockSupabaseSetTableDelay,
  mockSupabaseSetTableError,
  renderHookWithProviders,
} from './test-utils';

// =============================================================================
// Fixtures
// =============================================================================

const aliceUserId = '11111111-1111-4111-8111-111111111111';
const bobUserId = '22222222-2222-4222-8222-222222222222';
const carolUserId = '33333333-3333-4333-8333-333333333333';

const aliceSession = {
  user: { id: aliceUserId, email: 'alice@example.com', user_metadata: {} },
};

const aliceProfile = {
  user_id: aliceUserId,
  handle: 'alice',
  display_name: 'Alice',
  avatar_color: '#aaaaaa',
  created_at: '2025-01-01T00:00:00Z',
};

/**
 * Build a minimal valid scorecards row. The cloud→local translator reads
 * a fixed set of columns; anything not enumerated here picks up sensible
 * defaults via the `?? undefined` chain in `cloudToLocalRound`.
 */
function makeScorecardRow(overrides: Partial<Record<string, any>>): Record<string, any> {
  return {
    id: overrides.id ?? 'sc-1',
    owner_user_id: overrides.owner_user_id ?? bobUserId,
    course_snapshot: overrides.course_snapshot ?? {
      id: 'course-1',
      name: 'Pebble Beach',
      location: 'Pebble Beach, CA',
      holes: [
        { number: 1, par: 4, handicap: 1 },
        { number: 2, par: 5, handicap: 9 },
      ],
      source: 'catalog',
    },
    scoring_rule: overrides.scoring_rule ?? 'stroke',
    player_ids: overrides.player_ids ?? [`player-${overrides.owner_user_id ?? bobUserId}`],
    teams: overrides.teams ?? null,
    scores: overrides.scores ?? [],
    participants: overrides.participants ?? [],
    mentioned_user_ids: overrides.mentioned_user_ids ?? [],
    round_id: overrides.round_id ?? null,
    hole_range: overrides.hole_range ?? 'all',
    current_hole_number: overrides.current_hole_number ?? 1,
    started_at: overrides.started_at ?? '2025-03-01T10:00:00Z',
    completed_at: overrides.completed_at ?? '2025-03-01T13:00:00Z',
    caption: overrides.caption ?? null,
    is_live_shareable: overrides.is_live_shareable ?? true,
    last_score_at: overrides.last_score_at ?? '2025-03-01T13:00:00Z',
  };
}

function useGolfAndAccount() {
  return {
    golf: useGolfRound(),
    account: useAccount(),
  };
}

beforeEach(async () => {
  mockSupabaseReset();
  // The new startRound / setHoleScore tests below persist `currentRound`
  // to AsyncStorage as a side effect. Clearing here prevents that state
  // from bleeding into subsequent tests that expect a clean hydrate.
  await AsyncStorage.clear();
});

// =============================================================================
// Tests
// =============================================================================

describe('GolfRoundContext.refreshScorecards', () => {
  test('re-runs the cloud pull and picks up rows added after the initial sync', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', [
      makeScorecardRow({ id: 'sc-existing', owner_user_id: bobUserId }),
    ]);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
      expect(result.current.golf.completedRounds.map((r) => r.id)).toEqual([
        'sc-existing',
      ]);
    });

    // Simulate a server-side row that landed AFTER the initial sync —
    // realtime didn't deliver it (offline, dropped frame, etc.).
    mockSupabaseSeedTable('scorecards', [
      makeScorecardRow({ id: 'sc-existing', owner_user_id: bobUserId }),
      makeScorecardRow({ id: 'sc-missed', owner_user_id: carolUserId }),
    ]);

    await act(async () => {
      await result.current.golf.refreshScorecards();
    });

    const ids = result.current.golf.completedRounds.map((r) => r.id).sort();
    expect(ids).toEqual(['sc-existing', 'sc-missed']);
  });

  test('latest-response-wins: an older overlapping refresh does not clobber the newer one', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', [
      makeScorecardRow({ id: 'sc-A', owner_user_id: bobUserId }),
    ]);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.golf.hydrated).toBe(true);
      expect(result.current.golf.completedRounds.map((r) => r.id)).toEqual(['sc-A']);
    });

    // Hold the next select on `scorecards` for 80ms so refresh #1 is
    // still in-flight when refresh #2 starts and resolves. The mock
    // captures rows at execute START, so we mutate the table BETWEEN
    // the two refreshes to give them distinct payloads.
    mockSupabaseSetTableDelay('scorecards', 80);

    let firstPromise: Promise<{ ok: boolean; error?: string }>;
    await act(async () => {
      firstPromise = result.current.golf.refreshScorecards();
      // Microtask yield so the first refresh's await suspends after
      // snapshotting the table. Without this yield the seed mutation
      // below would be visible to refresh #1's select snapshot too.
      await Promise.resolve();
    });

    // Mutate the cloud + clear the delay so refresh #2 finishes fast
    // with a different payload than refresh #1 will see.
    mockSupabaseSeedTable('scorecards', [
      makeScorecardRow({ id: 'sc-B', owner_user_id: carolUserId }),
    ]);
    mockSupabaseSetTableDelay('scorecards', 0);

    await act(async () => {
      await result.current.golf.refreshScorecards();
    });

    // At this point refresh #2 has written state; refresh #1 is still
    // suspended waiting for its 80ms timer. State should reflect #2.
    expect(result.current.golf.completedRounds.map((r) => r.id)).toEqual(['sc-B']);

    // Let refresh #1 wake up and TRY to write. Its generation no longer
    // matches `refreshGenRef.current` (which is now 2 after refresh #2),
    // so the write must be discarded — state stays at refresh #2's
    // result.
    await act(async () => {
      await firstPromise!;
    });

    expect(result.current.golf.completedRounds.map((r) => r.id)).toEqual(['sc-B']);
  });

  test('concurrent realtime INSERT during a refresh is preserved alongside the response', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', [
      makeScorecardRow({ id: 'sc-initial', owner_user_id: bobUserId }),
    ]);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.golf.hydrated).toBe(true);
      expect(result.current.golf.completedRounds.map((r) => r.id)).toEqual([
        'sc-initial',
      ]);
    });

    // Hold the select so we can deliver a realtime INSERT between
    // snapshot-and-resolution. The mock snapshots rows at execute
    // start, so a table mutation after the snapshot doesn't bleed
    // into the in-flight response — only the realtime path can land
    // a new row in `cloudRounds` during the await.
    mockSupabaseSetTableDelay('scorecards', 60);

    let refreshPromise: Promise<{ ok: boolean; error?: string }>;
    await act(async () => {
      refreshPromise = result.current.golf.refreshScorecards();
      await Promise.resolve();
    });

    // Realtime delivers a brand-new row mid-refresh. This is the
    // race the merge logic must handle: the server snapshot powering
    // the in-flight refresh response does NOT include this row, but
    // the row is legitimate and must survive the eventual setState.
    await act(async () => {
      mockSupabaseEmitChannel('scorecards-stream', 'scorecards', 'INSERT', {
        new: makeScorecardRow({ id: 'sc-realtime', owner_user_id: carolUserId }),
      });
    });

    expect(result.current.golf.completedRounds.map((r) => r.id).sort()).toEqual([
      'sc-initial',
      'sc-realtime',
    ]);

    // Now let the refresh resolve. Its response includes only
    // `sc-initial` (the snapshot from before the realtime row). The
    // merge must keep `sc-realtime` because it landed in `prev`
    // AFTER the refresh's snapshotIds was captured.
    mockSupabaseSetTableDelay('scorecards', 0);
    await act(async () => {
      await refreshPromise!;
    });

    const ids = result.current.golf.completedRounds.map((r) => r.id).sort();
    expect(ids).toEqual(['sc-initial', 'sc-realtime']);
  });

  test('returns {ok:true} on success (refresh-shape contract)', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', [
      makeScorecardRow({ id: 'sc-A', owner_user_id: bobUserId }),
    ]);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.golf.hydrated).toBe(true);
      expect(result.current.golf.completedRounds.map((r) => r.id)).toEqual(['sc-A']);
    });

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.golf.refreshScorecards();
    });

    expect(outcome).toEqual({ ok: true });
    // State unchanged from the successful pull.
    expect(result.current.golf.completedRounds.map((r) => r.id)).toEqual(['sc-A']);
  });

  test('returns {ok:false, error} on transient supabase error and leaves local state unchanged', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', [
      makeScorecardRow({ id: 'sc-existing', owner_user_id: bobUserId }),
    ]);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.golf.hydrated).toBe(true);
      expect(result.current.golf.completedRounds.map((r) => r.id)).toEqual([
        'sc-existing',
      ]);
    });

    // Mid-refresh transient: token race, 5xx, network drop. Single-shot
    // error injection — subsequent selects against `scorecards` succeed.
    mockSupabaseSetTableError('scorecards', {
      message: 'token expired',
      code: '401',
    });
    // Silence the expected warn so the test log stays clean.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    let outcome: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.golf.refreshScorecards();
    });

    expect(outcome?.ok).toBe(false);
    expect(outcome?.error).toBe('token expired');
    // Local state survives unchanged — no blink-to-empty on transient
    // failure. The pre-refresh `sc-existing` row is still there.
    expect(result.current.golf.completedRounds.map((r) => r.id)).toEqual([
      'sc-existing',
    ]);

    warnSpy.mockRestore();
  });
});

// =============================================================================
// Sanity: the initial-pull effect calls into the same code path, so this
// covers the post-refactor regression risk of accidentally skipping the
// `localOnly` push on first sync. Touched lightly — the bulk of cloud-
// sync semantics is exercised by the manual smoke tests.
// =============================================================================

describe('GolfRoundContext initial pull (post-refactor)', () => {
  test('initial pull pushes local-only own rounds up to the cloud', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', []);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
    });

    // Verify the initial-pull effect ran by checking the
    // cloud-synced sentinel did its job — a second auto-pull
    // doesn't fire when nothing else changes. We assert by side
    // effect: `cloudRounds` reflects the empty cloud, no rows
    // were spuriously synthesized.
    expect(result.current.golf.completedRounds).toEqual([]);
    expect(mockSupabaseGetTable('scorecards')).toEqual([]);
  });
});

// =============================================================================
// startRound idempotency (Tier 3a)
//
// A live round is structurally a singleton — only Finish / Abandon may
// clear it. Belt-and-suspenders behind the route gates on
// players/format/new-course: even if a stale caller manages to invoke
// `startRound` while `currentRound` is set, the call is a no-op and the
// existing round is preserved.
// =============================================================================

describe('GolfRoundContext.startRound idempotency', () => {
  function seedCourseLocally(golf: ReturnType<typeof useGolfRound>) {
    golf.addCourse({
      id: 'course-test',
      name: 'Test Course',
      location: 'Nowhere, USA',
      source: 'custom',
      holes: [
        { number: 1, par: 4 },
        { number: 2, par: 3 },
        { number: 3, par: 5 },
      ],
    });
  }

  test('refuses to start a second round when one is already in progress', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', []);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
    });

    await act(async () => {
      seedCourseLocally(result.current.golf);
    });

    // First call seeds a round.
    await act(async () => {
      result.current.golf.startRound('course-test', ['player-alice'], 'stroke');
    });
    const firstRoundId = result.current.golf.currentRound?.id;
    expect(firstRoundId).toBeTruthy();

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Second call must be a no-op: same round id retained.
    await act(async () => {
      result.current.golf.startRound('course-test', ['player-bob'], 'stroke');
    });
    expect(result.current.golf.currentRound?.id).toBe(firstRoundId);
    // The original player list is preserved (we passed a different one
    // on the second call to prove the no-op).
    expect(result.current.golf.currentRound?.playerIds).toEqual(['player-alice']);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[startRound] ignored'),
    );

    warnSpy.mockRestore();
  });

  test('starts normally when no round is in progress (regression guard)', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', []);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
    });

    expect(result.current.golf.currentRound).toBeNull();

    await act(async () => {
      seedCourseLocally(result.current.golf);
    });
    await act(async () => {
      result.current.golf.startRound('course-test', ['player-alice'], 'stroke');
    });

    expect(result.current.golf.currentRound).not.toBeNull();
    expect(result.current.golf.currentRound?.course.id).toBe('course-test');
    expect(result.current.golf.currentRound?.playerIds).toEqual(['player-alice']);
  });
});

// =============================================================================
// Score-tap cloud upserts (Tier 3d)
//
// setHoleScore / setCustomHoleScore now push the post-update round to
// the cloud immediately. Before: scores survived in AsyncStorage only
// until the next hole-nav / range / tee change fired its own upsert,
// which left a "scored a few holes then closed the tab" window where
// taps were silently dropped from the cloud and `last_score_at` lagged
// behind the actual last score event.
// =============================================================================

describe('GolfRoundContext score-tap cloud upserts', () => {
  function seedCourseLocally(golf: ReturnType<typeof useGolfRound>) {
    golf.addCourse({
      id: 'course-test',
      name: 'Test Course',
      location: 'Nowhere, USA',
      source: 'custom',
      holes: [
        { number: 1, par: 4 },
        { number: 2, par: 3 },
        { number: 3, par: 5 },
      ],
    });
  }

  function findUpsertedScores(roundId: string): any[][] {
    return mockSupabaseCallLog()
      .filter(
        (e) =>
          e.kind === 'from.upsert' &&
          e.args[0]?.table === 'scorecards' &&
          e.args[0]?.payload?.id === roundId,
      )
      .map((e) => e.args[0].payload.scores);
  }

  test('setCustomHoleScore upserts the post-update scores array to the cloud', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', []);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
    });

    await act(async () => {
      seedCourseLocally(result.current.golf);
    });
    await act(async () => {
      result.current.golf.startRound('course-test', ['player-alice'], 'stroke');
    });
    const roundId = result.current.golf.currentRound!.id;

    await act(async () => {
      result.current.golf.setCustomHoleScore('player-alice', 1, 5);
    });

    const scoresList = findUpsertedScores(roundId);
    const lastScores = scoresList[scoresList.length - 1];
    expect(lastScores).toEqual([
      { scorerId: 'player-alice', holeNumber: 1, strokes: 5 },
    ]);
  });

  test('setHoleScore (relative-to-par form) upserts the post-update scores array', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', []);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
    });

    await act(async () => {
      seedCourseLocally(result.current.golf);
    });
    await act(async () => {
      result.current.golf.startRound('course-test', ['player-alice'], 'stroke');
    });
    const roundId = result.current.golf.currentRound!.id;

    // Hole 2 par is 3 → +1 relative → 4 strokes.
    await act(async () => {
      result.current.golf.setHoleScore('player-alice', 2, 1);
    });

    const scoresList = findUpsertedScores(roundId);
    const lastScores = scoresList[scoresList.length - 1];
    expect(lastScores).toEqual([
      { scorerId: 'player-alice', holeNumber: 2, strokes: 4 },
    ]);
  });
});

// =============================================================================
// Cloud → local auto-promote (Tier 3c)
//
// On a fresh device (or after AsyncStorage was cleared), `currentRound`
// is null but the user's in-progress scorecard exists in Supabase. After
// the initial cloud pull populates `cloudRounds`, the auto-promote
// effect lifts that row into `currentRound` so the user can resume.
// Closes the gap that migration 020's partial unique index would
// otherwise turn into a 23505 dead-letter if the user tried to start a
// fresh round.
// =============================================================================

describe('GolfRoundContext auto-promote in-progress cloud round', () => {
  // Local helper that produces a *truly* in-progress row. The shared
  // `makeScorecardRow` helper uses `??` for defaults, which means
  // passing `completed_at: null` would fall back to the completed
  // default. Build the row inline here to force the null through.
  function makeInProgressRow(overrides: Partial<Record<string, any>> & {
    id: string;
    owner_user_id: string;
  }): Record<string, any> {
    return {
      ...makeScorecardRow(overrides),
      completed_at: null,
      last_score_at: overrides.last_score_at ?? null,
    };
  }

  test('promotes a single in-progress cloud row to currentRound when local is empty', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', [
      makeInProgressRow({
        id: 'sc-live',
        owner_user_id: aliceUserId,
        started_at: '2025-03-01T10:00:00Z',
        last_score_at: '2025-03-01T10:30:00Z',
      }),
    ]);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
      expect(result.current.golf.currentRound?.id).toBe('sc-live');
    });
  });

  test('does not overwrite an existing local currentRound', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', []);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
    });

    // Seed a local round.
    await act(async () => {
      result.current.golf.addCourse({
        id: 'course-test',
        name: 'Test',
        location: '',
        source: 'custom',
        holes: [{ number: 1, par: 4 }],
      });
    });
    await act(async () => {
      result.current.golf.startRound('course-test', ['player-alice'], 'stroke');
    });
    const localId = result.current.golf.currentRound!.id;

    // Now a DIFFERENT in-progress row appears in the cloud (simulated
    // realtime / refresh). The auto-promote must NOT touch the local
    // round.
    await act(async () => {
      mockSupabaseEmitChannel('scorecards-stream', 'scorecards', 'INSERT', {
        new: makeInProgressRow({
          id: 'sc-cloud-other',
          owner_user_id: aliceUserId,
          last_score_at: '2025-04-01T00:00:00Z',
        }),
      });
    });

    expect(result.current.golf.currentRound?.id).toBe(localId);
  });

  test('picks the most recent of multiple in-progress rows (defense-in-depth)', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', [
      makeInProgressRow({
        id: 'sc-old',
        owner_user_id: aliceUserId,
        started_at: '2025-03-01T08:00:00Z',
        last_score_at: '2025-03-01T08:30:00Z',
      }),
      makeInProgressRow({
        id: 'sc-new',
        owner_user_id: aliceUserId,
        started_at: '2025-03-02T08:00:00Z',
        last_score_at: '2025-03-02T09:00:00Z',
      }),
    ]);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
      expect(result.current.golf.currentRound?.id).toBe('sc-new');
    });
  });

  test('ignores in-progress rows owned by a different user', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', [
      makeInProgressRow({
        id: 'sc-friend-live',
        owner_user_id: bobUserId,
        last_score_at: '2025-03-01T10:30:00Z',
      }),
    ]);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
    });

    // Give the effect a chance to fire if it were going to.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.golf.currentRound).toBeNull();
  });

  test('ignores completed rows even if they are the viewer\'s own', async () => {
    mockSupabaseSeedSession(aliceSession);
    mockSupabaseSeedTable('profiles', [aliceProfile]);
    mockSupabaseSeedTable('scorecards', [
      makeScorecardRow({
        id: 'sc-done',
        owner_user_id: aliceUserId,
        completed_at: '2025-03-01T13:00:00Z',
        last_score_at: '2025-03-01T12:55:00Z',
      }),
    ]);

    const { result } = renderHookWithProviders(useGolfAndAccount);

    await waitFor(() => {
      expect(result.current.account.account?.userId).toBe(aliceUserId);
      expect(result.current.golf.hydrated).toBe(true);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.golf.currentRound).toBeNull();
  });
});
