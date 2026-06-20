---
name: feedback-to-feature
description: >-
  End-to-end workflow for turning a list of user feedback / feature requests into
  shipped changes in the tee-time app. Use when the user provides feedback items
  (e.g. "I want to click my handicap to see more", "show putts per hole"), asks to
  address feedback, or says "start the feedback workflow". Orchestrates: log feedback
  → design-only triage → edit mockup → user approval → plan → implement → verify → ship.
---

# Feedback → Feature workflow

This is the orchestrator for evolving the tee-time app in response to user
feedback. Follow the phases in order. The phase gates and guardrails are the
point of this skill — do not skip them.

The result of a full run is committed changes on a fresh feature branch off the
latest `main`, with the feedback and the design decisions recorded alongside the
code.

## Companion skills

Load these as each phase needs them:

- `mockup-driven-design` — how to read/edit `mockups/explorations/04-aurora-glass.html` (the design source of truth). Used in phases 2–4.
- `aurora-design-system` — theme tokens, the background contract, and the shared `components/aurora/*` primitives. Used when judging feasibility (phase 2) and implementing (phase 5).
- `visual-verification` — the ui-automation / Microsoft Edge screenshot loop for comparing the mockup to the running app. Used in phases 4–5.

## Guardrails (apply across all phases)

- Design-only triage: during phases 1–3 do NOT read `src/` or `supabase/`. Judge feasibility from the mockup and the design system alone, so implementation detail doesn't bias the design. Reading the app code is unlocked at phase 4.
- Backend permission: any change that needs a schema/RPC/policy change under `supabase/migrations/` or new server behavior MUST be surfaced to the user and explicitly approved before you write it. Default to UI-only solutions where possible.
- Batch before verifying: UI verification via screenshots is slow. Make a reasonable batch of edits, then verify — never edit-one-thing-then-screenshot in a tight loop.
- Discard screenshots once you've extracted what you need; they are large.

## Phase 0 — Clean branch off latest main

Do this first, before anything else.

1. Working tree must be clean: `git status --porcelain` returns nothing. If not, stop and ask the user how to proceed (commit, stash, or abandon).
2. Sync main: `git fetch origin`, then confirm local `main` matches `origin/main` (or fast-forward it).
3. Branch: `git switch -c bgn64/<short-topic> --no-track origin/main`.

Branch naming is `bgn64/<topic>` (see `AGENTS.md`).

## Phase 1 — Log the feedback

Create `mockups/explorations/feedback/<topic>.md` from the template in that
folder. Record each feedback item verbatim, one entry each, with an id (F1, F2,
…). This file is committed with the feature.

## Phase 2 — Design-only triage (no app code)

For each feedback item, decide whether it can be addressed cleanly within the
current app design (the mockup + Aurora design system), without contorting the
UI or requiring backend work. Classify each as one of:

- `clean` — fits the existing patterns; describe the mockup change.
- `needs-backend` — achievable but requires server/schema/RPC work (flag for phase 4 permission).
- `redesign` — would require reworking a screen or pattern; note the cost.
- `decline` — recommend not doing it; explain why.

Present every decision to the user to accept or override. Record the finalized
decision (including any override) in the feedback log. Then update
`mockups/explorations/04-aurora-glass.html` so it addresses every accepted item,
following `mockup-driven-design`.

## Phase 3 — Mockup approval

The user reviews the rendered mockup and approves. The user verifies the mockup
himself — do NOT screenshot the mockup to verify it. Iterate on the HTML until
he signs off. Do not advance to implementation without explicit approval.

## Phase 4 — Plan (app code now unlocked)

Now you may read `src/` and `supabase/`.

1. Use `visual-verification` to screenshot each changed mockup screen and the
   matching screen in the running app, and enumerate the concrete differences.
2. Write an implementation plan from those diffs (components to touch, new
   pieces, data wiring).
3. If any item needs backend work, notify the user and get explicit permission
   before including it. List exactly which migrations/RPCs/policies are involved.
4. Present the plan; proceed only once accepted.

## Phase 5 — Implement + verify

Implement the UI and any approved backend changes so each screen matches the
mockup. Use `aurora-design-system` for tokens and shared primitives.

Work in batches: make a coherent group of edits, then verify that batch against
the mockup with `visual-verification`. Repeat until the screens match. Keep
`tsc` + `lint` green as you go.

## Phase 6 — Ship

1. Validate: `npx tsc --noEmit` and `npm run lint` (both must exit 0).
2. Commit on the feature branch, including the feedback log and the mockup edits.
   Use the `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`
   trailer.
3. Ask the user before pushing (see `AGENTS.md`).
