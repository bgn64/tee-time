import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { GolfPlayer, SavedRound } from "./golf-model.mts";
import { recordedStats, scoreKey, summarize } from "./golf-model.mts";
import { courseFrom, initials, integer, json, list, object, strings, text } from "./golf-validation.mts";

const tables = new Set([
  "profiles", "courses", "course_tee_sets", "course_tee_holes", "custom_players",
  "custom_stat_definitions", "roster_players", "scorecards", "scorecard_scores",
  "scorecard_hole_details", "scorecard_shot_attributions", "friend_requests",
  "friendships", "comments", "round_likes",
]);

export type LegacyRow = Record<string, string | null>;
export type LegacyData = Record<string, LegacyRow[]>;

export function decodeCopy(value: string): string | null {
  if (value === "\\N") return null;
  return value.replace(/\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|.)/g, (_, escape: string) => {
    const escapes: Record<string, string> = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\" };
    if (escape in escapes) return escapes[escape];
    if (/^[0-7]/.test(escape)) return String.fromCharCode(parseInt(escape, 8));
    if (escape.startsWith("x")) return String.fromCharCode(parseInt(escape.slice(1), 16));
    return escape;
  });
}

export function parseGolfDump(sql: string): LegacyData {
  const result: LegacyData = Object.fromEntries([...tables].map((table) => [table, []]));
  let current: { table: string; columns: string[] } | null = null;
  let inCopy = false;
  for (const line of sql.split(/\r?\n/)) {
    if (!inCopy) {
      const header = /^COPY ([\w.]+) \(([^)]+)\) FROM stdin;$/.exec(line);
      if (!header) continue;
      inCopy = true;
      const table = header[1].startsWith("public.") ? header[1].slice(7) : "";
      current = tables.has(table) ? { table, columns: header[2].split(", ") } : null;
    } else if (line === "\\.") {
      inCopy = false;
      current = null;
    } else if (current) {
      const values = line.split("\t");
      if (values.length !== current.columns.length) throw new Error(`Malformed COPY row in ${current.table}.`);
      result[current.table].push(Object.fromEntries(current.columns.map((column, index) => [column, decodeCopy(values[index])])));
    }
  }
  if (inCopy) throw new Error("Unterminated COPY section.");
  return result;
}

export function readGolfDump(path: string) {
  const buffer = readFileSync(path);
  return parseGolfDump((path.endsWith(".gz") ? gunzipSync(buffer) : buffer).toString("utf8"));
}

