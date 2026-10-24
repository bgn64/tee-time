export type Hole = { number: number; par: number | null; yardage: number | null; yardages?: Record<string, number> };
export type Tee = { id: string; name: string; rating?: number; slope?: number };
export type Course = { id: string; name: string; location: string; description: string; holes: Hole[]; tees: string[]; teeSets?: Tee[] };
export type Player = { id: string; name: string; initials: string; color: string };
export type Scorer = Player & { playerIds: string[] };
export type HoleDetail = { putts?: number; fir?: boolean; gir?: boolean; ob?: number; sand?: number; recovery?: boolean; contributors?: string[]; custom?: Record<string, boolean | number> };
export type Round = {
  id: string;
  course: Course;
  format: "stroke" | "scramble";
  players: Player[];
  scorers: Scorer[];
  scores: Record<string, number>;
  details: Record<string, HoleDetail>;
  stats: boolean;
  finished: boolean;
  date: string;
  caption: string;
  expectedHoleNumbers?: number[];
};

export type SavedRound = Round & {
  ownerId: string;
  version: number;
  visibility: "private" | "friends";
  currentHole: number;
  teeSelections: Record<string, string>;
  enabledStatKeys: string[];
  trackedScorerIds: string[];
  customStats: { id: string; label: string; valueType: "binary" | "integer" }[];
  legacyHoleRange?: "front9" | "back9";
};

export type GolfPlayer = Player & { accountId: string | null; deleted?: boolean };
export type GolfUser = { id: string; name: string; email: string; handle?: string };
export type GolfState = {
  user: GolfUser;
  rounds: SavedRound[];
  hasMoreRounds: boolean;
  players: GolfPlayer[];
  friends: { id: string; name: string; handle: string }[];
  requests: { id: string; fromId: string; toId: string; name: string; status: string }[];
  feed: SavedRound[];
  hasMoreFeed: boolean;
  customStats: SavedRound["customStats"];
};

export const scoreKey = (scorerId: string, hole: number) => `${scorerId}:${hole}`;

export function summarize(round: Round, scorerId: string) {
  let strokes = 0;
  let played = 0;
  let knownParHoles = 0;
  let relative = 0;
  for (const hole of round.course.holes) {
    const score = round.scores[scoreKey(scorerId, hole.number)];
    if (score === undefined) continue;
    strokes += score;
    played++;
    if (hole.par !== null) {
      knownParHoles++;
      relative += score - hole.par;
    }
  }
  return { strokes, played, relative: knownParHoles ? relative : null, knownParHoles };
}

export function relativeLabel(value: number | null) {
  return value === null ? "--" : value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
}

export function setScore(round: Round, scorerId: string, holeNumber: number, value: number | null): Round {
  if (round.finished) throw new Error("This round is finished.");
  if (!round.scorers.some((scorer) => scorer.id === scorerId)) throw new Error("Unknown golfer or team.");
  if (!round.course.holes.some((hole) => hole.number === holeNumber)) throw new Error("Unknown hole.");
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > 30)) throw new Error("Enter 1 to 30 strokes.");
  const scores = { ...round.scores };
  if (value === null) delete scores[scoreKey(scorerId, holeNumber)];
  else scores[scoreKey(scorerId, holeNumber)] = value;
  return { ...round, scores };
}

export function finishRound(round: Round): Round {
  if (!round.scorers.some((scorer) => summarize(round, scorer.id).played > 0)) throw new Error("Record at least one score before finishing.");
  return { ...round, finished: true };
}

export function isPartial(round: Round) {
  const expected = scoringHoles(round);
  return round.scorers.some((scorer) => expected.some((hole) => round.scores[scoreKey(scorer.id, hole.number)] === undefined)
    || round.course.holes.some((hole) => !expected.includes(hole) && round.scores[scoreKey(scorer.id, hole.number)] !== undefined));
}

export function scoringHoles(round: Round) {
  const expected = round.expectedHoleNumbers;
  return expected ? round.course.holes.filter((hole) => expected.includes(hole.number)) : round.course.holes;
}

export function recordedStats(round: Round, scorerId: string) {
  const details = round.course.holes
    .filter((hole) => round.scores[scoreKey(scorerId, hole.number)] !== undefined)
    .map((hole) => round.details[scoreKey(scorerId, hole.number)])
    .filter((detail) => detail !== undefined);
  const putts = details.filter((detail) => detail.putts !== undefined);
  const fir = details.filter((detail) => detail.fir !== undefined);
  const gir = details.filter((detail) => detail.gir !== undefined);
  return {
    putts: putts.reduce((sum, detail) => sum + (detail.putts ?? 0), 0),
    puttHoles: putts.length,
    fairways: fir.filter((detail) => detail.fir).length,
    firHoles: fir.length,
    greens: gir.filter((detail) => detail.gir).length,
    girHoles: gir.length,
  };
}
