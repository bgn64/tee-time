import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { migrateGolf } from "../src/lib/golf-db.mts";
import { decodeCopy, importGolf, parseGolfDump, readGolfDump, type LegacyData } from "../src/lib/golf-import.mts";
import { ensureProfile, golfMutation, golfState, readRound, searchCourses, social, statistics } from "../src/lib/golf-service.mts";
import { isPartial, scoreKey, scoringHoles, summarize, type Course, type GolfUser, type SavedRound } from "../src/lib/golf-model.mts";

const users: GolfUser[] = ["a", "b", "c"].map((id) => ({ id, name: `Golfer ${id}`, email: `${id}@example.test` }));
const course: Course = { id: "course", name: "Test Course", location: "Test", description: "", holes: [{ number: 10, par: 4, yardage: null }, { number: 11, par: null, yardage: null }], tees: [] };
function database(path = ":memory:") {
  const db = new Database(path);
  db.pragma("foreign_keys=ON");
  db.exec("CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL)");
  for (const user of users) db.prepare("INSERT INTO user VALUES (?,?,?)").run(user.id, user.name, user.email);
  migrateGolf(db); migrateGolf(db);
  return db;
}
function fixture() {
  const db = database();
  for (const user of users) ensureProfile(db, user);
  db.prepare("INSERT INTO golf_courses VALUES (?,?,?,NULL,?,?)").run(course.id, course.name, course.location, "test", JSON.stringify(course));
  return db;
}
function mutation(db: Database.Database, user: GolfUser, operation: string, payload: unknown, mutationId = crypto.randomUUID()) {
  return golfMutation(db, user, { operation, payload, mutationId });
}
function start(db: Database.Database, user = users[0], overrides: Record<string, unknown> = {}) {
  const result = mutation(db, user, "createRound", { courseId: course.id, format: "stroke", playerIds: [`account:${user.id}`], teams: [], teeSelections: {}, enabledStatKeys: ["putts", "gir", "fir"], ...overrides });
  assert.ok(result.round);
  return result.round;
}
function patch(db: Database.Database, round: SavedRound, change: unknown, user = users[0], id = crypto.randomUUID()) {
  const result = mutation(db, user, "round", { roundId: round.id, version: round.version, patch: change }, id);
  assert.ok(result.round);
  return result.round;
}
function legacy(): LegacyData {
  const d = parseGolfDump("");
  d.profiles = [{ user_id: "old-a", display_name: "Golfer a", handle: "golfer-a" }];
  d.courses = [{ id: course.id, name: course.name, city: "Test", state: null, country: null, holes: JSON.stringify(course.holes), tees: "[]", source: "test", owner_user_id: null }];
  d.roster_players = [{ owner_user_id: "old-a", id: "user", nickname: "You", color: "", linked_user_id: "old-a" }];
  d.scorecards = [{ id: "old-round", owner_user_id: "old-a", course_snapshot: JSON.stringify(course), scoring_rule: "stroke", player_ids: '["user:old-a"]', teams: "[]", scores: '[{"scorerId":"user","holeNumber":10,"strokes":4},{"scorerId":"user","holeNumber":11,"strokes":5}]', participants: "[]", enabled_stat_keys: "[]", tracked_scorer_ids: "[]", custom_stat_definitions: "[]", completed_at: "2026-01-01", started_at: "2026-01-01", current_hole_number: "11", caption: "", course_id: course.id }];
  d.scorecard_scores = [{ id: "s", scorecard_id: "old-round", owner_user_id: "old-a", scorer_id: "user:old-a", hole_number: "10", strokes: "4" }];
  return d;
}

test("COPY parser allowlists golf tables, handles empty sections, nulls and escaping", () => {
  const d = parseGolfDump("COPY auth.users (email) FROM stdin;\nsecret@example.test\n\\.\nCOPY public.course_tee_sets (id) FROM stdin;\n\\.\nCOPY public.profiles (user_id, display_name, handle) FROM stdin;\nx\tA\\tB\\nC\\\\D\t\\N\n\\.\n");
  assert.equal(d.course_tee_sets.length, 0);
  assert.equal(d.profiles[0].display_name, "A\tB\nC\\D");
  assert.equal(d.profiles[0].handle, null);
  assert.equal("users" in d, false);
  assert.equal(decodeCopy("\\\\N"), "\\N");
  assert.equal(decodeCopy("\\101\\x42"), "AB");
  assert.throws(() => parseGolfDump("COPY public.profiles (id, name) FROM stdin;\nx\n\\.\n"), /Malformed/);
  assert.throws(() => parseGolfDump("COPY public.profiles (id) FROM stdin;\nx\n"), /Unterminated/);
});

