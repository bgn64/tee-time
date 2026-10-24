import assert from "node:assert/strict";
import test from "node:test";
import { courses, createRound, historicalRounds, initialRound, players } from "../src/app/preview/fixtures.ts";
import { finishRound, isPartial, recordedStats, relativeLabel, setScore, summarize } from "../src/app/preview/model.mts";

test("scores can start on any hole, and blanks are never counted as zero", () => {
  const empty = createRound(courses[0], players.slice(0, 2), "stroke", true, {});
  assert.deepEqual(summarize(empty, "alex"), { strokes: 0, played: 0, relative: null, knownParHoles: 0 });
  const scored = setScore(empty, "alex", 12, 2);
  assert.deepEqual(summarize(scored, "alex"), { strokes: 2, played: 1, relative: -1, knownParHoles: 1 });
  assert.equal(summarize(scored, "jamie").played, 0);
  assert.equal(isPartial(scored), true);
  assert.equal(summarize(setScore(scored, "alex", 12, null), "alex").played, 0);
  assert.equal(Object.keys(empty.scores).length, 0);
});

test("open scorecards can finish after one recorded score, but not before", () => {
  const empty = createRound(courses[0], players.slice(0, 2), "stroke", false, {});
  assert.throws(() => finishRound(empty), /at least one/);
  const finished = finishRound(setScore(empty, "jamie", 18, 6));
  assert.equal(finished.finished, true);
  assert.equal(isPartial(finished), true);
  assert.equal(summarize(finished, "alex").played, 0);
  assert.throws(() => setScore(finished, "jamie", 1, 4), /finished/);
});

test("invalid scores, scorers, and holes are rejected explicitly", () => {
  const round = initialRound();
  for (const value of [0, -1, 31, 1.5, NaN]) assert.throws(() => setScore(round, "alex", 1, value), /1 to 30/);
  assert.throws(() => setScore(round, "unknown", 1, 4), /Unknown golfer/);
  assert.throws(() => setScore(round, "alex", 99, 4), /Unknown hole/);
});

test("unknown par is not fabricated or used in relative totals", () => {
  const course = { ...courses[0], holes: [{ number: 10, par: null, yardage: null }, { number: 11, par: 4, yardage: null }] };
  let round = createRound(course, players.slice(0, 1), "stroke", false, {});
  round = setScore(round, "alex", 10, 5);
  assert.deepEqual(summarize(round, "alex"), { strokes: 5, played: 1, relative: null, knownParHoles: 0 });
  round = setScore(round, "alex", 11, 4);
  assert.deepEqual(summarize(round, "alex"), { strokes: 9, played: 2, relative: 0, knownParHoles: 1 });
  assert.equal(isPartial(round), false);
});

test("scrambles aggregate team scores, not member scores", () => {
  let round = createRound(courses[0], players, "scramble", true, { alex: "pine", jamie: "pine", morgan: "oak", sam: "oak" });
  assert.equal(round.scorers.length, 2);
  assert.deepEqual(round.scorers[0].playerIds, ["alex", "jamie"]);
  round = setScore(round, "pine", 1, 3);
  assert.equal(summarize(round, "pine").strokes, 3);
  assert.equal(summarize(round, "oak").played, 0);
  assert.throws(() => setScore(round, "alex", 1, 4), /Unknown golfer/);
});

test("stat coverage excludes missing data and unscored holes", () => {
  let round = initialRound();
  assert.deepEqual(recordedStats(round, "alex"), { putts: 5, puttHoles: 3, fairways: 1, firHoles: 2, greens: 2, girHoles: 3 });
  assert.equal(recordedStats(round, "jamie").puttHoles, 0);
  round = setScore(round, "alex", 1, null);
  assert.deepEqual(recordedStats(round, "alex"), { putts: 3, puttHoles: 2, fairways: 0, firHoles: 1, greens: 2, girHoles: 2 });
});

test("history fixtures and score labels are internally consistent", () => {
  const history = historicalRounds();
  assert.ok(history.every((round) => round.finished && !isPartial(round)));
  assert.equal(summarize(history[1], "pine").strokes, 67);
  assert.equal(relativeLabel(-5), "-5");
  assert.equal(relativeLabel(2), "+2");
  assert.equal(relativeLabel(0), "E");
  assert.equal(relativeLabel(null), "--");
});
