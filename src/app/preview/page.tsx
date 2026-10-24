import type { Metadata } from "next";
import { GolfPreview } from "./preview";
import "./preview.css";
import "./directions/directions.css";

export const metadata: Metadata = {
  title: "Tee Time | Signal preview",
  description: "An interactive mobile design preview. Fictional golf data; no real scores are saved.",
  robots: { index: false, follow: false },
};

export default function PreviewPage() {
  return <GolfPreview direction="night" />;
}
