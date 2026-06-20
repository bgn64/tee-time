---
name: mockup-driven-design
description: >-
  How to read and edit the tee-time design mockups under mockups/explorations/.
  Use when changing a screen's design, judging whether feedback fits the current
  design, adding a UI affordance to the mockup, or keeping the mockup and the app's
  theme tokens in sync. The mockup is the source of truth for what the app should
  look like.
---

# Mockup-driven design

The tee-time app is designed mockup-first. The mockups are self-contained static
HTML/CSS/JS files in `mockups/explorations/`. The design that ships is
`04-aurora-glass.html` ("Aurora Glass"); `01`–`03` and `05` are earlier
explorations kept for reference. `index.html` is a gallery index.

The mockup is the source of truth: when the app and the mockup disagree, the
mockup wins (unless the user says otherwise).

## How the active mockup is organized

`04-aurora-glass.html` renders every screen side-by-side as phone frames. Each
screen is delimited by an HTML comment, e.g. `<!-- SCORING -->`,
`<!-- SCORING · CARD LENS -->`, `<!-- ROUND DETAIL -->`, `<!-- NEW ROUND -->`,
`<!-- FRIENDS / SEARCH -->`, `<!-- PROFILE -->`. To change a screen, find its
comment block and edit the markup inside that `.phone` element. Shared `.tabs`
footers repeat per screen — update all of them when changing the footer.

Design tokens live in the `:root` block at the top (`--lime`, `--cy`, `--vio`,
`--glass`, `--glass2`, `--stroke`, `--ink`, `--muted`, etc.). These mirror the
app's tokens in `src/library/theme/themes.ts`. Keep them in sync: if you add or
change a token in one place, reflect it in the other. The mockup's phone-interior
background (`.phone` gradient) and `.glow` blobs correspond to the app's
`ScreenBackground`.

## Editing conventions

- Keep mockups self-contained: inline CSS/JS only, no external dependencies or
  build step. A mockup must open correctly as a `file://` in a browser.
- Reuse the existing CSS classes (`.card`, `.glass`, `.seg`, `.prow`, `.tabs`,
  `.av`, `.pip`, …) so new UI stays visually consistent with the rest of the
  screen. Add a new class only when no existing one fits.
- Match the Aurora look: frosted glass panels, neon lime/cyan accents, soft
  glows, big rounded corners, tabular numerics. See `aurora-design-system`.
- When you add an affordance for a piece of feedback, add it to every screen
  where it should appear, and update the design-doc comment at the top of the
  file if the screen inventory changes.

## Verification

The user verifies the rendered mockup himself. Do NOT launch a browser or take
screenshots to verify a mockup — present the diff/markup and let him confirm.
(Screenshots are only for comparing the mockup to the running app during
implementation — see `visual-verification`.)
