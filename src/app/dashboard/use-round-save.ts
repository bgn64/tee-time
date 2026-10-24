"use client";

import { useEffect, useRef, useState } from "react";
import { setScore, type HoleDetail, type SavedRound } from "@/lib/golf-model.mts";
import type { MutationResult } from "@/lib/golf-service.mts";
import { ApiError, golfRequest } from "./golf-client";

export type RoundPatch = {
  score?: { scorerId: string; hole: number; value: number | null };
  detail?: { scorerId: string; hole: number; value: HoleDetail };
  currentHole?: number;
  finish?: boolean;
  reopen?: boolean;
  caption?: string;
  visibility?: "private" | "friends";
};
type Job = { patch: RoundPatch; id: string; body?: unknown };

export function useRoundSave(onSaved: (round: SavedRound) => void) {
  const [round, setRound] = useState<SavedRound | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "error" | "conflict">("saved");
  const [error, setError] = useState("");
  const draft = useRef<SavedRound | null>(null);
  const acknowledged = useRef<SavedRound | null>(null);
  const queue = useRef<Job[]>([]);
  const running = useRef(false);
  const savedCallback = useRef(onSaved);
  useEffect(() => { savedCallback.current = onSaved; }, [onSaved]);
  useEffect(() => {
    if (status === "saved") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  function select(value: SavedRound) {
    if (queue.current.length || running.current) throw new Error("Save or reload your pending changes before opening another round.");
    draft.current = acknowledged.current = value;
    setRound(value); setStatus("saved"); setError("");
  }
  async function pump() {
    if (running.current || !queue.current.length || !acknowledged.current) return;
    running.current = true; setStatus("saving"); setError("");
    try {
      while (queue.current.length) {
        const job = queue.current[0];
        job.body ??= { operation: "round", mutationId: job.id, payload: { roundId: acknowledged.current.id, version: acknowledged.current.version, patch: job.patch } };
        const result = await golfRequest<MutationResult>("", job.body);
        if (!result.round) throw new Error("The server did not acknowledge the saved round.");
        acknowledged.current = result.round;
        queue.current.shift();
        savedCallback.current(result.round);
      }
      draft.current = acknowledged.current;
      setRound(acknowledged.current); setStatus("saved");
    } catch (error) {
      setStatus(error instanceof ApiError && error.status === 409 ? "conflict" : "error");
      setError(error instanceof Error ? error.message : "Saving failed. Retry your pending changes.");
    } finally { running.current = false; }
  }
  function patch(change: RoundPatch) {
    if (!draft.current) throw new Error("Open a round first.");
    let next = { ...draft.current };
    if (change.score) next = { ...next, ...setScore(next, change.score.scorerId, change.score.hole, change.score.value) };
    if (change.detail) next.details = { ...next.details, [`${change.detail.scorerId}:${change.detail.hole}`]: change.detail.value };
    if (change.currentHole !== undefined) next.currentHole = change.currentHole;
    if (change.caption !== undefined) next.caption = change.caption;
    if (change.visibility) next.visibility = change.visibility;
    if (change.finish) next.finished = true;
    if (change.reopen) next.finished = false;
    draft.current = next; setRound(next);
    queue.current.push({ patch: change, id: crypto.randomUUID() });
    if (status !== "error" && status !== "conflict") void pump();
  }
  async function reload() {
    if (!acknowledged.current || running.current) throw new Error("Wait for the current save to finish.");
    const saved = await golfRequest<SavedRound>(`?kind=round&id=${encodeURIComponent(acknowledged.current.id)}`);
    queue.current = [];
    acknowledged.current = draft.current = saved;
    setRound(saved); setStatus("saved"); setError(""); savedCallback.current(saved);
    return saved;
  }
  return { round, status, error, select, patch, retry: pump, reload, pending: status !== "saved" };
}
