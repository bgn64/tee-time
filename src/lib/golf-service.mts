import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { finishRound, recordedStats, scoreKey, scoringHoles, setScore, summarize, isPartial, type Course, type GolfPlayer, type GolfState, type GolfUser, type SavedRound } from "./golf-model.mts";
import { courseFrom, GolfError, initials, integer, list, object, strings, text } from "./golf-validation.mts";

type RoundRow = { document: string; owner_id: string; version: number; visibility: string };
export type Social = { likes: number; liked: boolean; comments: { id: string; userId: string; name: string; body: string; date: string }[]; hasMore: boolean };
export type MutationResult = { round?: SavedRound; player?: GolfPlayer; course?: Course; requestId?: string; ok?: boolean };

export function ensureProfile(db: Database.Database, user: GolfUser) {
  db.prepare("INSERT INTO golf_profiles(user_id,name,handle) VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING")
    .run(user.id, user.name, `g${user.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}`);
  db.prepare("INSERT INTO golf_players VALUES (?,?,?,?,?,0) ON CONFLICT(owner_id,id) DO NOTHING")
    .run(`account:${user.id}`, user.id, user.id, user.name, "");
}

export function areFriends(db: Database.Database, a: string, b: string) {
  return !!db.prepare("SELECT 1 FROM golf_friendships WHERE user_id=? AND friend_id=?").get(a, b);
}

export function readRound(db: Database.Database, userId: string, id: string, edit = false): SavedRound {
  const row = db.prepare("SELECT document,owner_id,version,visibility FROM golf_rounds WHERE id=?").get(id) as RoundRow | undefined;
  if (!row || (row.owner_id !== userId && (edit || row.visibility !== "friends" || !areFriends(db, row.owner_id, userId)))) {
    throw new GolfError("This round is unavailable or you don't have permission to access it.", 404);
  }
  return JSON.parse(row.document) as SavedRound;
}

function writeRound(db: Database.Database, round: SavedRound) {
  db.prepare(`INSERT INTO golf_rounds VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET finished=excluded.finished,visibility=excluded.visibility,version=excluded.version,document=excluded.document`)
    .run(round.id, round.ownerId, round.course.id, round.date, Number(round.finished), round.visibility, round.version, JSON.stringify(round));
}

export function readPlayers(db: Database.Database, userId: string): GolfPlayer[] {
  const rows = db.prepare("SELECT id,account_id,name,color,deleted FROM golf_players WHERE owner_id=? ORDER BY deleted,name COLLATE NOCASE").all(userId) as { id: string; account_id: string | null; name: string; color: string; deleted: number }[];
  return rows.map((row) => ({ id: row.id, accountId: row.account_id, name: row.name, color: row.color, initials: initials(row.name), deleted: !!row.deleted }));
}

export function ownRounds(db: Database.Database, userId: string, offset = 0) {
  integer(offset, 0, 1000000);
  const rows = db.prepare("SELECT document FROM golf_rounds WHERE owner_id=? ORDER BY started_at DESC,id LIMIT 31 OFFSET ?").all(userId, offset) as { document: string }[];
  return { rounds: rows.slice(0, 30).map((row) => JSON.parse(row.document) as SavedRound), hasMore: rows.length > 30 };
}

