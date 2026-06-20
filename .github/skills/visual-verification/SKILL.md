---
name: visual-verification
description: >-
  How to visually verify the tee-time app against its mockup using the
  ui-automation MCP driving Microsoft Edge. Use when comparing a mockup screen to
  the running app, confirming a UI change looks right, or diffing app vs mockup via
  screenshots. Covers the Edge/localhost:8081 setup, tab + element handling quirks,
  and the batch-and-discard discipline.
---

# Visual verification (ui-automation MCP + Edge)

The loop for comparing the design mockup to the running app and confirming UI
changes. This targets the local Copilot CLI setup: Microsoft Edge open with the
app and the mockup, plus the ui-automation MCP tools.

## Setup assumed

- Dev server running on `localhost:8081` (`npm run web`; it may already be up —
  check with `Get-NetTCPConnection -LocalPort 8081 -State Listen`).
- One Edge window with (at least) two tabs: the live app (`localhost:8081`) and
  the mockup (`mockups/explorations/04-aurora-glass.html` as a `file://`).
- Tools: `ui-automation-*` (list_windows, find_element, query_elements,
  take_screenshot, send_keys, click_element, click_at_point, select_element, …).

## The comparison loop

1. Screenshot the relevant mockup screen (for your own reference) and the same
   screen in the running app.
2. Enumerate concrete differences (spacing, color, labels, affordances, layout).
3. Make a batch of code edits to close them.
4. Re-screenshot the app screen and confirm it matches. Repeat.

The mockup is the target; the app should converge to it.

## Edge / element handling quirks (important)

- Find the Edge window via `list_windows` (a `Chrome_WidgetWin_1` window).
- A background tab's document is NOT in the accessibility tree —
  `find_element controlType=Document` returns only the ACTIVE tab's document.
- Switch tabs by sending `{Ctrl+2}` (etc.) to the active document element
  (`send_keys`). The live app is typically tab 2, the mockup tab 1.
- The Document `elementId` regenerates on every reload, navigation, or tab
  switch. Re-acquire it (`find_element controlType=Document`) before each
  interaction; don't reuse a stale id.
- Reloading (`{F5}`) lands the app on the Feed tab.
- Bottom-nav tabs and list rows often aren't invokable via `click_element`; use
  `click_at_point` (physical click) or `select_element` for TabItems/ListItems.
- Steppers/score entry: tapping `Increase` once usually sets par; adjust from
  there. Re-query button ids after navigation — they change.
- Only monitor index 0 exists; `take_screenshot` with no monitor arg is fine.

## Discipline

- Batch edits before verifying. Screenshot round-trips are slow; never do
  one-edit-then-screenshot loops. Group a screen's changes, then verify once.
- Screenshots are large — discard/delete them as soon as you've extracted the
  result. Don't accumulate them across the session.
- For multi-row UI (e.g. standings, scorecards) enter a little real data first so
  the screen isn't empty when you verify.

## What NOT to use this for

Do not screenshot the mockup to "verify the mockup" — the user verifies mockups
himself (see `mockup-driven-design`). Screenshots here are only for the
app-vs-mockup comparison during implementation.
