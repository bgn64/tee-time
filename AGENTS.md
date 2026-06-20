# Working on tee-time

tee-time is an Expo / React Native (web-first) golf app, designed mockup-first
with an "Aurora Glass" visual system.

## Always

- Expo SDK 56 — read the versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing Expo/RN code. The API has changed from older versions.
- Validate every change: `npx tsc --noEmit` and `npm run lint` (runs `expo lint`, loads `.env.local`). There is no test runner.
- Work on a feature branch named `bgn64/<topic>`, cut from the latest `main`.
- Ask before committing or pushing. Add the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` to commits.

## Responding to user feedback

When the user gives feedback / feature requests, follow the `feedback-to-feature`
skill (`.github/skills/feedback-to-feature/`). The loop, gated at each step:

1. Clean tree + latest `main`, then branch.
2. Log feedback → design-only triage (no `src/` reading) → edit the mockup. Skill: `mockup-driven-design`.
3. User approves the mockup (he verifies it himself — don't screenshot the mockup).
4. Read the app; diff mockup vs running app with screenshots; plan. Skill: `visual-verification`. Backend changes need explicit user permission.
5. Implement UI + approved backend; verify against the mockup; batch edits before screenshotting.

Design-system reference for implementation: `aurora-design-system`.

Skills live in `.github/skills/`; load the relevant one for the task at hand.