export function golfState(db: Database.Database, user: GolfUser): GolfState {
  ensureProfile(db, user);
  const history = ownRounds(db, user.id);
  const active = db.prepare("SELECT document FROM golf_rounds WHERE owner_id=? AND finished=0 ORDER BY started_at DESC LIMIT 30").all(user.id) as { document: string }[];
  const rounds = [...new Map([...active.map((r) => JSON.parse(r.document) as SavedRound), ...history.rounds].map((r) => [r.id, r])).values()];
  const friends = db.prepare(`SELECT p.user_id AS id,p.name,p.handle FROM golf_profiles p
    JOIN golf_friendships f ON f.friend_id=p.user_id WHERE f.user_id=? ORDER BY p.name`).all(user.id) as GolfState["friends"];
  const requests = db.prepare(`SELECT r.id,r.from_id AS fromId,r.to_id AS toId,p.name,r.status FROM golf_requests r
    JOIN golf_profiles p ON p.user_id=CASE WHEN r.from_id=? THEN r.to_id ELSE r.from_id END
    WHERE (r.from_id=? OR r.to_id=?) AND r.status='pending' ORDER BY r.created_at DESC`).all(user.id, user.id, user.id) as GolfState["requests"];
  const feed = friendFeed(db, user.id);
  const customStats = db.prepare("SELECT 'custom:'||id AS id,label,value_type AS valueType FROM golf_stat_definitions WHERE owner_id=? AND deleted=0 ORDER BY label").all(user.id) as SavedRound["customStats"];
  const profile = db.prepare("SELECT name,handle FROM golf_profiles WHERE user_id=?").get(user.id) as { name: string; handle: string };
  return { user: { ...user, ...profile }, rounds, hasMoreRounds: history.hasMore, players: readPlayers(db, user.id), friends, requests, feed: feed.rounds, hasMoreFeed: feed.hasMore, customStats };
}

export function friendFeed(db: Database.Database, userId: string, offset = 0) {
  integer(offset, 0, 1000000);
  const rows = db.prepare(`SELECT r.document FROM golf_rounds r JOIN golf_friendships f ON f.friend_id=r.owner_id
    WHERE f.user_id=? AND r.visibility='friends' ORDER BY r.started_at DESC,r.id LIMIT 21 OFFSET ?`).all(userId, offset) as { document: string }[];
  return { rounds: rows.slice(0, 20).map((row) => JSON.parse(row.document) as SavedRound), hasMore: rows.length > 20 };
}

export function searchCourses(db: Database.Database, userId: string, query: string, offset = 0) {
  if (query.length > 200) throw new GolfError("Search is too long.");
  integer(offset, 0, 1000000);
  const escaped = query.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = db.prepare(`SELECT document FROM golf_courses
    WHERE (owner_id IS NULL OR owner_id=?) AND (name LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\')
    ORDER BY name COLLATE NOCASE,id LIMIT 21 OFFSET ?`).all(userId, `%${escaped}%`, `%${escaped}%`, offset) as { document: string }[];
  return { courses: rows.slice(0, 20).map((row) => JSON.parse(row.document) as Course), hasMore: rows.length > 20 };
}

export function social(db: Database.Database, userId: string, id: string, offset = 0): Social {
  readRound(db, userId, id);
  integer(offset, 0, 1000000);
  const likes = db.prepare("SELECT count(*) AS n FROM golf_likes WHERE round_id=?").get(id) as { n: number };
  const comments = db.prepare(`SELECT c.id,c.user_id AS userId,p.name,c.body,c.created_at AS date
    FROM golf_comments c JOIN golf_profiles p ON p.user_id=c.user_id WHERE c.round_id=? AND c.deleted_at IS NULL
    ORDER BY c.created_at DESC,c.id DESC LIMIT 31 OFFSET ?`).all(id, offset) as Social["comments"];
  return { likes: likes.n, liked: !!db.prepare("SELECT 1 FROM golf_likes WHERE round_id=? AND user_id=?").get(id, userId), comments: comments.slice(0, 30), hasMore: comments.length > 30 };
}

