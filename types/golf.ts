/**
 * Shared golf domain types used by the scoring prototype.
 */

export type Player = {
  id: string;
  name: string;
  isUser: boolean;
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

export type RoundScore = {
  playerId: string;
  holeNumber: number;
  strokes: number;
};

export type Round = {
  id: string;
  course: Course;
  players: Player[];
  currentHoleNumber: number;
  scores: RoundScore[];
  startedAt: string;
  completedAt?: string;
};
