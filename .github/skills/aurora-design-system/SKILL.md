---
name: aurora-design-system
description: >-
  The tee-time app's Aurora visual system: theme color tokens, the full-bleed
  background contract, and the shared components/aurora/* primitives. Use when
  implementing or restyling any UI, changing colors / theme tokens / backgrounds,
  building a new screen or component, or working around react-native-web visual
  quirks. Pairs with mockup-driven-design (the mockup is the spec; this is how to
  build it in React Native).
---

# Aurora design system

How the "Aurora Glass" look is implemented in the React Native (Expo, web-first)
app. The visual spec lives in the mockup (`mockup-driven-design`); this skill is
how to realize it in code.

Validate every change with `npx tsc --noEmit` and `npm run lint`.

## Color tokens

All colors come from `src/library/theme/themes.ts` via `useTheme().colors`.
Aurora has coordinated light and dark palettes; every component must remain
legible in both. Never hardcode theme-dependent colors in components — add a
semantic token instead. The token shape grows monotonically: add new fields,
don't repurpose existing ones, so existing call sites keep working.

Key tokens: `lime`/`primary`, `cyan`, `violet`, `onNeon` (contrasting text/icons
for neon fills), `textTitle`/`textBody`/`textMuted`,
`glassFill`/`glassFill2`/`glassStroke` (frosted panels), `glowLime`/`glowCyan`
(soft tint fills — also reused as chip backgrounds), `cardBg`, `accent` (danger
red), the `screenBgTop`/`screenBgBottom` base, and the `pip*` scorecard colors.
`shadow`/`shadowCard` provide palette-safe elevation. Avatar colors are coerced onto the Aurora palette at render time via
`auroraAvatarColor()` (`src/library/social/avatarColors.ts`) — use it rather than
raw colors for avatars.

## Background contract

A single persistent `ScreenBackground` (`src/components/aurora/ScreenBackground.tsx`)
lives behind every route, mounted once in `src/app/_layout.tsx`. It paints a palette-specific vertical gradient plus two soft SVG radial-gradient glows
(`react-native-svg`) that fade to transparent.

Rules:
- Do NOT wrap individual screens in their own `ScreenBackground`.
- Keep navigator surfaces transparent: the root Stack/Tabs use a transparent
  navigation theme and `contentStyle`/`sceneStyle`/`tabBarStyle` backgrounds so
  the one backdrop shows through. `_layout.tsx` documents why.
- `react-native-screens` is force-enabled on web (`enableScreens(true)`) so
  inactive tab scenes are hidden instead of bleeding through the transparent
  backdrop.
- For soft glows use SVG radial gradients (fading `stopOpacity` 0), not a filled
  `View` with a border-radius + shadow — the latter shows a hard circular edge.

## Shared primitives — prefer these over rolling your own

Import from `@/components/aurora` (`src/components/aurora/index.ts`): `GlassCard`,
`GlassSurface`, `NeonButton`, `SectionLabel`, `ProgressDial`, `Stepper`,
`Avatar`, `ScorePip`, `StatChip`, `StatTile`, `SegmentedToggle`, `NumericText`,
`PhoneFrame`, `ScreenBackground`, `PHONE_MAX_WIDTH`. Build screens by composing
these so spacing, glass, and neon styling stay consistent. `NumericText` applies
the tabular-numeric treatment; use it for scores/stats.

## React-native-web gotchas

This app runs primarily on web via `react-native-web`; native-only assumptions
break. Known traps:

- Hover: `onPointerEnter/Leave` fire for touch too. Gate hover-only UI with
  `deviceSupportsHover()` (`src/library/utils/hoverCapability.ts`), not
  `Platform.OS === 'web'`.
- Gestures: do NOT wrap a `PanResponder` element in a `Pressable` — the Pressable
  steals the touch responder and the gesture dies. Put `panHandlers` on a plain
  `View`.
- Pull-to-refresh: RN `RefreshControl` is a no-op on web. Use
  `PullToRefreshScrollView` (`src/components/widgets`) with the `useRefresh()`
  hook.
- Phone-width framing on wide desktop viewports is applied per-layer (centered
  max-width on header content, each screen's scroll content, and the tab bar) —
  not by wrapping the navigator, which would break scene hiding.

## Data layer (context, not styling)

Reads are React Query (`@tanstack/react-query`) hooks over Supabase REST/RPC,
refreshed on demand/focus; writes go through a persistent outbox
(`src/library/data/writeOutbox.ts`). Backend schema/policies live in
`supabase/migrations/`. Changing backend behavior is gated — see
`feedback-to-feature`.