export function statistics(db: Database.Database, userId: string) {
  let rounds = 0, complete = 0, strokes = 0, best: number | null = null, partial = 0, putts = 0, puttHoles = 0, fairways = 0, firHoles = 0, greens = 0, girHoles = 0;
  const lengths: Record<number, { rounds: number; strokes: number; best: number }> = {};
  for (const row of db.prepare("SELECT document FROM golf_rounds WHERE owner_id=? AND finished=1").iterate(userId) as Iterable<{ document: string }>) {
    const r = JSON.parse(row.document) as SavedRound;
    const scorer = r.scorers.find((s) => s.id === `account:${userId}`);
    if (r.format !== "stroke" || !scorer) continue;
    const total = summarize(r, scorer.id);
    if (!total.played) continue;
    rounds++;
    const stats = recordedStats(r, scorer.id);
    putts += stats.putts; puttHoles += stats.puttHoles; fairways += stats.fairways; firHoles += stats.firHoles; greens += stats.greens; girHoles += stats.girHoles;
    if (isPartial(r)) { partial++; continue; }
    complete++; strokes += total.strokes;
    best = best === null ? total.strokes : Math.min(best, total.strokes);
    const length = scoringHoles(r).length;
    const group = lengths[length] ?? { rounds: 0, strokes: 0, best: Infinity };
    group.rounds++; group.strokes += total.strokes; group.best = Math.min(group.best, total.strokes);
    lengths[length] = group;
  }
  return { rounds, complete, partial, strokes, best, lengths, putts, puttHoles, fairways, firHoles, greens, girHoles };
}

function changeDetail(round: SavedRound, scorerId: string, hole: number, input: unknown) {
  const key = scoreKey(scorerId, hole);
  if (!round.scorers.some((s) => s.id === scorerId) || !round.course.holes.some((h) => h.number === hole) || round.scores[key] === undefined) throw new GolfError("Record a score for this golfer or team first.");
  const detail = object(input);
  const clean: NonNullable<SavedRound["details"][string]> = {};
  for (const [field, value] of Object.entries(detail)) {
    if (["putts", "ob", "sand"].includes(field)) {
      if (!round.enabledStatKeys.includes(field)) throw new GolfError("This stat is not enabled.");
      clean[field as "putts" | "ob" | "sand"] = integer(value, 0, 30);
    } else if (field === "fir" || field === "gir" || field === "recovery") {
      if (!round.enabledStatKeys.includes(field) || typeof value !== "boolean") throw new GolfError("Invalid or disabled stat.");
      clean[field] = value;
    } else if (field === "custom") {
      clean.custom = {};
      for (const [id, customValue] of Object.entries(object(value))) {
        const definition = round.customStats.find((s) => s.id === id);
        if (!definition || !round.enabledStatKeys.includes(id)) throw new GolfError("This custom stat is not enabled.");
        if (definition.valueType === "binary") { if (typeof customValue !== "boolean") throw new GolfError("Choose Yes or No."); clean.custom[id] = customValue; }
        else clean.custom[id] = integer(customValue, 0, 999);
      }
    } else if (field === "contributors") {
      const team = round.scorers.find((s) => s.id === scorerId)!;
      const values = list(value).map((v) => v === "" ? "" : text(v));
      if (round.format !== "scramble" || values.length > round.scores[key] || values.some((v) => v !== "" && !team.playerIds.includes(v))) throw new GolfError("Assign each stroke to a player on this team or leave it unassigned.");
      clean.contributors = values;
    } else throw new GolfError("Unknown hole statistic.");
  }
  return { ...round, details: { ...round.details, [key]: clean } };
}

