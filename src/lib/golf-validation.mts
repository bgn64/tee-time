import type { Course, Hole, Tee } from "./golf-model.mts";

export class GolfError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GolfError("Expected an object.");
  return value as Record<string, unknown>;
}
export function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new GolfError("Expected a list.");
  return value;
}
export function text(value: unknown, label = "Value", max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new GolfError(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
export function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new GolfError(`Enter a whole number from ${min} to ${max}.`);
  return value;
}
export function json(value: string | null | undefined): unknown {
  if (value === null || value === undefined) throw new GolfError("Missing source JSON.");
  return JSON.parse(value);
}
export function strings(value: unknown) { return list(value).map((item) => text(item)); }
export function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase(); }
export function holes(value: unknown): Hole[] {
  const parsed = list(value).map((item) => {
    const h = object(item);
    const yardages = h.yardages ? Object.fromEntries(Object.entries(object(h.yardages)).map(([id, yards]) => [id, integer(yards, 1, 1500)])) : undefined;
    return {
      number: integer(h.number, 1, 36),
      par: h.par === null || h.par === undefined ? null : integer(h.par, 1, 9),
      yardage: h.yardage === null || h.yardage === undefined ? null : integer(h.yardage, 1, 1500),
      ...(yardages ? { yardages } : {}),
    };
  });
  if (parsed.length > 36 || new Set(parsed.map((h) => h.number)).size !== parsed.length) throw new GolfError("A course needs unique hole numbers (up to 36 holes).");
  return parsed.sort((a, b) => a.number - b.number);
}
export function courseFrom(value: unknown, id?: string): Course {
  const c = object(value);
  const teeSets: Tee[] = list(c.tees ?? []).map((item) => {
    const tee = object(item);
    return { id: text(tee.id), name: text(tee.name), ...(typeof tee.rating === "number" ? { rating: tee.rating } : {}), ...(typeof tee.slope === "number" ? { slope: tee.slope } : {}) };
  });
  return { id: id ?? text(c.id), name: text(c.name), location: typeof c.location === "string" ? c.location : "", description: "", holes: holes(c.holes ?? []), tees: teeSets.map((tee) => tee.name), teeSets };
}
