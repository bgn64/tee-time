# Feedback: round card score context

Branch: `bgn64/round-card-score-context`
Date: 2026-08-18

## Items

### F1 — Make the complete hole-score strip self-explanatory

- Verbatim: "First of all, I don't like the way that the per-hole scores are shown because it is not immediately obvious what each number indicates and I don't like that we only show nine of the 18 holes."
- Triage: clean
- Proposed mockup change: Replace the unlabeled nine-cell strip on rich round cards with a compact two-nine scorecard. Each half explicitly labels HOLE and SCORE and shows all 18 holes; 9-hole rounds show their complete nine-hole range.
- Decision: accepted
- Backend: none

### F2 — Balance cards when no stats are available

- Verbatim: "Second, when no stats are available the left-centering of the wheel feels weird because it leaves a big open spaces to the right of it."
- Triage: clean
- Proposed mockup change: Use the space beside the score dial for a personal-performance summary (final gross score and comparison with the player's expected score). If neither stats nor a personal benchmark is available, center the dial rather than leaving an empty column.
- Decision: accepted
- Backend: none

### F3 — Color overall performance relative to the player

- Verbatim: "Third, most players never break par so to use par as the benchmark against which to apply positive, neutral, or negative (red) color to UI components results in a monotonous coloring scheme. One solution would be to use a player's handicap or average score as the benchmark so that coloring indicates whether that rounds was a good score FOR THAT PLAYER. This feedback may apply to many areas of the app, so it should be applied anywhere else that we do this type of coloring."
- Triage: redesign
- Proposed mockup change: Introduce player-relative performance tones for overall and running round scores across Feed, All rounds, Round detail, live standings, scoring totals, and compact recent-round summaries. Compare against a course-adjusted handicap target where available, fall back to recent scoring average, and render neutral when no credible benchmark exists. Keep per-hole birdie/par/bogey marks relative to par because those are conventional golf score symbols rather than judgments of the overall round.
- Decision: accepted
- Backend: none expected; confirm benchmark data availability during implementation planning

## Notes

The displayed golf score remains gross and to-par. Personalization changes the
semantic tone, not the underlying score. After mockup review, the rich-card
score grid was aligned visually with the full Round detail scorecard, all
benchmark-explanation copy was removed, and visible Feedback update markers
were added before Feed, Scoring, Scoring Card lens, Round detail, You, and All
rounds.
