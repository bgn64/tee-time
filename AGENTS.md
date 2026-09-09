# Working on tee-time

tee-time is an Expo / React Native (web-first) golf app, designed mockup-first
with an "Aurora Glass" visual system.

## Always

- Expo SDK 56 — read the versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing Expo/RN code. The API has changed from older versions.
- Validate every change: `npx tsc --noEmit` and `npm run lint` (runs `expo lint`, loads `.env.local`). There is no test runner.
- Work on a feature branch named `bgn64/<topic>`, cut from the latest `main`.
- Ask before committing or pushing. Add the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` to commits.

## UI changes

For every user-facing UI change, load `mockup-contract` first. Its approval gates
are mandatory. Tee-time defaults:

- Canonical mockups: `mockups/surfaces/<surface>/`; catalog: `mockups/index.html`.
- Legacy explorations: `mockups/explorations/` (reference only).
- Keep each canonical `index.html` self-contained and usable from `file://`.
- Start web: `npm run web`; default URL: `http://localhost:8081`.
- Use the available browser/UI automation MCP; discover its tools at runtime.
- Use `aurora-design-system` when implementing.

Reconcile only the surface being changed. Ask before the separate baseline and
approved-design commits. Never alter an approved mockup to excuse an implementation
deviation; revise and reapprove the design first.

Get explicit permission before writing backend, schema, RPC, or policy changes.
