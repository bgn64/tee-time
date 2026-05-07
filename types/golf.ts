/**
 * Shared golf domain types used by the scoring prototype.
 */

export type Player = {
  id: string;
  name: string;
  color?: string;
};

export type Hole = {
  number: number;
  par: number;
  yardage?: number;
};

export type CourseSource = 'catalog' | 'custom';

export type Course = {
  id: string;
  name: string;
  location: string;
  holes: Hole[];
  source: CourseSource;
};

export type ScoringRule = 'stroke' | 'scramble';

export type RoundScore = {
  // In stroke rounds this is a player id; in scramble rounds it is a team id.
  scorerId: string;
  holeNumber: number;
  strokes: number;
};

export type Team = {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
};

export type Round = {
  id: string;
  course: Course;
  scoringRule: ScoringRule;
  playerIds: string[];
  // Required when scoringRule === 'scramble'; absent in stroke rounds.
  teams?: Team[];
  currentHoleNumber: number;
  scores: RoundScore[];
  startedAt: string;
  completedAt?: string;
};