function mutate(db: Database.Database, user: GolfUser, operation: string, payload: Record<string, unknown>): MutationResult {
  if (operation === "createRound") {
    const active = db.prepare("SELECT 1 FROM golf_rounds WHERE owner_id=? AND finished=0").get(user.id);
    if (active) throw new GolfError("Finish your active round before starting another.", 409);
    const courseRow = db.prepare("SELECT document FROM golf_courses WHERE id=? AND (owner_id IS NULL OR owner_id=?)").get(text(payload.courseId), user.id) as { document: string } | undefined;
    if (!courseRow) throw new GolfError("Choose an available course.");
    const course = JSON.parse(courseRow.document) as Course;
    if (!course.holes.length) throw new GolfError("Set up this course's holes before playing.");
    const ids = strings(payload.playerIds);
    const available = readPlayers(db, user.id).filter((p) => !p.deleted);
    const players = ids.map((id) => { const p = available.find((p) => p.id === id); if (!p) throw new GolfError("Choose players from your roster."); return p; });
    if (!ids.length || ids.length > 12 || new Set(ids).size !== ids.length) throw new GolfError("Select 1 to 12 different players.");
    if (payload.format !== "stroke" && payload.format !== "scramble") throw new GolfError("Choose stroke play or scramble.");
    const format = payload.format;
    const scorers = format === "stroke" ? players.map((p) => ({ ...p, playerIds: [p.id] })) : list(payload.teams).map((value) => {
      const team = object(value), name = text(team.name, "Team name", 80);
      const members = strings(team.playerIds);
      if (!members.length || members.some((id) => !ids.includes(id)) || new Set(members).size !== members.length) throw new GolfError("Choose a valid team.");
      return { id: randomUUID(), name, initials: initials(name), color: "slate", playerIds: members };
    });
    if (!scorers.length || (format === "scramble" && (scorers.flatMap((s) => s.playerIds).length !== ids.length || new Set(scorers.flatMap((s) => s.playerIds)).size !== ids.length))) throw new GolfError("Assign every player to exactly one team.");
    const teeSelections = Object.fromEntries(Object.entries(object(payload.teeSelections)).map(([id, tee]) => {
      if (!ids.includes(id) || !course.teeSets?.some((t) => t.id === tee)) throw new GolfError("Choose valid tees for each player.");
      return [id, text(tee)];
    }));
    const customStats = db.prepare("SELECT 'custom:'||id AS id,label,value_type AS valueType FROM golf_stat_definitions WHERE owner_id=? AND deleted=0").all(user.id) as SavedRound["customStats"];
    const enabledStatKeys = strings(payload.enabledStatKeys);
    if (enabledStatKeys.some((key) => !["putts", "fir", "gir", "ob", "sand", "recovery", ...customStats.map((s) => s.id)].includes(key))) throw new GolfError("Choose valid stats.");
    const round: SavedRound = { id: randomUUID(), ownerId: user.id, version: 1, course, format, players, scorers, date: new Date().toISOString(), finished: false, scores: {}, details: {}, caption: "", visibility: "private", stats: enabledStatKeys.length > 0, enabledStatKeys, trackedScorerIds: scorers.map((s) => s.id), customStats, currentHole: course.holes[0].number, teeSelections };
    writeRound(db, round);
    return { round };
  }
  if (operation === "round") {
    let round = readRound(db, user.id, text(payload.roundId), true);
    if (integer(payload.version, 1, Number.MAX_SAFE_INTEGER) !== round.version) throw new GolfError("This round changed on another device. Reload the saved round before editing again.", 409);
    const patch = object(payload.patch);
    const allowed = ["score", "detail", "finish", "reopen", "caption", "visibility", "currentHole"];
    if (!Object.keys(patch).length || Object.keys(patch).some((key) => !allowed.includes(key))) throw new GolfError("Invalid round update.");
    if (round.finished && ["score", "detail", "currentHole"].some((key) => key in patch)) throw new GolfError("Reopen the round before changing scores.");
    if ("score" in patch) {
      const score = object(patch.score);
      try { round = { ...round, ...setScore(round, text(score.scorerId), integer(score.hole, 1, 36), score.value === null ? null : integer(score.value, 1, 30)) }; }
      catch (error) { if (error instanceof GolfError) throw error; throw new GolfError(error instanceof Error ? error.message : "Invalid score."); }
    }
    if ("detail" in patch) { const d = object(patch.detail); round = changeDetail(round, text(d.scorerId), integer(d.hole, 1, 36), d.value); }
    if ("currentHole" in patch) { const n = integer(patch.currentHole, 1, 36); if (!round.course.holes.some((h) => h.number === n)) throw new GolfError("Unknown hole."); round.currentHole = n; }
    if ("caption" in patch) { if (typeof patch.caption !== "string" || patch.caption.length > 2000) throw new GolfError("Notes must be at most 2,000 characters."); round.caption = patch.caption; }
    if ("visibility" in patch) { if (patch.visibility !== "private" && patch.visibility !== "friends") throw new GolfError("Choose Private or Friends."); round.visibility = patch.visibility; }
    if ("reopen" in patch && patch.reopen !== true || "finish" in patch && patch.finish !== true || patch.reopen && patch.finish) throw new GolfError("Choose either Finish or Reopen.");
    if (patch.reopen === true) {
      if (db.prepare("SELECT 1 FROM golf_rounds WHERE owner_id=? AND finished=0 AND id<>?").get(user.id, round.id)) throw new GolfError("Finish your active round before reopening another.", 409);
      round.finished = false;
      delete round.expectedHoleNumbers;
    }
    if (patch.finish === true) {
      try { round = { ...round, ...finishRound(round) }; }
      catch (error) { throw new GolfError(error instanceof Error ? error.message : "Record a score first."); }
    }
    round.version++;
    writeRound(db, round);
    return { round };
  }
  if (operation === "guest") {
    const name = text(payload.name, "Player name", 80), id = `guest:${randomUUID()}`;
    db.prepare("INSERT INTO golf_players VALUES (?,?,NULL,?,?,0)").run(id, user.id, name, "clay");
    return { player: { id, name, initials: initials(name), color: "clay", accountId: null } };
  }
  if (operation === "deleteGuest") {
    const result = db.prepare("UPDATE golf_players SET deleted=1 WHERE owner_id=? AND id=? AND account_id IS NULL").run(user.id, text(payload.playerId));
    if (!result.changes) throw new GolfError("Guest not found.", 404);
    return { ok: true };
  }
  if (operation === "course") {
    const course = courseFrom(payload.course);
    if (!course.holes.length) throw new GolfError("Add at least one hole.");
    const exists = db.prepare("SELECT owner_id FROM golf_courses WHERE id=?").get(course.id) as { owner_id: string | null } | undefined;
    if (exists && exists.owner_id !== user.id) course.id = randomUUID();
    db.prepare("INSERT INTO golf_courses VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,location=excluded.location,document=excluded.document")
      .run(course.id, course.name, course.location, user.id, "custom", JSON.stringify(course));
    return { course };
  }
  if (operation === "friendRequest") {
    const target = db.prepare("SELECT user_id FROM golf_profiles WHERE handle=? COLLATE NOCASE").get(text(payload.handle)) as { user_id: string } | undefined;
    if (!target || target.user_id === user.id) throw new GolfError("No other golfer found with that handle.");
    if (areFriends(db, user.id, target.user_id)) throw new GolfError("You're already friends.");
    if (db.prepare("SELECT 1 FROM golf_requests WHERE status='pending' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))").get(user.id, target.user_id, target.user_id, user.id)) throw new GolfError("A request is already pending.");
    const id = randomUUID();
    db.prepare("INSERT INTO golf_requests VALUES (?,?,?,'pending',?)").run(id, user.id, target.user_id, new Date().toISOString());
    return { requestId: id };
  }
  if (operation === "answerRequest") {
    const row = db.prepare("SELECT from_id,to_id FROM golf_requests WHERE id=? AND status='pending'").get(text(payload.id)) as { from_id: string; to_id: string } | undefined;
    if (!row || (row.from_id !== user.id && row.to_id !== user.id)) throw new GolfError("Request unavailable.", 404);
    const answer = text(payload.answer);
    if (row.to_id === user.id ? !["accepted", "declined"].includes(answer) : answer !== "cancelled") throw new GolfError("Invalid request response.");
    db.prepare("UPDATE golf_requests SET status=? WHERE id=?").run(answer, payload.id as string);
    if (answer === "accepted") for (const [a, b] of [[row.from_id, row.to_id], [row.to_id, row.from_id]]) {
      db.prepare("INSERT INTO golf_friendships VALUES (?,?)").run(a, b);
      const profile = db.prepare("SELECT name FROM golf_profiles WHERE user_id=?").get(b) as { name: string };
      db.prepare("INSERT INTO golf_players VALUES (?,?,?,?,?,0) ON CONFLICT(owner_id,id) DO NOTHING").run(`account:${b}`, a, b, profile.name, "");
    }
    return { ok: true };
  }
  if (operation === "removeFriend") {
    const id = text(payload.id);
    db.prepare("DELETE FROM golf_friendships WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)").run(user.id, id, id, user.id);
    return { ok: true };
  }
  if (operation === "like" || operation === "comment" || operation === "deleteComment") {
    const round = readRound(db, user.id, text(payload.roundId));
    if (operation === "like") {
      if (typeof payload.liked !== "boolean") throw new GolfError("Choose a like state.");
      if (payload.liked) db.prepare("INSERT INTO golf_likes VALUES (?,?) ON CONFLICT DO NOTHING").run(round.id, user.id);
      else db.prepare("DELETE FROM golf_likes WHERE round_id=? AND user_id=?").run(round.id, user.id);
    } else if (operation === "comment") {
      db.prepare("INSERT INTO golf_comments VALUES (?,?,?,?,?,NULL)").run(randomUUID(), round.id, user.id, text(payload.body, "Comment", 1000), new Date().toISOString());
    } else {
      const result = db.prepare("UPDATE golf_comments SET deleted_at=? WHERE id=? AND round_id=? AND (user_id=? OR ?=?)").run(new Date().toISOString(), text(payload.id), round.id, user.id, round.ownerId, user.id);
      if (!result.changes) throw new GolfError("Comment unavailable.", 404);
    }
    return { ok: true };
  }
  if (operation === "profile") {
    const name = text(payload.name, "Name", 80), handle = text(payload.handle, "Handle", 40).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(handle)) throw new GolfError("Use 3-40 letters, numbers, underscores or hyphens for your handle.");
    if (db.prepare("SELECT 1 FROM golf_profiles WHERE handle=? COLLATE NOCASE AND user_id<>?").get(handle, user.id)) throw new GolfError("That handle is taken.");
    db.prepare("UPDATE golf_profiles SET name=?,handle=? WHERE user_id=?").run(name, handle, user.id);
    db.prepare("UPDATE user SET name=? WHERE id=?").run(name, user.id);
    db.prepare("UPDATE golf_players SET name=? WHERE owner_id=? AND account_id=?").run(name, user.id, user.id);
    return { ok: true };
  }
  if (operation === "statDefinition") {
    const id = typeof payload.id === "string" ? payload.id.replace(/^custom:/, "") : randomUUID();
    if (payload.deleted === true) {
      if (!db.prepare("UPDATE golf_stat_definitions SET deleted=1 WHERE owner_id=? AND id=?").run(user.id, id).changes) throw new GolfError("Stat not found.", 404);
    } else {
      if (payload.valueType !== "binary" && payload.valueType !== "integer") throw new GolfError("Choose Yes/No or a whole-number stat.");
      const existing = db.prepare("SELECT owner_id FROM golf_stat_definitions WHERE id=?").get(id) as { owner_id: string } | undefined;
      if (existing && existing.owner_id !== user.id) throw new GolfError("Stat unavailable.", 404);
      db.prepare("INSERT INTO golf_stat_definitions VALUES (?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET label=excluded.label,value_type=excluded.value_type")
        .run(id, user.id, text(payload.label, "Stat label", 80), payload.valueType);
    }
    return { ok: true };
  }
  throw new GolfError("Unknown operation.");
}

export function golfMutation(db: Database.Database, user: GolfUser, input: unknown): MutationResult {
  const body = object(input), id = text(body.mutationId, "Request id", 100), operation = text(body.operation);
  const payload = object(body.payload);
  const fingerprint = createHash("sha256").update(JSON.stringify({ operation, payload })).digest("hex");
  return db.transaction(() => {
    const prior = db.prepare("SELECT fingerprint,result FROM golf_mutations WHERE user_id=? AND id=?").get(user.id, id) as { fingerprint: string; result: string } | undefined;
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new GolfError("This request id has already been used for a different change.", 409);
      return JSON.parse(prior.result) as MutationResult;
    }
    ensureProfile(db, user);
    const result = mutate(db, user, operation, payload);
    db.prepare("INSERT INTO golf_mutations VALUES (?,?,?,?)").run(user.id, id, fingerprint, JSON.stringify(result));
    return result;
  }).immediate();
}
