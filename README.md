# Tee Time

A mobile golf scoring app built with **Expo + React Native + TypeScript**. This README is the entry point for new developers and agents working in this codebase.

> **Note:** Sections of this README still describe the early prototype phase. Persistence (Supabase), accounts, friend graph, and a real test suite have all since shipped. The v6 redesign migrated the round model from per-claim status to per-participant confirmation. Read `final.md` for the current status and `supabase/migrations/006_redesign.sql` for the canonical backend.

## Quick start

```bash
npm install
npm start          # Expo dev server with QR code; pick a target from the menu
# or:
npm run ios        # open in iOS simulator
npm run android    # open in Android emulator
npm run web        # serve as a web build

# Verification (the bar before declaring a change "done"):
npx tsc --noEmit   # type-check; should be silent
npm test           # Tier 1 unit tests (helpers in lib/)
npm run test:db    # Tier 2 backend tests — requires Docker + `npx supabase start`
```

## Testing

The repo has two tiers of automated tests, gated by what infra they need.

### Tier 1 — unit tests (`npm test`)

Pure-function tests against helpers in `lib/scoring.ts` (score formatters, time formatting, round-title rendering, score-array upserts). No React, no Supabase, no Expo runtime. Fast (under 15s) and never flake.

- Test files: `lib/__tests__/*.test.ts`.
- Runner: jest with the `jest-expo` preset (in case a future test pulls a transformed RN module).

### Tier 2 — backend tests (`npm run test:db`)

Integration tests against a local Supabase stack — actual Postgres + PostgREST + Auth. Catches RPC, trigger, and RLS regressions. Requires Docker.

```bash
# One-time per machine: install Docker, then:
npx supabase start          # boots local stack on http://127.0.0.1:54321
                             # auto-applies migrations from supabase/migrations/
                             # prints anon + service keys (already in .env.test)

npm run test:db              # runs the suite serially against the local stack
```

- Test files: `supabase/tests/*.test.ts` covering RPC happy paths (`rpc-happy.test.ts`), authz/error rejections (`rpc-errors.test.ts`), trigger lifecycle and cascade rules (`triggers.test.ts`), and RLS visibility (`rls.test.ts`).
- Fixtures: `supabase/tests/fixtures.ts` exposes `createTestUser`, `befriend`, `seedRound`, and `cleanupAll`. `cleanupAll` deletes every `auth.users` row (which cascades to all app tables) and runs in `beforeEach`.
- Tests run serially (`--runInBand`) because they share a single Postgres instance and a single auth space.
- If the local stack is wedged or you want a clean slate: `npx supabase db reset` re-applies all migrations from scratch.

### Resetting the test DB

```bash
npx supabase db reset       # re-apply migrations; wipes all data
npx supabase stop           # tear down the Docker containers entirely
```

## Status

Prototype. Everything lives in memory — there is no persistence, backend, authentication, or automated test suite. The app is exercised in an Expo dev build and verified with a TypeScript compile + manual walkthroughs. Treat all "user data" (courses, players, rounds) as ephemeral session state seeded from `data/`.

## Quick start

```bash
npm install
npm start          # Expo dev server with QR code; pick a target from the menu
# or:
npm run ios        # open in iOS simulator
npm run android    # open in Android emulator
npm run web        # serve as a web build

# Verification (the bar before declaring a change "done"):
npx tsc --noEmit   # type-check; should be silent
```

