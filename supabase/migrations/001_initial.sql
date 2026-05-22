


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_friend_request"("request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  req public.friend_requests;
begin
  select * into req from public.friend_requests where id = request_id;

  if req is null then
    raise exception 'friend_request % not found', request_id;
  end if;

  if req.to_user_id <> auth.uid() then
    raise exception 'only the recipient may accept a friend request';
  end if;

  if req.status <> 'pending' then
    raise exception 'friend_request is not pending (status=%)', req.status;
  end if;

  update public.friend_requests
    set status = 'accepted'
    where id = request_id;

  insert into public.friendships (user_id, friend_user_id)
    values (req.from_user_id, req.to_user_id)
    on conflict do nothing;

  insert into public.friendships (user_id, friend_user_id)
    values (req.to_user_id, req.from_user_id)
    on conflict do nothing;
end;
$$;


ALTER FUNCTION "public"."accept_friend_request"("request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_friend_demo_seeds"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Skip when the new row is itself a demo seed — we don't want pros
  -- auto-friending each other every time a new seed is inserted.
  if new.is_demo_seed then
    return new;
  end if;

  -- For every existing demo-seed profile, insert symmetric friendship
  -- rows. on conflict do nothing keeps the trigger idempotent in case
  -- of a retry / replay.
  insert into public.friendships (user_id, friend_user_id)
  select new.user_id, p.user_id
    from public.profiles p
    where p.is_demo_seed = true
      and p.user_id <> new.user_id
  on conflict (user_id, friend_user_id) do nothing;

  insert into public.friendships (user_id, friend_user_id)
  select p.user_id, new.user_id
    from public.profiles p
    where p.is_demo_seed = true
      and p.user_id <> new.user_id
  on conflict (user_id, friend_user_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."auto_friend_demo_seeds"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enrich_catalog_course"("p_id" "text", "p_holes" "jsonb", "p_tees" "jsonb" DEFAULT '[]'::"jsonb", "p_hole_count" integer DEFAULT NULL::integer, "p_total_par" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  hole_count_local int;
  bad_hole         int;
  bad_par          int;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  if not exists (
    select 1 from public.courses where id = p_id and source = 'opengolf'
  ) then
    raise exception 'catalog course % not found', p_id;
  end if;

  if jsonb_typeof(p_holes) <> 'array' then
    raise exception 'holes must be a jsonb array';
  end if;
  if jsonb_typeof(p_tees) <> 'array' then
    raise exception 'tees must be a jsonb array';
  end if;

  if jsonb_array_length(p_holes) > 0 then
    hole_count_local := jsonb_array_length(p_holes);
    if hole_count_local > 36 then
      raise exception 'hole count % is implausible', hole_count_local;
    end if;
    select (h->>'number')::int, (h->>'par')::int
      into bad_hole, bad_par
    from jsonb_array_elements(p_holes) h
    where (h->>'number') is null
       or (h->>'par') is null
       or (h->>'par')::int < 1
       or (h->>'par')::int > 7
    limit 1;
    if bad_hole is not null then
      raise exception 'invalid hole entry (number=%, par=%)', bad_hole, bad_par;
    end if;
  end if;

  if p_hole_count is not null and (p_hole_count < 1 or p_hole_count > 36) then
    raise exception 'hole_count % is implausible', p_hole_count;
  end if;
  if p_total_par is not null and (p_total_par < 9 or p_total_par > 200) then
    raise exception 'total_par % is implausible', p_total_par;
  end if;

  -- v015 semantics: REPLACE the jsonb fields whenever the payload is
  -- non-empty. Drops the fill-once safeguard introduced in 010 — that
  -- behavior locked stale skinny holes in place on any course that was
  -- bulk-imported before per-hole yardages flowed through. Empty
  -- payload still falls back to the existing value (i.e. preserves
  -- whatever's there rather than zeroing it).
  update public.courses
    set holes            = case
                             when jsonb_array_length(p_holes) > 0 then p_holes
                             else holes
                           end,
        tees             = case
                             when jsonb_array_length(p_tees)  > 0 then p_tees
                             else tees
                           end,
        hole_count       = coalesce(p_hole_count, hole_count),
        total_par        = coalesce(p_total_par,  total_par),
        last_enriched_at = now()
    where id = p_id
      and source = 'opengolf';
end;
$$;


ALTER FUNCTION "public"."enrich_catalog_course"("p_id" "text", "p_holes" "jsonb", "p_tees" "jsonb", "p_hole_count" integer, "p_total_par" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_friend_of"("other_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.friendships
    where user_id = auth.uid() and friend_user_id = other_user_id
  );
$$;


ALTER FUNCTION "public"."is_friend_of"("other_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "text" NOT NULL,
    "owner_user_id" "uuid",
    "source" "text" NOT NULL,
    "name" "text" NOT NULL,
    "city" "text",
    "state" "text",
    "country" "text",
    "address" "text",
    "postal_code" "text",
    "latitude" double precision,
    "longitude" double precision,
    "course_type" "text",
    "hole_count" integer NOT NULL,
    "total_par" integer,
    "total_yardage" integer,
    "year_built" integer,
    "architect" "text",
    "phone" "text",
    "website" "text",
    "holes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tees" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "source_external_id" "text",
    "source_updated_at" timestamp with time zone,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_enriched_at" timestamp with time zone,
    CONSTRAINT "courses_owner_matches_source" CHECK (((("source" = 'opengolf'::"text") AND ("owner_user_id" IS NULL)) OR (("source" = 'custom'::"text") AND ("owner_user_id" IS NOT NULL)))),
    CONSTRAINT "courses_source_check" CHECK (("source" = ANY (ARRAY['opengolf'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friend_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "source_player_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friend_requests_no_self_check" CHECK (("from_user_id" <> "to_user_id")),
    CONSTRAINT "friend_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."friend_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "user_id" "uuid" NOT NULL,
    "friend_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_no_self_check" CHECK (("user_id" <> "friend_user_id"))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "handle" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "avatar_color" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_demo_seed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_handle_format_check" CHECK (("handle" ~ '^[a-z][a-z0-9._]{2,19}$'::"text")),
    CONSTRAINT "profiles_handle_lowercase_check" CHECK (("handle" = "lower"("handle")))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roster_players" (
    "owner_user_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "nickname" "text" NOT NULL,
    "color" "text",
    "linked_user_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roster_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scorecards" (
    "id" "text" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "course_snapshot" "jsonb" NOT NULL,
    "scoring_rule" "text" NOT NULL,
    "player_ids" "jsonb" NOT NULL,
    "teams" "jsonb",
    "scores" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "current_hole_number" integer DEFAULT 1 NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "round_id" "text",
    "mentioned_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "participants" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "hole_range" "text" DEFAULT 'all'::"text" NOT NULL,
    "caption" "text",
    "is_live_shareable" boolean DEFAULT true NOT NULL,
    "last_score_at" timestamp with time zone,
    CONSTRAINT "rounds_scoring_rule_check" CHECK (("scoring_rule" = ANY (ARRAY['stroke'::"text", 'scramble'::"text"]))),
    CONSTRAINT "scorecards_hole_range_check" CHECK (("hole_range" = ANY (ARRAY['all'::"text", 'front9'::"text", 'back9'::"text"])))
);


ALTER TABLE "public"."scorecards" OWNER TO "postgres";


ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("user_id", "friend_user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."roster_players"
    ADD CONSTRAINT "roster_players_owner_linked_uniq" UNIQUE ("owner_user_id", "linked_user_id");



ALTER TABLE ONLY "public"."roster_players"
    ADD CONSTRAINT "roster_players_pkey" PRIMARY KEY ("owner_user_id", "id");



ALTER TABLE ONLY "public"."scorecards"
    ADD CONSTRAINT "rounds_pkey" PRIMARY KEY ("id");



CREATE INDEX "courses_city_lower_idx" ON "public"."courses" USING "btree" ("lower"("city") "text_pattern_ops") WHERE ("city" IS NOT NULL);



CREATE INDEX "courses_name_lower_idx" ON "public"."courses" USING "btree" ("lower"("name") "text_pattern_ops");



CREATE INDEX "courses_name_trgm_idx" ON "public"."courses" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "courses_owner_idx" ON "public"."courses" USING "btree" ("owner_user_id") WHERE ("owner_user_id" IS NOT NULL);



CREATE INDEX "courses_source_idx" ON "public"."courses" USING "btree" ("source");



CREATE INDEX "friend_requests_from_idx" ON "public"."friend_requests" USING "btree" ("from_user_id", "status");



CREATE INDEX "friend_requests_to_idx" ON "public"."friend_requests" USING "btree" ("to_user_id", "status");



CREATE UNIQUE INDEX "friend_requests_unique_pending" ON "public"."friend_requests" USING "btree" ("from_user_id", "to_user_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "friendships_friend_idx" ON "public"."friendships" USING "btree" ("friend_user_id");



CREATE INDEX "profiles_demo_seed_idx" ON "public"."profiles" USING "btree" ("is_demo_seed") WHERE ("is_demo_seed" = true);



CREATE UNIQUE INDEX "profiles_handle_unique" ON "public"."profiles" USING "btree" ("handle");



CREATE INDEX "scorecards_live_idx" ON "public"."scorecards" USING "btree" ("owner_user_id", "last_score_at" DESC) WHERE ("completed_at" IS NULL);



CREATE INDEX "scorecards_mentioned_idx" ON "public"."scorecards" USING "gin" ("mentioned_user_ids");



CREATE INDEX "scorecards_owner_idx" ON "public"."scorecards" USING "btree" ("owner_user_id", "completed_at" DESC);



CREATE UNIQUE INDEX "scorecards_owner_in_progress_uniq" ON "public"."scorecards" USING "btree" ("owner_user_id") WHERE ("completed_at" IS NULL);



CREATE OR REPLACE TRIGGER "courses_touch_updated_at" BEFORE UPDATE ON "public"."courses" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "friend_requests_touch_updated_at" BEFORE UPDATE ON "public"."friend_requests" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_auto_friend_demo_seeds" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."auto_friend_demo_seeds"();



CREATE OR REPLACE TRIGGER "profiles_touch_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "roster_players_touch_updated_at" BEFORE UPDATE ON "public"."roster_players" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "scorecards_touch_updated_at" BEFORE UPDATE ON "public"."scorecards" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_friend_user_id_fkey" FOREIGN KEY ("friend_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roster_players"
    ADD CONSTRAINT "roster_players_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roster_players"
    ADD CONSTRAINT "roster_players_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scorecards"
    ADD CONSTRAINT "rounds_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "courses_modify_own" ON "public"."courses" TO "authenticated" USING ((("source" = 'custom'::"text") AND ("owner_user_id" = "auth"."uid"()))) WITH CHECK ((("source" = 'custom'::"text") AND ("owner_user_id" = "auth"."uid"())));



CREATE POLICY "courses_select" ON "public"."courses" FOR SELECT TO "authenticated" USING ((("source" = 'opengolf'::"text") OR ("owner_user_id" = "auth"."uid"())));



ALTER TABLE "public"."friend_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friend_requests_insert_sender" ON "public"."friend_requests" FOR INSERT TO "authenticated" WITH CHECK ((("from_user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text")));



CREATE POLICY "friend_requests_select" ON "public"."friend_requests" FOR SELECT TO "authenticated" USING ((("from_user_id" = "auth"."uid"()) OR ("to_user_id" = "auth"."uid"())));



CREATE POLICY "friend_requests_update_either" ON "public"."friend_requests" FOR UPDATE TO "authenticated" USING ((("from_user_id" = "auth"."uid"()) OR ("to_user_id" = "auth"."uid"()))) WITH CHECK ((("from_user_id" = "auth"."uid"()) OR ("to_user_id" = "auth"."uid"())));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships_select" ON "public"."friendships" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("friend_user_id" = "auth"."uid"())));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_select_all" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."roster_players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roster_players_owner_all" ON "public"."roster_players" TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));



ALTER TABLE "public"."scorecards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scorecards_delete_owner" ON "public"."scorecards" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "scorecards_insert_owner" ON "public"."scorecards" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "scorecards_select" ON "public"."scorecards" FOR SELECT TO "authenticated" USING ((("owner_user_id" = "auth"."uid"()) OR "public"."is_friend_of"("owner_user_id")));



CREATE POLICY "scorecards_update_owner" ON "public"."scorecards" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."courses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friend_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friendships";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."roster_players";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."scorecards";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";




























































































































































REVOKE ALL ON FUNCTION "public"."accept_friend_request"("request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_friend_request"("request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_friend_demo_seeds"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_friend_demo_seeds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_friend_demo_seeds"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enrich_catalog_course"("p_id" "text", "p_holes" "jsonb", "p_tees" "jsonb", "p_hole_count" integer, "p_total_par" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enrich_catalog_course"("p_id" "text", "p_holes" "jsonb", "p_tees" "jsonb", "p_hole_count" integer, "p_total_par" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."enrich_catalog_course"("p_id" "text", "p_holes" "jsonb", "p_tees" "jsonb", "p_hole_count" integer, "p_total_par" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."enrich_catalog_course"("p_id" "text", "p_holes" "jsonb", "p_tees" "jsonb", "p_hole_count" integer, "p_total_par" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_friend_of"("other_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_friend_of"("other_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_friend_of"("other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_friend_of"("other_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."friend_requests" TO "anon";
GRANT ALL ON TABLE "public"."friend_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."friend_requests" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."roster_players" TO "anon";
GRANT ALL ON TABLE "public"."roster_players" TO "authenticated";
GRANT ALL ON TABLE "public"."roster_players" TO "service_role";



GRANT ALL ON TABLE "public"."scorecards" TO "anon";
GRANT ALL ON TABLE "public"."scorecards" TO "authenticated";
GRANT ALL ON TABLE "public"."scorecards" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