export function importGolf(db: Database.Database, data: LegacyData, mapping: Record<string, string>, dryRun = false) {
  const digest = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  if (!data.profiles.length || !data.courses.length) throw new Error("The dump contains no usable golf profiles or course catalog.");
  if (data.course_tee_sets.length || data.course_tee_holes.length) throw new Error("This dump uses normalized tee tables. Extend the converter before importing; no records have been written.");
  const mappingDigest = createHash("sha256").update(JSON.stringify(Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b)).map(([id, email]) => [id, email.toLowerCase()]))).digest("hex");
  const previous = db.prepare("SELECT report FROM golf_imports WHERE digest=?").get(digest) as { report: string } | undefined;
  if (previous) {
    const report = object(JSON.parse(previous.report));
    if (report.mappingDigest !== mappingDigest) throw new Error("This source was imported with a different ownership mapping. Do not relink accounts implicitly.");
    return { ...report, alreadyImported: true };
  }
  const accounts = new Map<string, { id: string; name: string }>();
  for (const profile of data.profiles) {
    const email = mapping[text(profile.user_id)];
    if (!email) throw new Error(`An explicit local-account mapping is required for ${profile.display_name}.`);
    const account = db.prepare("SELECT id,name FROM user WHERE lower(email)=lower(?)").get(email) as { id: string; name: string } | undefined;
    if (!account) throw new Error(`Create the local account for ${profile.display_name} before importing.`);
    if ([...accounts.values()].some((item) => item.id === account.id)) throw new Error("Each historical profile must map to a distinct account to preserve social relationships.");
    accounts.set(text(profile.user_id), account);
  }
  function account(id: string | null | undefined) {
    const found = id ? accounts.get(id) : undefined;
    if (!found) throw new Error("An imported record references an unmapped profile.");
    return found.id;
  }
  function player(owner: string, key: string, overrides: Record<string, unknown>[] = []): GolfPlayer {
    const legacy = key === "user" ? `user:${owner}` : key;
    const roster = data.roster_players.find((row) => row.owner_user_id === owner && (row.id === legacy || row.id === key || row.id === legacy.replace(/^custom:/, "")));
    const linked = legacy.startsWith("user:") ? legacy.slice(5) : roster?.linked_user_id;
    const custom = data.custom_players.find((row) => row.id === legacy.replace(/^custom:/, ""));
    const override = overrides.find((row) => row.participantKey === key || row.participantKey === legacy);
    if (linked) {
      const local = accounts.get(linked);
      if (!local) throw new Error("Unknown linked golfer.");
      const name = typeof override?.localDisplayName === "string" ? override.localDisplayName : data.profiles.find((p) => p.user_id === linked)?.display_name ?? local.name;
      return { id: `account:${local.id}`, accountId: local.id, name, initials: initials(name), color: "", deleted: false };
    }
    const name = typeof override?.localDisplayName === "string" ? override.localDisplayName : roster?.nickname ?? custom?.nickname;
    if (!name) throw new Error(`Unresolved participant ${key}.`);
    return { id: `guest:${legacy.replace(/^custom:/, "")}`, accountId: null, name, initials: initials(name), color: "clay", deleted: !!custom?.deleted_at };
  }
  const mergedCounts = { normalized: 0, jsonOnly: 0, overlap: 0, canonical: 0 };
  const reportRounds: { id: string; scorers: ReturnType<typeof summarize>[]; stats: ReturnType<typeof recordedStats>[] }[] = [];
  const rollback = Symbol("dry-run");
  let report: Record<string, unknown> = {};
  try {
    db.transaction(() => {
      db.prepare("INSERT INTO golf_imports VALUES (?,?,?)").run(digest, new Date().toISOString(), "{}");
      for (const [table, rows] of Object.entries(data)) {
        const insert = db.prepare("INSERT INTO golf_legacy VALUES (?,?,?,?)");
        rows.forEach((row, index) => insert.run(digest, table, index, JSON.stringify(row)));
      }
      for (const profile of data.profiles) {
        const existing = db.prepare("SELECT legacy_id FROM golf_profiles WHERE user_id=?").get(account(profile.user_id)) as { legacy_id: string | null } | undefined;
        if (existing?.legacy_id) throw new Error("This account is already linked to a historical profile.");
        db.prepare("INSERT INTO golf_profiles VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET legacy_id=excluded.legacy_id,name=excluded.name,handle=excluded.handle")
          .run(account(profile.user_id), profile.user_id, text(profile.display_name), text(profile.handle));
      }
      for (const row of data.courses) {
        const course = courseFrom({ id: row.id, name: row.name, location: [row.city, row.state, row.country].filter(Boolean).join(", "), holes: json(row.holes), tees: json(row.tees) });
        db.prepare("INSERT INTO golf_courses VALUES (?,?,?,?,?,?)").run(course.id, course.name, course.location, row.owner_user_id ? account(row.owner_user_id) : null, text(row.source), JSON.stringify(course));
      }
      const putPlayer = db.prepare("INSERT INTO golf_players VALUES (?,?,?,?,?,?) ON CONFLICT(owner_id,id) DO NOTHING");
      for (const row of data.roster_players) {
        const p = player(text(row.owner_user_id), text(row.id));
        putPlayer.run(p.id, account(row.owner_user_id), p.accountId, p.name, p.color, Number(p.deleted));
      }
      for (const row of data.custom_players) {
        const p = player(text(row.owner_user_id), `custom:${row.id}`);
        putPlayer.run(p.id, account(row.owner_user_id), null, p.name, p.color, Number(p.deleted));
      }
      for (const row of data.custom_stat_definitions) {
        if (!["binary", "integer"].includes(text(row.value_type))) throw new Error("Unsupported custom stat type.");
        db.prepare("INSERT INTO golf_stat_definitions VALUES (?,?,?,?,?)").run(row.id, account(row.owner_user_id), row.label, row.value_type, Number(!!row.deleted_at));
      }
      for (const row of data.scorecards) {
        const owner = text(row.owner_user_id);
        const participants = list(json(row.participants)).map(object);
        const players = strings(json(row.player_ids)).map((key) => player(owner, key, participants));
        const format = text(row.scoring_rule);
        if (format !== "stroke" && format !== "scramble") throw new Error("Unsupported historical scoring format.");
        const course = courseFrom(json(row.course_snapshot));
        if (!course.holes.length) throw new Error("A historical round has no hole snapshot.");
        const scorers = format === "stroke" ? players.map((p) => ({ ...p, playerIds: [p.id] })) : list(json(row.teams)).map((value) => {
          const team = object(value);
          const name = text(team.name);
          return { id: text(team.id), name, initials: initials(name), color: "slate", playerIds: strings(team.playerIds).map((id) => player(owner, id, participants).id) };
        });
        if (!scorers.length) throw new Error("A round has no scorers.");
        if (scorers.some((s) => s.playerIds.some((id) => !players.some((p) => p.id === id)))) throw new Error("A historical team references a player outside its round.");
        const scorerId = (id: string) => {
          const normalized = format === "stroke" ? player(owner, id, participants).id : id;
          if (!scorers.some((s) => s.id === normalized)) throw new Error(`Unknown scorer in round ${row.id}.`);
          return normalized;
        };
        const customStats: SavedRound["customStats"] = list(json(row.custom_stat_definitions)).map((value) => {
          const stat = object(value);
          if (stat.type !== "binary" && stat.type !== "integer") throw new Error("Invalid historical custom stat.");
          return { id: text(stat.key), label: text(stat.label), valueType: stat.type };
        });
        const teeSelections: Record<string, string> = {};
        for (const participant of participants) if (participant.teeId) teeSelections[player(owner, text(participant.participantKey), participants).id] = text(participant.teeId);
        const round: SavedRound = {
          id: text(row.id), ownerId: account(owner), course, format, players, scorers,
          scores: {}, details: {}, stats: strings(json(row.enabled_stat_keys)).length > 0,
          enabledStatKeys: strings(json(row.enabled_stat_keys)),
          trackedScorerIds: strings(json(row.tracked_scorer_ids)).map(scorerId), customStats,
          finished: !!row.completed_at, date: new Date(text(row.started_at)).toISOString(),
          caption: row.caption ?? "", visibility: "friends", version: 1,
          currentHole: Number(row.current_hole_number) || course.holes[0].number, teeSelections,
        };
        if (row.hole_range && row.hole_range !== "all") {
          if (row.hole_range !== "front9" && row.hole_range !== "back9") throw new Error("Unknown historical hole range.");
          round.legacyHoleRange = row.hole_range;
          round.expectedHoleNumbers = course.holes.filter((h) => row.hole_range === "front9" ? h.number <= 9 : h.number >= 10).map((h) => h.number);
          if (!round.expectedHoleNumbers.length) throw new Error("The historical hole range conflicts with its course snapshot.");
        }
        const addScore = (id: string, hole: number, strokes: number, normalized: boolean) => {
          const scorer = scorerId(id);
          if (!course.holes.some((h) => h.number === hole)) throw new Error("A source score references an unknown hole.");
          if (round.expectedHoleNumbers && !round.expectedHoleNumbers.includes(hole)) throw new Error("A source score lies outside the declared historical hole range.");
          integer(strokes, 1, 30);
          const key = scoreKey(scorer, hole);
          const previous = round.scores[key];
          if (previous !== undefined && previous !== strokes) throw new Error("Conflicting legacy score sources; no data was imported.");
          if (normalized) { mergedCounts.normalized++; if (previous !== undefined) mergedCounts.overlap++; }
          round.scores[key] = strokes;
        };
        for (const value of list(json(row.scores))) {
          const score = object(value);
          addScore(text(score.scorerId), integer(score.holeNumber, 1, 36), integer(score.strokes, 1, 30), false);
        }
        const jsonKeys = new Set(Object.keys(round.scores));
        for (const score of data.scorecard_scores.filter((s) => s.scorecard_id === row.id)) {
          if (score.owner_user_id !== owner) throw new Error("Score ownership mismatch.");
          const key = scoreKey(scorerId(text(score.scorer_id)), Number(score.hole_number));
          jsonKeys.delete(key);
          addScore(text(score.scorer_id), Number(score.hole_number), Number(score.strokes), true);
        }
        mergedCounts.jsonOnly += jsonKeys.size;
        for (const detail of data.scorecard_hole_details.filter((d) => d.scorecard_id === row.id)) {
          if (detail.owner_user_id !== owner || !course.holes.some((h) => h.number === Number(detail.hole_number))) throw new Error("Invalid hole-detail reference.");
          const source = object(json(detail.details));
          const key = scoreKey(scorerId(text(detail.scorer_id)), Number(detail.hole_number));
          const converted: Record<string, unknown> = {};
          const custom: Record<string, boolean | number> = {};
          for (const [field, value] of Object.entries(source)) {
            if (field.startsWith("custom:")) {
              if (typeof value !== "boolean" && typeof value !== "number") throw new Error("Invalid custom stat value.");
              custom[field] = value;
            } else {
              if (!["putts", "fir", "gir", "ob", "sand", "recovery"].includes(field)) throw new Error("Unknown hole stat; update importer before proceeding.");
              if (["fir", "gir", "recovery"].includes(field) ? typeof value !== "boolean" : typeof value !== "number") throw new Error("Invalid hole stat.");
              converted[field] = value;
            }
          }
          round.details[key] = { ...converted, ...(Object.keys(custom).length ? { custom } : {}) };
        }
        for (const attribution of data.scorecard_shot_attributions.filter((a) => a.scorecard_id === row.id)) {
          if (attribution.owner_user_id !== owner) throw new Error("Attribution ownership mismatch.");
          const key = scoreKey(scorerId(text(attribution.team_id)), Number(attribution.hole_number));
          // Positions represent individual strokes; keep duplicates and unassigned strokes.
          const contributors = list(json(attribution.contributor_ids)).map((id) => id === "" ? "" : player(owner, text(id), participants).id);
          const team = scorers.find((s) => s.id === attribution.team_id);
          if (!team || contributors.some((id) => id !== "" && !team.playerIds.includes(id))) throw new Error("Invalid scramble contributor.");
          round.details[key] = { ...round.details[key], contributors };
        }
        mergedCounts.canonical += Object.keys(round.scores).length;
        reportRounds.push({ id: round.id, scorers: scorers.map((s) => summarize(round, s.id)), stats: scorers.map((s) => recordedStats(round, s.id)) });
        db.prepare("INSERT INTO golf_rounds VALUES (?,?,?,?,?,?,?,?)").run(round.id, round.ownerId, row.course_id, round.date, Number(round.finished), round.visibility, round.version, JSON.stringify(round));
      }
      for (const table of ["scorecard_scores", "scorecard_hole_details", "scorecard_shot_attributions"]) {
        if (data[table].some((row) => !data.scorecards.some((round) => round.id === row.scorecard_id))) throw new Error(`Orphaned records in ${table}.`);
      }
      for (const row of data.friendships) db.prepare("INSERT INTO golf_friendships VALUES (?,?)").run(account(row.user_id), account(row.friend_user_id));
      for (const row of data.friend_requests) db.prepare("INSERT INTO golf_requests VALUES (?,?,?,?,?)").run(row.id, account(row.from_user_id), account(row.to_user_id), row.status, row.created_at);
      for (const row of data.comments) db.prepare("INSERT INTO golf_comments VALUES (?,?,?,?,?,?)").run(row.id, row.round_id, account(row.author_user_id), row.body, row.created_at, row.deleted_at);
      for (const row of data.round_likes) db.prepare("INSERT INTO golf_likes VALUES (?,?)").run(row.round_id, account(row.liker_user_id));
      report = { digest, mappingDigest, dryRun, counts: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])), scores: mergedCounts, rounds: reportRounds };
      if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Import foreign-key validation failed.");
      db.prepare("UPDATE golf_imports SET report=? WHERE digest=?").run(JSON.stringify({ ...report, dryRun: false }), digest);
      if (dryRun) throw rollback;
    })();
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return report;
}
