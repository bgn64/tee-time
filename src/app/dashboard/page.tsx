import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { golfDb } from "@/lib/golf";
import { golfState } from "@/lib/golf-service.mts";
import { GolfApp } from "./golf-app";
import "@/components/golf.css";
import "@/components/golf-directions.css";
import "./golf.css";

export const metadata: Metadata = { title: "Tee Time", description: "Private golf scoring, rounds and friends.", robots: { index: false, follow: false } };

async function AuthenticatedGolf() {
  const user = await requireUser();
  return <GolfApp initial={golfState(golfDb, user)} />;
}

export default function DashboardPage() {
  return <Suspense fallback={<main className="tt-loading" role="status">Opening Tee Time...</main>}><AuthenticatedGolf /></Suspense>;
}
