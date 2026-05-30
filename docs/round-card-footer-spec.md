# Round Card Footer RFC

## 1. Today

The list/feed card lives in `src\components\round\RoundListCard.tsx`.

- The whole card is already a `Pressable` (`RoundListCard.tsx:61-67`) and routes to round detail through the caller-provided `onPress`.
- The only visible bottom affordance is the comments strip (`RoundListCard.tsx:80-99`): comment count, last-comment hint or "be the first to comment", and a chevron.
- Footer styling is intentionally quiet (`RoundListCard.tsx:126-163`): `cardBg`, hairline top border, muted text, and a small `›`.

Current layout:

```text
┌──────────────────────────────┐
│ Gradient header              │
│ Live banner? / scorer stack  │
├──────────────────────────────┤
│ 💬 2   last comment 5m ago  › │
└──────────────────────────────┘
```

Problem: the footer reads as "open comments" more than "open the full round". The card is tappable, but the visual affordance is isolated to comments.

## 2. Goals

1. Make the whole card, or at least the bottom region, clearly suggest "tap for full round details".
2. Reserve a natural home for a future like/reaction button.
3. Stay cohesive with the existing visual system: `cardBg`, `chipBg`, `border`, `primary`, `primaryDark`, `textTitle`, `textMuted`, and `accent`.
4. Preserve accessibility and platform expectations:
   - ≥44 pt touch targets for primary footer actions.
   - Screen reader label says "Open round details", not only "comments".
   - Web gets hover/focus affordance; native gets pressed feedback.
   - Counts and controls remain legible in light and dark themes.

## 3. Proposed designs

| Direction | Summary | Cost | New state? |
| --- | --- | ---: | --- |
| A. Detail-forward action bar | Primary "View round" CTA owns the footer; comments and like are secondary chips. | ~60-90 LOC, 1 file | No for Phase 1 |
| B. Social rail + detail row | Top row has like/comment metrics; second row is a full-width detail CTA. | ~80-120 LOC, 1 file | No for Phase 1 |
| C. Whole-card affordance with floating footer chips | Card hover/press lift plus compact footer chips; chevron remains the detail cue. | ~50-75 LOC, 1 file | No for Phase 1 |

### A. Detail-forward action bar

Description: replace the comment-only footer with a button-like row. Left side says "View round details"; right side has compact social chips for comments and future like.

```text
┌─────────────────────────────────────┐
│ View round details             ›    │
│♡ Like   💬 2 comments · 5m ago      │
└─────────────────────────────────────┘
```

Pros:

- Best solves the core ambiguity: detail is the primary action.
- Like placeholder has a stable slot before schema work exists.
- Works well with current whole-card `Pressable`.
- Easy to make the footer min-height ≥44 pt.

Cons:

- Slightly taller footer than today.
- The disabled/future like placeholder needs careful copy so it does not imply it works yet.

Implementation cost:

- `src\components\round\RoundListCard.tsx`
- ~60-90 LOC: footer markup, 4-6 styles, web hover/pressed style callback.
- No new state for Phase 1; comment count hook remains unchanged.

### B. Social rail + detail row

Description: make the footer a two-row module: a social stats rail, then a full-width "Open scorecard" CTA.

```text
┌─────────────────────────────────────┐
│♡ 0 likes        💬 2 comments       │
│ Open scorecard details          ›   │
└─────────────────────────────────────┘
```

Pros:

- Most future-proof for multiple reactions.
- Cleanly separates social metrics from navigation.
- Scales if comment metadata gets longer.

Cons:

- More vertical space on dense feeds.
- More visual hierarchy to tune.
- Might overstate the future like feature before it exists.

Implementation cost:

- `src\components\round\RoundListCard.tsx`
- ~80-120 LOC: two-row footer, chips, pressed/hover states.
- No Phase 1 state; Phase 2 adds like query/mutation.

### C. Whole-card affordance with floating footer chips

