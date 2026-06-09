# PowerSync → Supabase REST migration

Record of the migration that removed PowerSync from the client, plus the
remaining infrastructure work so it can be picked up later.

## Status

- **Client migration: COMPLETE.** The app runs entirely on **Supabase REST +
  [TanStack Query](https://tanstack.com/query)** with a **persistent write
  outbox** for offline-resilient score entry. No `@powersync` / `@journeyapps`
  code or dependencies remain; every commit passes `tsc --noEmit` + `expo lint`.
- **Smoke-tested on web:** auth, feed (confirmed refresh-only — no live push),
  offline scoring with reconnect flush, friends, comments/likes, round detail.
- **Not done yet (infrastructure):** decommission the PowerSync cloud service,
  drop its replication slot/publication, and (optionally) move to a smaller
  Supabase plan. See **Remaining work** below.

## Why we did this

Disk on Supabase was dominated by ~1 GB of WAL driven by PowerSync's logical
replication (`wal_level = logical`), pushing the project past the free tier.
The app is Instagram-shaped (rounds instead of posts): almost every row has a
**single writer** (its owner), and the only two-party flows (friend requests)
go through `SECURITY DEFINER` RPCs. RLS already enforces the exact "own +
friend" visibility the old PowerSync sync rules did. That made a
**pull-to-refresh + optimistic-write** model safe with no conflict/merge logic.

## New architecture

- **Reads:** Supabase REST (PostgREST `.select()`), RLS-scoped, cached with
  TanStack Query. Two JOIN-heavy screens use server objects: the feed uses the
  `get_feed` RPC; the friends-requests list uses the
  `friend_requests_with_profiles` view. Reads refresh on demand /
  pull-to-refresh (no Realtime, so `wal_level` can drop after teardown).
- **Writes:** optimistic REST `insert/update/delete` (or the existing RPCs).
- **Scoring:** score entry is optimistic **and** enqueued in a persistent
  AsyncStorage outbox (`src/library/data/writeOutbox.ts`) — idempotent upsert
  keyed on `(scorecard_id, scorer_id, hole_number)`, flushed on
  reconnect/foreground. Setup/teardown ops (start/complete/abandon/delete,
  hole range, tees) are optimistic + direct REST.
- **Auth:** Supabase magic-code OTP on the shared client
  (`src/library/supabase/client.ts` + `auth.ts`).
- **Live rounds → snapshot-on-refresh** (accepted product change).

## New server objects (deploy with / before the client)

Both are additive and PowerSync-safe (the old client ignores them):

- `supabase/migrations/019_get_feed_rpc.sql` — `get_feed(p_limit, p_before)`
  RPC powering the feed tab.
- `supabase/migrations/020_friend_requests_with_profiles.sql` — the
  `friend_requests_with_profiles` security-invoker view powering the friends tab.

`supabase db push` applies them. **Apply to prod before the client serves
traffic** (Vercel builds independently of the migration CI), otherwise the
feed/friends tabs break.

## Remaining work (infrastructure)

### Phase 5 — PowerSync teardown (stops WAL growth)

1. In the **PowerSync dashboard**, delete/disconnect the instance pointing at
   this Supabase DB (this frees the replication slot — it can't be dropped
   while active).
2. In the **Supabase SQL editor**:
   ```sql
   select slot_name, active from pg_replication_slots;   -- confirm powersync_* is inactive
   select pg_drop_replication_slot('powersync_6a1478a3234fa2bf51a59bea_3_eb8b');
   drop publication if exists powersync;                 -- if PowerSync created one
   ```
3. Confirm WAL stops growing: `select pg_size_pretty(sum(size)) from pg_ls_waldir();`
   (re-check over a day or two).

> Teardown breaks any **old** PowerSync client still talking to the slot. The
> web build is replaced on deploy and native is paused, so this is safe — just
> don't reactivate an old native build between cutover and teardown.

### Phase 6 — Reclaim disk / smaller plan

Supabase disk auto-grows but **never shrinks**, so reclaiming requires a fresh
project:

1. Create a new free-tier (small-disk) Supabase project.
2. `supabase link --project-ref <new>` → `supabase db push` (do **not**
   re-enable PowerSync replication / `wal_level=logical` unless something else
   needs it).
3. `pg_dump --data-only` from old → import to new (respect FK order).
4. Migrate `auth.users` + identities (OTP users) — **the riskiest step**;
   verify sign-in before cutover.
5. Repoint app env: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
6. Verify core flows, cut over, decommission the old project.

## Implementation notes & gotchas

- **`profiles` is keyed on `user_id`**, but the PowerSync local schema aliased
  it to `id`. All REST profile reads use `user_id` (and map it back where
  callers expect `id`).
- **jsonb is real JSON over REST.** Columns like `course_snapshot`,
  `participants`, `teams`, `details`, `contributor_ids` are read/written as
  objects. The feed (`useFeedRounds`) and round-detail (`useRoundDetail`)
  re-serialize them to strings only to reuse the existing
  `projectScorecardRow`, which still owns the JSON-string parse path.
- **Outbox scope is the score path only** — that's the genuinely offline part
  (mid-round, bad signal). Setup/teardown is online. Retries are safe because
  the score upsert is idempotent on its natural key.
- **RLS is the sole visibility gate** now (policies in migrations
  002/003/004/005/007/013/014/017 mirror the old sync rules). Re-confirm on any
  new project.
- **`get_feed` (019)** declares its return columns (e.g. `id text`); confirm
  they match the real schema when applying to a new project.

## Code follow-ups (not blocking)

- The README's lower PowerSync ops sections (sync-rules, `powersync_role`,
  `deploy-powersync` CI) are legacy — delete after teardown.
- `docs/qa/*.md` checklists describe PowerSync local-first behavior — update for
  the REST / pull-to-refresh model.
- There is no automated test harness; consider adding one before the next
  large change.
