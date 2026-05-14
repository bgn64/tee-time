# Components

`components/` contains route-agnostic UI used across the app.

## Key shared components

| Component | Purpose |
|---|---|
| `AppHeader.tsx` | Persistent root header rendered by `app/_layout.tsx` |
| `PrimerScreen.tsx` | Shared layout for account/location onboarding primers |
| `DevAccountPicker.tsx` | Dev-only seeded-account login panel |
| `IncomingRequestsBanner.tsx` | Friend request banner used in feed/friends surfaces |
| `FeedCardLarge.tsx` | Feed scorecard card |
| `ReadOnlyScorecard.tsx` | Completed/read-only score grid |
| `ScoreEntryRow.tsx` | Per-scorer score input row |
| `PlayerBottomSheet.tsx` | Player search/select/create sheet |
| `RangefinderSheet.tsx` | GPS rangefinder bottom sheet |
| `RangefinderMap.*.tsx` | Platform-specific map/placeholder implementation |

## Platform-specific components

Rangefinder map implementations are platform split:

- `RangefinderMap.native.tsx` uses `react-native-maps` and Android/iOS native map capabilities.
- `RangefinderMap.web.tsx` renders a placeholder because the web build does not yet support satellite yardages.
- `RangefinderMap.tsx` exports the web implementation by default; Metro picks native variants for native builds.

Native Android builds need a Google Maps API key injected by `app.config.js`.

## Styling conventions

- Read colors from `useTheme().colors`.
- Build styles through `makeStyles(colors)` and `useMemo`.
- Prefer existing theme tokens over hardcoded colors.
- Entity accent colors such as player/team colors are data, not theme tokens.

## Component conventions

- Keep components route-agnostic.
- Put navigation decisions in screens/routes where possible.
- Use brief file header comments only when behavior or constraints are not obvious.
- Avoid splitting a screen into many tiny components unless reuse or complexity warrants it.
