/**
 * Shared test helpers for state-layer tests.
 *
 * Exposes:
 *   · `renderWithProviders(ui, opts?)` — mounts the real provider tree from
 *     `app/_layout.tsx` (Theme → Header → Account → Player → GolfRound →
 *     Social → Location → Onboarding) with seeded supabase mock state.
 *   · `renderHookWithProviders(hook, opts?)` — same wrapper, but renders a
 *     hook via @testing-library/react-native's renderHook.
 *
 * Re-exports the supabase mock helpers so test files can `import { ... }
 * from './test-utils'` and not chase the manual-mock path. Tests must still
 * call `jest.mock('@/state/supabaseClient')` at the top of the file to
 * activate the manual mock (jest's auto-mock convention).
 */

import { render, renderHook } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountProvider } from '@/state/AccountContext';
import { GolfRoundProvider } from '@/state/GolfRoundContext';
import { HeaderProvider } from '@/state/HeaderContext';
import { LocationProvider } from '@/state/LocationContext';
import { OnboardingProvider } from '@/state/OnboardingContext';
import { PlayerProvider } from '@/state/PlayerContext';
import { SocialProvider } from '@/state/SocialContext';
import { AppThemeProvider } from '@/state/ThemeContext';
import { ToastProvider } from '@/state/ToastContext';

import {
  mockSupabaseSeedSession,
  mockSupabaseSeedTable,
} from '@/state/supabaseClient';

export type RenderOptions = {
  /** Seed Supabase auth session before render. */
  session?: any;
  /** Seed Supabase `profiles` table before render. */
  profiles?: Array<{
    user_id: string;
    handle: string;
    display_name: string;
    avatar_color: string;
    created_at?: string;
  }>;
  /** Seed Supabase `roster_players` table before render. */
  rosterPlayers?: Array<{
    owner_user_id: string;
    id: string;
    nickname: string;
    color?: string | null;
    linked_user_id?: string | null;
  }>;
  /** Seed Supabase `scorecards` table before render. */
  scorecards?: Array<Record<string, any>>;
  /** Seed Supabase `friendships` table before render. */
  friendships?: Array<{ user_id: string; friend_user_id: string; created_at?: string }>;
  /** Seed Supabase `friend_requests` table before render. */
  friendRequests?: Array<Record<string, any>>;
  /** Seed Supabase `courses` table before render. */
  courses?: Array<Record<string, any>>;
};

/**
 * Apply seed data to the supabase mock. Idempotent. Callers can also use the
 * mock helpers directly if they need finer control.
 */
export function applySeeds(opts: RenderOptions = {}): void {
  if (opts.session !== undefined) mockSupabaseSeedSession(opts.session);
  if (opts.profiles) mockSupabaseSeedTable('profiles', opts.profiles);
  if (opts.rosterPlayers) mockSupabaseSeedTable('roster_players', opts.rosterPlayers);
  if (opts.scorecards) mockSupabaseSeedTable('scorecards', opts.scorecards);
  if (opts.friendships) mockSupabaseSeedTable('friendships', opts.friendships);
  if (opts.friendRequests) mockSupabaseSeedTable('friend_requests', opts.friendRequests);
  if (opts.courses) mockSupabaseSeedTable('courses', opts.courses);
}

/**
 * The full provider tree mirrored from `app/_layout.tsx`. SafeAreaProvider is
 * mounted at the top so layout components that read `useSafeAreaInsets()`
 * don't blow up in tests.
 */
export function AllProviders({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}>
      <AppThemeProvider>
        <ToastProvider>
          <HeaderProvider>
            <AccountProvider>
              <PlayerProvider>
                <GolfRoundProvider>
                  <SocialProvider>
                    <LocationProvider>
                      <OnboardingProvider>{children}</OnboardingProvider>
                    </LocationProvider>
                  </SocialProvider>
                </GolfRoundProvider>
              </PlayerProvider>
            </AccountProvider>
          </HeaderProvider>
        </ToastProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

export function renderWithProviders(ui: ReactElement, opts: RenderOptions = {}) {
  applySeeds(opts);
  return render(ui, { wrapper: AllProviders });
}

export function renderHookWithProviders<T>(
  hook: () => T,
  opts: RenderOptions = {}
) {
  applySeeds(opts);
  return renderHook(hook, { wrapper: AllProviders });
}

// Re-export common mock helpers for convenience. These come from the
// manual mock file when the test file calls `jest.mock('@/state/supabaseClient')`.
export {
  mockSupabaseReset,
  mockSupabaseSeedSession,
  mockSupabaseSeedTable,
  mockSupabaseGetTable,
  mockSupabaseSeedRpc,
  mockSupabaseSetTableError,
  mockSupabaseSetTableDelay,
  mockSupabaseEmitAuthEvent,
  mockSupabaseEmitChannel,
  mockSupabaseChannelSubscribeCount,
  mockSupabaseCallLog,
  mockSupabaseCallCount,
} from '@/state/supabaseClient';
