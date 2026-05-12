-- 011_rename_local_player_fields.sql
--
-- Path 3a follow-up. Local players (formerly "unlinked players") are no
-- longer surfaced as an entity in the UI; the entity still exists in the
-- backend purely so per-person stats and avatar colors stay consistent
-- for recurring non-app guests. We're dropping the "unlinked" framing
-- from the snapshot field names because nothing about these participants
-- implies a future link.
--
-- Rename, applied row-by-row across `scorecards.participants` (a jsonb
-- array of participant objects):
--
--   unlinkedDisplayName  -> localDisplayName
--   unlinkedDisplayColor -> localDisplayColor
--
-- Both keys are optional and only populated when `linkedUserId` is
-- absent. Other participant keys (participantKey, linkedUserId, teamId)
-- are preserved untouched.
--
-- Idempotent: rows whose participants already use the new keys pass
-- through unchanged.

update public.scorecards
set participants = (
  select coalesce(jsonb_agg(
    case
      when p ? 'unlinkedDisplayName' or p ? 'unlinkedDisplayColor' then
        (p - 'unlinkedDisplayName' - 'unlinkedDisplayColor')
          || case
               when p ? 'unlinkedDisplayName'
                 then jsonb_build_object('localDisplayName', p->'unlinkedDisplayName')
               else '{}'::jsonb
             end
          || case
               when p ? 'unlinkedDisplayColor'
                 then jsonb_build_object('localDisplayColor', p->'unlinkedDisplayColor')
               else '{}'::jsonb
             end
      else p
    end
  ), '[]'::jsonb)
  from jsonb_array_elements(participants) as p
)
where exists (
  select 1
  from jsonb_array_elements(participants) as p
  where p ? 'unlinkedDisplayName' or p ? 'unlinkedDisplayColor'
);