There are no unit tests and no lint script; type-check + manual walkthrough is the bar.

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | React Native 0.81 + React 19 |
| Toolchain | Expo SDK 54 |
| Routing | [Expo Router](https://docs.expo.dev/router/introduction/) (file-based) |
| Language | TypeScript 5.9 |
| State | React Context + `useState` (no Redux / Zustand / React Query) |
| Persistence | None yet — everything is in-memory |
| Styling | `StyleSheet.create` + theme tokens via `useTheme()` |
| Icons | `@expo/vector-icons` (FontAwesome) |

## Project layout

```
tee-time/
├── app/                        # Expo Router file-based routes (see "Routing model")
│   ├── _layout.tsx             # Root: loads fonts, mounts providers, hosts AppHeader
│   ├── +html.tsx               # Web wrapper (only used by `npm run web`)
│   ├── +not-found.tsx          # 404 fallback
│   └── (tabs)/                 # The three-tab shell
│       ├── _layout.tsx         # Tabs config: Home / Score / You
│       ├── (home)/             # Home tab (currently a stub)
│       ├── (score)/            # Score tab — the round flow lives here
│       │   ├── _layout.tsx     # Stack: index → player-config → scoring
│       │   ├── index.tsx       # Course Selection (tab root, no active round)
│       │   ├── player-config.tsx   # Add players / pick format
│       │   ├── scoring.tsx     # Locked-round scoring screen
│       │   ├── scorecard.tsx   # Read-only grid (stub)
│       │   └── new-course.tsx  # Create a custom course
│       └── (you)/              # Profile / settings / theme picker
│
├── components/                 # Shared, route-agnostic UI
│   ├── AppHeader.tsx           # Persistent top bar (renders header slots)
│   ├── PlayerBottomSheet.tsx   # Modal: search/select/create players
│   ├── RoundActionsSheet.tsx   # ⋯ overflow menu inside a locked round
│   ├── ConfirmAbandonSheet.tsx # "Abandon round?" confirmation
│   └── …                       # Themed text/link helpers, color-scheme hooks
│
├── state/                      # React contexts (one per concern)
│   ├── ThemeContext.tsx        # Active theme + palette
│   ├── HeaderContext.tsx       # Header slot registration
│   ├── PlayerContext.tsx       # Persistent roster (the user's "people")
│   └── GolfRoundContext.tsx    # Active round, completed rounds, courses
│
├── types/
│   └── golf.ts                 # Domain types — start here when modeling changes
│
├── data/                       # In-memory seeds; replaced by a backend eventually
│   ├── courses.ts
│   └── players.ts
│
├── constants/
│   ├── themes.ts               # Theme palettes + ThemeName union
│   └── Colors.ts               # Legacy Expo template colors (mostly unused)
│
├── docs/                       # Design mockups (HTML)
└── assets/                     # Fonts, images, splash, icon
```

The path alias `@/` resolves to the project root (configured in `tsconfig.json`). Always import via `@/state/...`, `@/components/...`, etc., never via long relative paths.

## Routing model

Expo Router gives us file-based routing with two grouping primitives:

- **Parens groups** like `(tabs)` and `(score)` create a navigator without adding a path segment. So the route for `app/(tabs)/(score)/scoring.tsx` is `/(tabs)/(score)/scoring`.
- **`_layout.tsx`** files declare the navigator (tabs vs. stack) for everything underneath them.

The full router tree:

```
RootStack                         (app/_layout.tsx)
└── (tabs)                        (app/(tabs)/_layout.tsx)  — Tabs navigator
    ├── (home)                    Stack
    ├── (score)                   Stack — the round flow
    │   ├── index                 Course Selection
    │   ├── player-config         Add players, pick format
    │   ├── scoring               Locked round (gestureEnabled: false)
    │   ├── scorecard             Read-only grid (stub)
    │   └── new-course            Create custom course
    └── (you)                     Stack — profile / settings
```

### The "locked round" pattern

When the user taps **Start Round**, `player-config.tsx` calls `router.replace('/(tabs)/(score)/scoring')`. The `replace` discards the back-stack so the user can't gesture or hardware-back into Player Config mid-round. `scoring.tsx` also calls `BackHandler.addEventListener('hardwareBackPress', () => true)` to intercept Android back. The only way out of an in-progress round is the ⋯ overflow menu (Finish or Abandon).

### Header slots (`useScreenHeader`)

Instead of using each navigator's built-in header, we render a single `<AppHeader />` at the root layout. Screens contribute their `left` and `right` content via:

```tsx
useScreenHeader({
  left: { kind: 'back', label: 'Course', onPress: () => router.back() },
  right: { kind: 'menu', onPress: () => setMenuOpen(true) },
});
```

The hook re-registers slots in a `useFocusEffect` so navigating between tabs/screens always lands on fresh chrome. See `state/HeaderContext.tsx` for the slot type unions.

## State management

Four contexts, mounted in this order in `app/_layout.tsx`:

```
AppThemeProvider
  └─ HeaderProvider
       └─ PlayerProvider
            └─ GolfRoundProvider
```

The order matters because providers below depend on hooks from providers above (e.g. screens consume both `useTheme` and `useGolfRound`).

### `ThemeContext` — `state/ThemeContext.tsx`

- Holds the active `themeName` (default `'earthy'`) and resolves `colors` from `constants/themes.ts`.
- `useTheme()` returns `{ colors, themeName, setThemeName }`.
- All screens read colors via `useTheme()` and pass them to a `makeStyles(colors)` helper memoized with `useMemo`. **Never hardcode colors** — pick a token, or add one to `ThemeColors` if it's missing.

### `HeaderContext` — `state/HeaderContext.tsx`

- Owns the `{ left, right }` slot pair rendered by `<AppHeader />`.
- Screens register their slots with `useScreenHeader(...)`. See "Header slots" above.

### `PlayerContext` — `state/PlayerContext.tsx`

The user's persistent roster of "people they golf with." Independent from rounds.

```ts
{
  allPlayers: Player[];           // every roster entry
  recentPlayers: Player[];         // top 6, MRU-ordered
  defaultPlayerId: string | null;  // auto-included in new rounds (the "You" entry by default)
  addPlayer(player): void;
  markRecent(playerId): void;
  setDefaultPlayerId(id): void;
  getPlayer(id): Player | undefined;
}
```

Players are referenced by `id` everywhere downstream — the `Round` does not embed `Player` records.

### `GolfRoundContext` — `state/GolfRoundContext.tsx`

The single source of truth for the active round and round history.

```ts
{
  courses: Course[];
  currentRound: Round | null;
  completedRounds: Round[];
  pendingSelectedCourseId: string | null;  // transient hint for "just-created course"
  addCourse(course): void;
  startRound(courseId, playerIds, scoringRule, teams?): void;
  setHoleScore(scorerId, holeNumber, relativeScore): void;
  setCustomHoleScore(scorerId, holeNumber, strokes): void;
  goToPreviousHole(): void;
  goToNextHole(): void;
  completeCurrentRound(): void;
  abandonCurrentRound(): void;
}
```

Note `scorerId` is polymorphic: in stroke rounds it's a player id; in scramble rounds it's a team id. See "Domain model" below.

## Domain model

All shared types live in `types/golf.ts`. Read this file before designing any change that touches courses, players, rounds, or scoring.

```ts
type Player = { id; name; color?; /* userId? — reserved for future accounts */ };

type Hole = { number; par; yardage? };
type Course = { id; name; location; holes; source: 'catalog' | 'custom' };

type ScoringRule = 'stroke' | 'scramble';

type Team = { id; name; color; playerIds };

type RoundScore = {
  scorerId;          // playerId in stroke rounds; teamId in scramble rounds
  holeNumber;
  strokes;
};

type Round = {
  id;
  course;
  scoringRule;
  playerIds;         // every participant in the round, flat
  teams?;            // required when scoringRule === 'scramble'
  currentHoleNumber;
  scores;
  startedAt;
  completedAt?;
};
```

Two design choices to internalize:

1. **References, not embedding.** `Round.playerIds: string[]` resolves through `getPlayer(id)` from `PlayerContext`. If a player is renamed, every round (active and historical) sees the new name. This is forward-compatible with eventual account claiming.
2. **Polymorphic `scorerId`.** A `RoundScore` doesn't know whether it scores a player or a team — that's determined by `Round.scoringRule`. This lets stroke and scramble share the same score-storage shape and most of the same UI helpers (`getScorerTotalRelative`).

## Round lifecycle

The Score tab walks the user through these screens:

```
Course Selection (index.tsx)
   └── tap a course
        ↓
Player Config (player-config.tsx)
   - Pick format: Stroke or Scramble
   - In Scramble: dynamic Team 1..N sections (1–4 teams), + Add Team
   - Default player ("You") is always included
   - At cap (4 players total), Add affordances are disabled
        ↓ tap "Start Round" — calls startRound(...) and router.replace(...)
        ↓
Scoring (scoring.tsx) — locked
   - Stroke: one card per player, each with its own chip row
   - Scramble: one card per team, with stacked-avatar header and ONE chip row per team
   - "Next" enabled only when every scorer has a score for the current hole
   - ⋯ menu → Scorecard / Finish / Abandon
        ↓ Finish
        ↓
Round moves to completedRounds; user lands on Course Selection again
```

### Stroke vs. Scramble — what differs

| | Stroke | Scramble |
|---|---|---|
| `Round.scoringRule` | `'stroke'` | `'scramble'` |
| `Round.teams` | `undefined` | array of 1–4 `Team`s |
| `RoundScore.scorerId` | a player id | a team id |
| Scoring UI | one card per player, chip row per player | one card per team, single chip row per team |
| Total math | sum of (strokes − par) per player | sum of (strokes − par) per team |
| "All scored" gate | every player has a score | every team has a score |
| Chip size scaling | by player count | by team count |

The same helper, `getScorerTotalRelative(round, scorerId)`, computes totals for both modes — it doesn't care what kind of scorer it is.

## Theming

Five named palettes (`earthy`, `ocean`, `dark`, `lavender`, `navy`) live in `constants/themes.ts`. The `'earthy'` palette is the default; the You tab has a theme picker.

Conventions:

- All colors come from `useTheme().colors`. If you need a color that isn't in `ThemeColors`, **add a token to `ThemeColors` and to every theme**, don't hardcode.
- Build per-screen `StyleSheet.create` inside a `makeStyles(colors)` helper, memoized via `useMemo(() => makeStyles(colors), [colors])`. This keeps stylesheets cheap to recompute when the user switches themes.
- Player and team accent colors (`Player.color`, `Team.color`) are *not* theme tokens — they're per-entity accents drawn from a fixed palette and stored on the entity. Edits to themes shouldn't touch them.

## Conventions

- **No comments unless the WHY is non-obvious.** Don't narrate what the code does; well-named identifiers handle that. Comments explaining a hidden constraint, a workaround, or a non-obvious invariant are encouraged.
- **Persistence is real.** Supabase migrations under `supabase/migrations/` are the source of truth for the backend schema; do not add ad-hoc SQL in screens or contexts.
- **Tests exist.** `npm test` (unit) and `npm run test:db` (Supabase) are the bar for changes touching helpers, RPCs, triggers, or RLS. Adding a regression test alongside any bug fix is strongly preferred.
- **Path alias `@/`** for all internal imports. Configured in `tsconfig.json`. Don't use long `../../../` chains.
- **One file = one screen / one component / one context.** Resist the urge to split a screen into ten small files.
- **Screens are functional + hook-based.** The first thing a screen does is call its hooks (`useTheme`, `useGolfRound`, `useScreenHeader`, etc.), then derive locals, then render. No class components.
- **File header comments.** Most screens and contexts open with a short JSDoc-style block describing their role and any non-obvious behavior (e.g. "header chrome: left = SCORE, right = ⋯ overflow"). Match the style when adding new files.

## What's not built yet

These are deliberately deferred. Don't add them without an explicit conversation — the schema is designed to absorb them later.

- **Persistence.** Roster, courses, and round history disappear on app restart.
- **Accounts / friends.** `Player.userId?: string` is reserved for when accounts arrive. The eventual claim flow is documented in earlier design conversations.
- **Scorecard.** `app/(tabs)/(score)/scorecard.tsx` is a stub. The plan: a read-only grid of holes × scorers, theme- and format-aware.
- **More scoring rules.** Best-ball and match play were considered and intentionally dropped from v1. Adding either means a new `ScoringRule` value and parallel UI work in Player Config and Scoring.
- **Player movement between teams.** Today, to move a player from Team 2 to Team 1 you remove and re-add. A "Move to…" affordance is on the wishlist.
- **User-editable team names.** Auto-named `Team 1` / `Team 2` / … for now.
- **Course catalog.** Seeded from `data/courses.ts`. A real catalog (search, geolocation, ratings) is out of scope.

## Other docs

- `docs/design-mockup.html` — the original visual reference for the scoring screens.
- `docs/course-selection-mockups.html` — alternative course-selection layouts considered.

When making non-trivial design changes, check whether a mockup exists in `docs/` first.

## Onboarding checklist (for agents)

If you're a fresh agent picking up this repo, the fast path is:

1. Read `types/golf.ts` end-to-end.
2. Skim `state/GolfRoundContext.tsx` and `state/PlayerContext.tsx` (the two contexts you'll touch most often).
3. Open `app/(tabs)/(score)/player-config.tsx` and `app/(tabs)/(score)/scoring.tsx` together — they cover ~90% of the app's actual logic.
4. When making a change, run `npx tsc --noEmit` before declaring it done.

If your task involves the round flow, also read `app/(tabs)/(score)/_layout.tsx` to understand the screen stack and the locked-round pattern.