test("safe import reconciles owner aliases, merges JSON-only scores and is idempotent", (t) => {
  const db = database(); t.after(() => db.close());
  const d = legacy(), mapping = { "old-a": users[0].email };
  const report = importGolf(db, d, mapping, true);
  assert.deepEqual(report.scores, { normalized: 1, jsonOnly: 1, overlap: 1, canonical: 2 });
  assert.equal((db.prepare("SELECT count(*) AS n FROM golf_rounds").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT count(*) AS n FROM golf_legacy").get() as { n: number }).n, 0);
  importGolf(db, d, mapping);
  const round = readRound(db, "a", "old-round");
  assert.equal(summarize(round, "account:a").strokes, 9);
  assert.deepEqual(round.course.holes.map((h) => h.number), [10, 11]);
  assert.equal(importGolf(db, d, mapping).alreadyImported, true);
  patch(db, round, { caption: "Edited after import" });
  importGolf(db, d, mapping);
  assert.equal(readRound(db, "a", "old-round").caption, "Edited after import");
  assert.throws(() => importGolf(db, d, { "old-a": users[1].email }), /different ownership/);
});

test("conflicting scores, unresolved mappings and orphan records roll back the whole import", (t) => {
  const db = database(); t.after(() => db.close());
  const d = legacy();
  assert.throws(() => importGolf(db, d, {}), /mapping/);
  assert.throws(() => importGolf(db, d, { "old-a": "missing@example.test" }), /Create the local account/);
  d.scorecard_scores[0].strokes = "8";
  assert.throws(() => importGolf(db, d, { "old-a": users[0].email }), /Conflicting/);
  assert.equal((db.prepare("SELECT count(*) AS n FROM golf_profiles").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT count(*) AS n FROM golf_courses").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT count(*) AS n FROM golf_imports").get() as { n: number }).n, 0);
  d.scorecard_scores[0].strokes = "4";
  d.scorecard_scores.push({ ...d.scorecard_scores[0], id: "orphan", scorecard_id: "missing" });
  assert.throws(() => importGolf(db, d, { "old-a": users[0].email }), /Orphaned/);
  assert.equal((db.prepare("SELECT count(*) AS n FROM golf_rounds").get() as { n: number }).n, 0);
});

test("score writes reject stale versions, replay identical retries and preserve nonsequential blanks", (t) => {
  const db = fixture(); t.after(() => db.close());
  let r = start(db);
  assert.throws(() => patch(db, r, { finish: true }), /Record at least/);
  const old = r, id = crypto.randomUUID(), change = { score: { scorerId: "account:a", hole: 11, value: 5 } };
  r = patch(db, old, change, users[0], id);
  assert.equal(summarize(r, "account:a").played, 1);
  assert.equal(summarize(r, "account:a").relative, null);
  assert.deepEqual(patch(db, old, change, users[0], id), r);
  assert.throws(() => patch(db, old, { caption: "stale" }), /another device/);
  assert.throws(() => patch(db, old, { caption: "different request" }, users[0], id), /different change/);
  r = patch(db, r, { score: { scorerId: "account:a", hole: 10, value: 4 }, detail: { scorerId: "account:a", hole: 10, value: { putts: 2, gir: false } } });
  assert.equal(summarize(r, "account:a").strokes, 9);
  assert.equal(r.details[scoreKey("account:a", 10)].putts, 2);
  r = patch(db, r, { score: { scorerId: "account:a", hole: 10, value: null } });
  r = patch(db, r, { finish: true });
  assert.equal(r.finished, true);
  assert.equal(summarize(r, "account:a").played, 1);
  assert.throws(() => patch(db, r, { score: { scorerId: "account:a", hole: 10, value: 4 } }), /Reopen/);
  assert.equal(patch(db, r, { reopen: true }).finished, false);
});

test("authorization follows current friendships, visibility, round ownership and guest ownership", (t) => {
  const db = fixture(); t.after(() => db.close());
  let r = start(db);
  assert.throws(() => readRound(db, "b", r.id), /permission/);
  assert.throws(() => patch(db, r, { caption: "hijack" }, users[1]), /permission/);
  assert.throws(() => social(db, "b", r.id), /permission/);
  const guest = mutation(db, users[1], "guest", { name: "Private guest" }).player!;
  assert.throws(() => start(db, users[2], { playerIds: [guest.id] }), /roster/);
  db.prepare("UPDATE golf_profiles SET handle='LegacyHandle' WHERE user_id='b'").run();
  assert.throws(() => mutation(db, users[0], "profile", { name: "Golfer a", handle: "legacyhandle" }), /taken/);
  const handle = golfState(db, users[1]).user.handle;
  const request = mutation(db, users[0], "friendRequest", { handle });
  mutation(db, users[1], "answerRequest", { id: request.requestId, answer: "accepted" });
  assert.throws(() => readRound(db, "b", r.id), /permission/);
  r = patch(db, r, { visibility: "friends" });
  assert.equal(readRound(db, "b", r.id).id, r.id);
  assert.throws(() => patch(db, r, { caption: "friend edit" }, users[1]), /permission/);
  mutation(db, users[1], "comment", { roundId: r.id, body: "Good round" });
  mutation(db, users[1], "like", { roundId: r.id, liked: true });
  assert.equal(social(db, "a", r.id).comments.length, 1);
  const comment = social(db, "a", r.id).comments[0];
  assert.throws(() => mutation(db, users[2], "deleteComment", { roundId: r.id, id: comment.id }), /permission/);
  mutation(db, users[0], "deleteComment", { roundId: r.id, id: comment.id });
  assert.equal(social(db, "a", r.id).comments.length, 0);
  for (let i = 0; i < 35; i++) {
    mutation(db, users[1], "comment", { roundId: r.id, body: `History ${i}` });
    db.prepare("UPDATE golf_comments SET created_at=? WHERE round_id=? AND body=?").run(new Date(Date.UTC(2020, 0, i + 1)).toISOString(), r.id, `History ${i}`);
  }
  const firstPage = social(db, "a", r.id), secondPage = social(db, "a", r.id, 30);
  assert.equal(firstPage.comments[0].body, "History 34");
  assert.equal(firstPage.hasMore, true);
  assert.equal(secondPage.comments.length, 5);
  assert.equal(secondPage.hasMore, false);
  assert.equal(new Set([...firstPage.comments, ...secondPage.comments].map((c) => c.id)).size, 35);
  mutation(db, users[1], "comment", { roundId: r.id, body: "Newest comment" });
  assert.equal(social(db, "a", r.id).comments[0].body, "Newest comment");
  mutation(db, users[0], "removeFriend", { id: "b" });
  assert.throws(() => readRound(db, "b", r.id), /permission/);
  assert.throws(() => mutation(db, users[1], "comment", { roundId: r.id, body: "No longer allowed" }), /permission/);
});

test("scrambles preserve per-shot contributor order, duplicates and unassigned strokes", (t) => {
  const db = fixture(); t.after(() => db.close());
  const guest = mutation(db, users[0], "guest", { name: "Guest" }).player!;
  let r = start(db, users[0], { format: "scramble", playerIds: ["account:a", guest.id], teams: [{ name: "Team One", playerIds: ["account:a", guest.id] }] });
  const scorerId = r.scorers[0].id;
  r = patch(db, r, { score: { scorerId, hole: 10, value: 4 }, detail: { scorerId, hole: 10, value: { contributors: ["account:a", "", guest.id, guest.id] } } });
  assert.deepEqual(r.details[scoreKey(scorerId, 10)].contributors, ["account:a", "", guest.id, guest.id]);
  assert.throws(() => patch(db, r, { detail: { scorerId, hole: 10, value: { contributors: ["account:b"] } } }), /this team/);
  assert.equal(summarize(r, scorerId).strokes, 4);
  assert.equal(summarize(r, "account:a").played, 0);
});

test("stats expose coverage and separate partial, full and scramble rounds", (t) => {
  const db = fixture(); t.after(() => db.close());
  let r = start(db);
  r = patch(db, r, { score: { scorerId: "account:a", hole: 10, value: 4 }, detail: { scorerId: "account:a", hole: 10, value: { putts: 2, gir: true } }, finish: true });
  let stats = statistics(db, "a");
  assert.equal(stats.partial, 1); assert.equal(stats.complete, 0); assert.equal(stats.puttHoles, 1); assert.equal(stats.girHoles, 1); assert.equal(stats.firHoles, 0);
  r = patch(db, r, { reopen: true });
  patch(db, r, { score: { scorerId: "account:a", hole: 11, value: 5 }, finish: true });
  stats = statistics(db, "a");
  assert.deepEqual(stats.lengths[2], { rounds: 1, strokes: 9, best: 9 });
  const scramble = start(db, users[0], { format: "scramble", teams: [{ name: "Team", playerIds: ["account:a"] }] });
  patch(db, scramble, { score: { scorerId: scramble.scorers[0].id, hole: 10, value: 3 }, finish: true });
  assert.equal(statistics(db, "a").rounds, 1);
});

test("custom stat snapshots, personal course copies and incomplete courses are validated", (t) => {
  const db = fixture(); t.after(() => db.close());
  mutation(db, users[0], "statDefinition", { label: "Recovery count", valueType: "integer" });
  const stat = golfState(db, users[0]).customStats[0];
  mutation(db, users[0], "statDefinition", { label: "Penalty", valueType: "binary" });
  const binary = golfState(db, users[0]).customStats.find((s) => s.valueType === "binary")!;
  let r = start(db, users[0], { enabledStatKeys: [stat.id, binary.id] });
  r = patch(db, r, { score: { scorerId: "account:a", hole: 10, value: 4 }, detail: { scorerId: "account:a", hole: 10, value: { custom: { [stat.id]: 999, [binary.id]: false } } } });
  assert.equal(r.details[scoreKey("account:a", 10)].custom?.[stat.id], 999);
  assert.equal(r.details[scoreKey("account:a", 10)].custom?.[binary.id], false);
  r = patch(db, r, { detail: { scorerId: "account:a", hole: 10, value: { custom: { [stat.id]: 0, [binary.id]: false } } } });
  assert.equal(r.details[scoreKey("account:a", 10)].custom?.[stat.id], 0);
  mutation(db, users[0], "statDefinition", { id: stat.id, deleted: true });
  assert.equal(readRound(db, "a", r.id).customStats[0].label, "Recovery count");
  assert.throws(() => patch(db, r, { detail: { scorerId: "account:a", hole: 10, value: { custom: { [stat.id]: -1 } } } }), /whole number/);
  const copied = mutation(db, users[0], "course", { course: { ...course, holes: [{ number: 10, par: 5, yardage: null }] } }).course!;
  assert.notEqual(copied.id, course.id);
  assert.equal(readRound(db, "a", r.id).course.holes[0].par, 4);
  assert.ok(searchCourses(db, "a", "Test").courses.some((c) => c.id === copied.id));
  assert.ok(!searchCourses(db, "b", "Test").courses.some((c) => c.id === copied.id));
  assert.throws(() => mutation(db, users[0], "course", { course: { ...course, holes: [] } }), /at least one hole/);
});

test("real backup reconciliation, raw preservation, idempotency and reopened-file persistence", { skip: !existsSync("db_cluster-12-10-2026@23-14-40.backup.gz") }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tee-time-golf-")), path = join(dir, "import.sqlite");
  let db = database(path);
  t.after(() => { if (db.open) db.close(); rmSync(dir, { recursive: true }); });
  const d = readGolfDump("db_cluster-12-10-2026@23-14-40.backup.gz");
  const mapping = Object.fromEntries(d.profiles.map((p, i) => [p.user_id!, users[i].email]));
  const report = importGolf(db, d, mapping);
  assert.equal(d.scorecards.length, 27); assert.equal(d.courses.length, 14023);
  assert.deepEqual(report.scores, { normalized: 425, jsonOnly: 0, overlap: 153, canonical: 425 });
  assert.equal((db.prepare("SELECT count(*) AS n FROM golf_legacy").get() as { n: number }).n, Object.values(d).reduce((sum, rows) => sum + rows.length, 0));
  const rounds = db.prepare("SELECT document FROM golf_rounds").all() as { document: string }[];
  assert.equal(rounds.length, 27);
  const converted = rounds.map((row) => JSON.parse(row.document) as SavedRound);
  const legacyNine = converted.find((r) => r.legacyHoleRange === "front9");
  assert.ok(legacyNine);
  assert.equal(legacyNine.course.holes.length, 18);
  assert.equal(scoringHoles(legacyNine).length, 9);
  assert.equal(isPartial(legacyNine), false);
  const owner = users.find((u) => u.id === legacyNine.ownerId);
  assert.ok(owner);
  const reopened = patch(db, legacyNine, { reopen: true }, owner);
  assert.equal(reopened.expectedHoleNumbers, undefined);
  assert.equal(scoringHoles(reopened).length, 18);
  assert.equal(reopened.legacyHoleRange, "front9");
  assert.equal(isPartial(reopened), true);
  assert.equal(converted.reduce((n, r) => n + Object.values(r.details).filter((v) => v.contributors !== undefined).length, 0), 19);
  assert.equal(converted.flatMap((r) => Object.values(r.details).flatMap((d) => d.contributors ?? [])).filter((v) => v === "").length, 2);
  assert.equal(importGolf(db, d, mapping).alreadyImported, true);
  db.close(); db = new Database(path); db.pragma("foreign_keys=ON");
  assert.equal((db.prepare("SELECT count(*) AS n FROM golf_rounds").get() as { n: number }).n, 27);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});
