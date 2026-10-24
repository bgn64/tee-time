import type { Metadata } from "next";
import { DirectionGallery } from "./directions";
import "../preview.css";
import "./directions.css";

export const metadata: Metadata = {
  title: "Tee Time | Visual directions",
  description: "Compare three mobile visual directions on the same Home and scoring screens. Fictional demo data only.",
  robots: { index: false, follow: false },
};

export default function DirectionsPage() {
  return <DirectionGallery />;
}
