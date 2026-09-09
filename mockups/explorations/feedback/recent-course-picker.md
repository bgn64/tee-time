# Feedback: recent courses

Branch: `bgn64/recent-courses`
Date: 2026-09-09

## Items

### F1 — Show recently played courses before searching

- Verbatim: "I want to add a feature to my app where before typing into the
  search bar for a course to select for the new round we display recently
  played courses in the same way as search results except maybe with the final
  score from the most recently played round for the user to easily and quickly
  select from. Can you start by showing how you would update the UI for this via
  mockup?"
- Triage: clean
- Proposed mockup change: replace the empty-query helper with up to three
  distinct recently played course rows, ordered by latest completion, while
  retaining each course's location and adding the signed-in user's latest
  relative-to-par result as a compact trailing score. Typed search results keep
  their current presentation; users without eligible history retain the helper.
- Decision: accepted; mockup approved by the user on 2026-09-09.
- Backend: none. Existing completed-round and score data provides the course,
  completion time, signed-in scorer identity, and relative-to-par result.

## Implementation

- The empty course-search state derives the latest scored round for each course,
  orders those courses newest-first, and displays at most three.
- Friend-only rounds and malformed completed rounds without scores for the
  signed-in user are excluded rather than being presented as even par.
- `CourseRow` retains its existing catalog-search appearance unless an optional
  last-round score is supplied.
- Stroke-play and scramble rounds share the existing scorer-resolution and
  progress helpers.

## Verification

- `npx tsc --noEmit` — exit 0.
- `npm run lint` — exit 0.
- Editor diagnostics and `git diff --check` — clean.
- Authenticated app-versus-mockup visual verification passed at 390 x 844 using
  the deterministic local Supabase fixtures. Confirmed the three expected
  scores, search replacement, course deduplication/limit, and recent-row
  selection into New round setup.
