-- Migration 020 — pending friend requests joined to requester/target profiles.
--
-- Adds a PostgREST-readable endpoint for the post-PowerSync friend
-- request lists. This mirrors the old local PowerSync query in
-- FriendsContext: pending friend_requests, joined to both profiles so
-- the client can render incoming (to_user_id = me) and outgoing
-- (from_user_id = me) requests from one REST read.
--
-- SECURITY MODEL:
--
--   This is a SECURITY INVOKER view (Postgres 15+), so reads execute
--   as the API caller. RLS on public.friend_requests therefore scopes
--   rows to `from_user_id = auth.uid() or to_user_id = auth.uid()`.
--   RLS on public.profiles remains `using (true)` for authenticated
--   users, which matches the existing search/profile-read behavior.
--
-- FALLBACK:
--
--   Supabase projects currently run Postgres versions that support
--   SECURITY INVOKER views. If this were ever applied to an older
--   Postgres version, replace the view with an authenticated RPC
--   `get_friend_requests()` returning the same columns and explicitly
--   filtering `where fr.from_user_id = auth.uid()
--              or fr.to_user_id = auth.uid()`.

create or replace view public.friend_requests_with_profiles
with (security_invoker = true)
as
select
  fr.id,
  fr.from_user_id,
  fr.to_user_id,
  fr.status,
  fr.created_at,
  pf.user_id       as from_profile_user_id,
  pf.handle        as from_handle,
  pf.display_name  as from_display_name,
  pf.avatar_color  as from_avatar_color,
  pt.user_id       as to_profile_user_id,
  pt.handle        as to_handle,
  pt.display_name  as to_display_name,
  pt.avatar_color  as to_avatar_color
from public.friend_requests fr
left join public.profiles pf on pf.user_id = fr.from_user_id
left join public.profiles pt on pt.user_id = fr.to_user_id
where fr.status = 'pending';

revoke all on public.friend_requests_with_profiles from public;
grant select on public.friend_requests_with_profiles to authenticated;
