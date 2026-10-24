"use client";

import Link from "next/link";
import { useState } from "react";
import { GolfPreview, type VisualDirection } from "../preview";

const directions: { id: VisualDirection; name: string; description: string; colors: string[] }[] = [
  {
    id: "sport",
    name: "Sport",
    description: "Bold sans-serif type, lime accents, high contrast and compact, squared-off layouts.",
    colors: ["#151917", "#d7fa52", "#ffffff"],
  },
  {
    id: "editorial",
    name: "Field Notes",
    description: "Printed-scorecard styling: cream paper, blue ink, red accents, fine rules and serif numerals.",
    colors: ["#253c61", "#f5f0e5", "#ad392f"],
  },
  {
    id: "night",
    name: "Signal",
    description: "A dark, technical direction with cyan highlights, rounded panels and contour-line graphics.",
    colors: ["#111b26", "#6be4d4", "#f0f5f8"],
  },
];

type KeyScreen = "home" | "score";

export function DirectionGallery() {
  const [direction, setDirection] = useState<VisualDirection>("night");
  const [initialScreen, setInitialScreen] = useState<KeyScreen>("home");
  const [activeScreen, setActiveScreen] = useState<string>("home");
  const [revision, setRevision] = useState(0);
  const current = directions.find((item) => item.id === direction)!;

  function showScreen(screen: KeyScreen) {
    setInitialScreen(screen);
    setActiveScreen(screen);
    setRevision((value) => value + 1);
  }

  function showDirection(next: VisualDirection) {
    setDirection(next);
    showScreen(activeScreen === "score" ? "score" : "home");
  }

  return (
    <div className="tt-directions">
      <aside className="tt-direction-controls" aria-label="Design comparison controls">
        <div className="tt-direction-heading">
          <h1>Visual directions</h1>
          <Link href="/preview">Approved preview <span aria-hidden="true">&#8599;</span></Link>
        </div>
        <p className="tt-direction-intro">Same app. Three visual treatments.</p>
        <div className="tt-direction-options" role="group" aria-label="Visual direction">
          {directions.map((item, index) => (
            <button
              key={item.id}
              className={direction === item.id ? "selected" : ""}
              aria-pressed={direction === item.id}
              onClick={() => showDirection(item.id)}
            >
              <span className="tt-direction-number">0{index + 1}</span>
              <strong>{item.name}</strong>
              <span className="tt-direction-palette" aria-hidden="true">
                {item.colors.map((color) => <i key={color} style={{ background: color }} />)}
              </span>
            </button>
          ))}
        </div>
        <p className="tt-direction-description" aria-live="polite">{current.description}</p>
        <div className="tt-direction-screens" role="group" aria-label="Preview screen">
          <button aria-pressed={activeScreen === "home"} onClick={() => showScreen("home")}>Home</button>
          <button aria-pressed={activeScreen === "score"} onClick={() => showScreen("score")}>Hole scoring</button>
        </div>
        <p className="tt-direction-note">Fictional data. Switching previews resets demo edits.</p>
      </aside>
      <section className="tt-direction-stage" aria-label={`${current.name} interactive preview`}>
        <GolfPreview
          key={`${direction}-${revision}`}
          direction={direction}
          initialScreen={initialScreen}
          onNavigate={setActiveScreen}
        />
      </section>
    </div>
  );
}
