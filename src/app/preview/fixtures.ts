import type { Course, Player, Round } from "./model.mts";
import { scoreKey } from "./model.mts";

export const players: Player[] = [
  { id: "alex", name: "Alex", initials: "AL", color: "pine" },
  { id: "jamie", name: "Jamie", initials: "JM", color: "clay" },
  { id: "morgan", name: "Morgan", initials: "MO", color: "gold" },
  { id: "sam", name: "Sam", initials: "SK", color: "slate" },
];

const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];
const yardages = [365, 402, 165, 510, 380, 425, 172, 525, 390, 410, 535, 155, 375, 405, 520, 180, 395, 420];
export const courses: Course[] = [
  { id: "cedar", name: "Cedar Valley", location: "Bend, Oregon", description: "Quiet fairways. Tall pines. A little room to find your game.", holes: pars.map((par, i) => ({ number: i + 1, par, yardage: yardages[i] })), tees: ["White", "Blue", "Gold"] },
  { id: "willow", name: "Willow Creek", location: "Portland, Oregon", description: "A gentle walk through rolling greens and creek-side fairways.", holes: pars.map((par, i) => ({ number: i + 1, par, yardage: yardages[i] - 20 })), tees: ["White", "Blue"] },
  { id: "juniper", name: "Juniper Hills", location: "Redmond, Oregon", description: "A nine-hole escape with wide skies and a welcoming first tee.", holes: pars.slice(0, 9).map((par, i) => ({ number: i + 1, par, yardage: yardages[i] })), tees: ["White"] },
  { id: "meadow", name: "Meadow Park", location: "Salem, Oregon", description: "A catalog listing waiting for its first scorecard. Add verified hole details before playing.", holes: [], tees: [] },
];

export function createRound(course: Course, selected: Player[], format: Round["format"], stats: boolean, teamAssignments: Record<string, string>): Round {
  const scorers = format === "stroke"
    ? selected.map((player) => ({ ...player, playerIds: [player.id] }))
    : ["pine", "oak"].flatMap((team) => {
      const members = selected.filter((player) => (teamAssignments[player.id] ?? "pine") === team);
      return members.length ? [{ id: team, name: team === "pine" ? "Team Pine" : "Team Oak", initials: team === "pine" ? "TP" : "TO", color: team === "pine" ? "pine" : "clay", playerIds: members.map((player) => player.id) }] : [];
    });
  return { id: "demo-new", course, players: selected, scorers, format, scores: {}, details: {}, stats, finished: false, date: "Today", caption: "" };
}

export function initialRound(): Round {
  const round = createRound(courses[0], players.slice(0, 2), "stroke", true, {});
  const alex = [5, 4, 3, 5, 5, 4];
  const jamie = [4, 5, 4, 6, 4, 5];
  alex.forEach((score, i) => { round.scores[scoreKey("alex", i + 1)] = score; });
  jamie.forEach((score, i) => { round.scores[scoreKey("jamie", i + 1)] = score; });
  round.details["alex:1"] = { putts: 2, fir: true, gir: false };
  round.details["alex:2"] = { putts: 2, fir: false, gir: true };
  round.details["alex:3"] = { putts: 1, gir: true };
  return { ...round, id: "demo-active" };
}

export function historicalRounds(): Round[] {
  return [0, 1, 2].map((index) => {
    const round = createRound(courses[index], index === 1 ? players : players.slice(0, 2), index === 1 ? "scramble" : "stroke", true, {});
    round.scorers.forEach((scorer, scorerIndex) => {
      round.course.holes.forEach((hole, i) => {
        round.scores[scoreKey(scorer.id, hole.number)] = (hole.par ?? 4) + (index === 1 ? (i % 4 === 0 ? -1 : 0) : (i % 3 === 0 ? 1 : 0) + (scorerIndex && i % 5 === 0 ? 1 : 0));
        round.details[scoreKey(scorer.id, hole.number)] = { putts: i % 4 === 0 ? 1 : 2, gir: i % 3 !== 0, ...(hole.par === 3 ? {} : { fir: i % 2 === 0 }) };
      });
    });
    return { ...round, id: `demo-history-${index}`, finished: true, date: ["Oct 18, 2026", "Oct 11, 2026", "Oct 4, 2026"][index], caption: ["One of those days you wish had a few more holes.", "Good company. A few good bounces.", "Nine holes before the rest of the day."][index] };
  });
}