Description: keep a compact footer, but add card-level hover/press treatment and rename the footer hint to detail language. Comments and the future like sit as chips.

```text
┌─────────────────────────────────────┐
│♡ 0   💬 2 comments      Details  ›  │
└─────────────────────────────────────┘
```

Pros:

- Smallest visual change.
- Keeps feed density closest to today.
- Fits current card anatomy with minimal churn.

Cons:

- Still relies on a small "Details" label to explain tap behavior.
- Less clear than A for first-time users.
- Hover lift helps web but native still needs obvious press feedback.

Implementation cost:

- `src\components\round\RoundListCard.tsx`
- ~50-75 LOC: copy changes, chips, card hover/pressed styles.
- No Phase 1 state.

## 4. Recommendation

Ship Direction A in Phase 1.

It makes detail navigation unmistakable while keeping comments visible and leaving a clean like slot. It is also the easiest to review because it changes only the footer markup/styles in `RoundListCard` and does not require schema or sync work.

## 5. Phase 1 vs Phase 2

### Phase 1: tap affordance + visual cleanup

- Keep the whole card as the `Pressable`.
- Footer primary copy: "View round details".
- Keep comment count/last-comment metadata as secondary information.
- Add a non-interactive like placeholder slot only if the UX copy is explicit, for example `♡ Like` without a count, or omit it until Phase 2 if disabled controls feel noisy.
- Web: use `Pressable` state to add hover/focus treatment (`borderColor: primary`, subtle shadow, or footer `chipBg` lift).
- Native: keep pressed opacity/scale on the card/footer; ensure the footer visual target is at least 44 pt tall.

### Phase 2: likes/reactions

Probable schema direction:

```sql
create table public.round_reactions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.scorecards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'like',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, user_id, reaction)
);

-- Optional denormalization for feed speed.
alter table public.scorecards
  add column reaction_count integer not null default 0;
```

RPC:

```sql
-- Toggles the caller's reaction and returns the viewer state + aggregate count.
toggle_round_reaction(
  p_round_id uuid,
  p_reaction text default 'like'
) returns table (
  round_id uuid,
  reaction text,
  reacted boolean,
  reaction_count integer
);
```

RLS:

- `select`: authenticated users can read reactions for scorecards they can already see.
- `insert`: authenticated users can react to scorecards they can already see.
- `delete`: users can remove only their own reaction rows.
- `update`: likely disallow; change reaction by delete/insert or RPC.

PowerSync:

- Add `round_reactions` to `AppSchema`.
- Sync reactions for visible scorecards only.
- If using `scorecards.reaction_count`, include the denormalized column in scorecard sync rules.
- UI hook shape: `useRoundReactionSummary(round.id)` returning `{ count, viewerReacted, toggle, isPending }`.

Integration with Phase 1 layout:

- The reserved `♡ Like` slot becomes an actual `Pressable` with `accessibilityRole="button"` and `accessibilityState={{ selected: viewerReacted }}`.
- Tapping the like should not trigger the whole-card detail press; use event propagation handling supported by React Native Web/native wrappers.
- Count formatting should stay compact: `♡ 1`, `♡ 12`, `♡ 1.2k`.

## 6. Open questions

1. Is the product a single "like" per user per round, or stacked reactions (`like`, `fire`, `clap`, etc.)?
2. Should the footer show a disabled like placeholder in Phase 1, or wait until Phase 2 to avoid fake affordances?
3. Should tapping the comment chip deep-link to comments, or should every footer tap open the same round detail screen?
4. On live rounds, should the footer copy say "Follow live round" instead of "View round details"?
5. Are likes visible to all viewers, or only friend-group members who can comment?

## 7. Out of scope

- Implementing likes/reactions, schema, RPCs, RLS, or sync rules in Phase 1.
- Changing comment threading or adding comment deep links.
- Reworking the full card hierarchy outside the footer.
- Push notifications, activity feed ranking changes, or analytics.
- New npm packages.
