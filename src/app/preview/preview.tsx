"use client";

import { useEffect, useRef, useState } from "react";
import { courses, createRound, historicalRounds, initialRound, players as initialPlayers } from "./fixtures";
import { finishRound, isPartial, recordedStats, relativeLabel, scoreKey, setScore, summarize, type Course, type HoleDetail, type Round } from "./model.mts";
import { Avatar, CourseArt, Icon, Modal } from "@/components/golf-ui";

type Screen = "home" | "rounds" | "courses" | "friends" | "setup" | "score" | "card" | "course" | "stats";
export type VisualDirection = "sport" | "editorial" | "night";
type Sheet = "about" | "profile" | "finish" | "guest" | "comments" | null;
type SaveState = "saved" | "saving" | "error" | "conflict";

function counted(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function RoundRow({ round, open }: { round: Round; open: () => void }) {
  const total = summarize(round, round.scorers[0].id);
  return <button className="tt-round-row" onClick={open}>
    <CourseArt className={`tt-round-thumb ${round.course.id}`} />
    <span className="tt-row-body"><strong>{round.course.name}</strong><span>{round.date} <span aria-hidden="true">&middot;</span> {round.format === "stroke" ? "Stroke play" : "Scramble"}</span><span className="tt-row-caption">{isPartial(round) ? "Partial round" : counted(round.course.holes.length, "hole")} <span aria-hidden="true">&middot;</span> {counted(round.players.length, "golfer")}</span></span>
    <span className="tt-round-total"><strong>{total.played ? total.strokes : "--"}</strong><span>{relativeLabel(total.relative)}</span></span>
  </button>;
}

export function GolfPreview({ direction, initialScreen = "home", onNavigate }: {
  direction?: VisualDirection;
  initialScreen?: "home" | "score";
  onNavigate?: (screen: Screen) => void;
}) {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [round, setRound] = useState(initialRound);
  const [history, setHistory] = useState(historicalRounds);
  const [viewRound, setViewRound] = useState<Round | null>(null);
  const [holeNumber, setHoleNumber] = useState(7);
  const [roster, setRoster] = useState(initialPlayers);
  const [courseList, setCourseList] = useState(courses);
  const [selectedCourse, setSelectedCourse] = useState(courses[0]);
  const [format, setFormat] = useState<Round["format"]>("stroke");
  const [selectedPlayers, setSelectedPlayers] = useState(["alex", "jamie"]);
  const [teamAssignments, setTeamAssignments] = useState<Record<string, string>>({ alex: "pine", jamie: "pine", morgan: "oak", sam: "oak" });
  const [tee, setTee] = useState("White");
  const [trackStats, setTrackStats] = useState(true);
  const [courseQuery, setCourseQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [friendTab, setFriendTab] = useState("activity");
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState(["Jamie: That birdie on 12. Worth the walk."]);
  const [comment, setComment] = useState("");
  const [guestName, setGuestName] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [request, setRequest] = useState<"pending" | "accepted" | "declined">("pending");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveMode, setSaveMode] = useState<"normal" | "error" | "conflict">("normal");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const activeRound = viewRound ?? round;
  const hole = round.course.holes.find((item) => item.number === holeNumber) ?? round.course.holes[0];
  const total = summarize(round, round.scorers[0].id);
  const activeNavigation = ["card", "score", "stats"].includes(screen) ? "rounds" : screen === "course" ? "courses" : screen === "setup" ? "home" : screen;
  const filteredCourses = courseList.filter((course) => `${course.name} ${course.location}`.toLowerCase().includes(courseQuery.toLowerCase()));
  const navItems: { screen: Screen; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
    { screen: "home", label: "Home", icon: "home" },
    { screen: "rounds", label: "Rounds", icon: "flag" },
    { screen: "courses", label: "Courses", icon: "courses" },
    { screen: "friends", label: "Friends", icon: "friends" },
  ];

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  function go(next: Screen) {
    setError("");
    setScreen(next);
    onNavigate?.(next);
    requestAnimationFrame(() => { contentRef.current?.scrollTo({ top: 0 }); headingRef.current?.focus(); });
  }

  function simulateSave(mode = saveMode) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(() => setSaveState(mode === "normal" ? "saved" : mode), 500);
  }

  function changeScore(scorerId: string, value: number | null) {
    try {
      setRound(setScore(round, scorerId, holeNumber, value));
      setError("");
      simulateSave();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this demo score.");
    }
  }

  function changeDetail(scorerId: string, update: Partial<HoleDetail>) {
    const key = scoreKey(scorerId, holeNumber);
    setRound({ ...round, details: { ...round.details, [key]: { ...round.details[key], ...update } } });
    simulateSave();
  }

  function openRound(item: Round) {
    setViewRound(item);
    go("card");
  }

  function startRound() {
    if (!selectedCourse.holes.length) { setError("Add course holes before starting a round."); return; }
    if (!selectedPlayers.length) { setError("Select at least one golfer."); return; }
    if (!round.finished && !window.confirm("Replace the active demo round? This only resets fictional preview data.")) return;
    const next = createRound(selectedCourse, roster.filter((player) => selectedPlayers.includes(player.id)), format, trackStats, teamAssignments);
    setRound({ ...next, id: `demo-new-${history.length}` });
    setHoleNumber(next.course.holes[0].number);
    setViewRound(null);
    setSaveMode("normal");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saved");
    go("score");
  }

  function completeRound() {
    try {
      const finished = finishRound(round);
      setRound(finished);
      setHistory((items) => [finished, ...items.filter((item) => item.id !== finished.id)]);
      setViewRound(finished);
      setSheet(null);
      go("card");
      setNotice("Round finished.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to finish this demo round.");
    }
  }

  function selectCourse(course: Course) {
    setSelectedCourse(course);
    setTee(course.tees[0] ?? "");
    go("course");
  }

  function title(heading: string, description?: string) {
    return <div className="tt-page-heading"><h1 ref={headingRef} tabIndex={-1}>{heading}</h1>{description && <p>{description}</p>}</div>;
  }

  function activity() {
    return <article className="tt-activity">
      <div className="tt-activity-heading"><Avatar player={roster[1]} small /><div><strong>Jamie Miller</strong><p>Sunday at 10:42 AM <span aria-hidden="true">&middot;</span> Friends</p></div><span className="tt-pill">SCRAMBLE</span></div>
      <button className="tt-feed-round" onClick={() => openRound(history.find((item) => item.format === "scramble") ?? history[0])}><CourseArt description={direction === "night" ? "Abstract golf-course contour lines" : undefined} /><span><strong>Willow Creek</strong><span>Team Pine <span aria-hidden="true">&middot;</span> 18 holes</span></span><span className="tt-feed-score">67<small>-5</small></span></button>
      <div className="tt-social"><button aria-pressed={liked} onClick={() => setLiked(!liked)}><Icon name="heart" size={19} />{liked ? "3" : "2"} <span className="tt-sr-only">likes</span></button><button onClick={() => setSheet("comments")}><Icon name="comment" size={19} />{comments.length} <span className="tt-sr-only">comments</span></button></div>
    </article>;
  }

  return <div className={`tt-preview${direction ? ` tt-visual tt-design-${direction}` : ""}`}>
    <div className="tt-app">
      <div className="tt-demo-banner"><span><span className="tt-live-dot" /> INTERACTIVE DESIGN PREVIEW</span><button onClick={() => setSheet("about")}>About this demo <span aria-hidden="true">&#8599;</span></button></div>
      <header className="tt-header"><button className="tt-wordmark" onClick={() => go("home")} aria-label="Tee Time home"><span className="tt-brand-icon"><Icon name="flag" size={20} /></span>tee time<span className="tt-brand-period">.</span></button><button className="tt-profile-button" onClick={() => setSheet("profile")} aria-label="Open Alex's profile and demo settings"><Avatar player={roster[0]} small /></button></header>
      <main ref={contentRef} className="tt-content">
        {screen === "home" && <>
          {title("Home")}
          <section className="tt-hero">
            <CourseArt description={direction === "night" ? "Abstract golf-course contour lines" : undefined} />
            <div className="tt-hero-copy"><button className="tt-button tt-button-cream" onClick={() => go("setup")}>Start a round <Icon name="arrow" size={19} /></button></div>
          </section>
          {!round.finished && <button className="tt-resume" onClick={() => { setViewRound(null); go("score"); }}><span className="tt-resume-icon"><Icon name="flag" /></span><span><span className="tt-eyebrow"><span className="tt-live-dot" /> ROUND IN PROGRESS</span><strong>{round.course.name}</strong><span>Hole {holeNumber} <span aria-hidden="true">&middot;</span> {round.players.length} golfers <span aria-hidden="true">&middot;</span> {total.strokes || "--"} strokes</span></span><Icon name="arrow" /></button>}
          <div className="tt-section-heading"><h2>Recent rounds</h2><button className="tt-text-button" onClick={() => go("rounds")}>All rounds <Icon name="arrow" size={16} /></button></div>
          <div className="tt-round-list">{history.slice(0, 2).map((item) => <RoundRow key={item.id} round={item} open={() => openRound(item)} />)}</div>
          <button className="tt-season" onClick={() => go("stats")}><span className="tt-season-icon"><Icon name="stats" /></span><span><strong>Your stats</strong><span>Scores, putts, fairways and greens</span></span><Icon name="arrow" size={19} /></button>
          <div className="tt-section-heading"><h2>Friends activity</h2><button className="tt-text-button" onClick={() => go("friends")}>Friends <Icon name="arrow" size={16} /></button></div>
          {activity()}
        </>}

        {screen === "setup" && <>
          <button className="tt-back" onClick={() => go("home")}><Icon name="back" size={18} /> Home</button>
          {title("Start a round")}
          <div className="tt-field"><label htmlFor="tt-course">Where are we playing?</label><select id="tt-course" value={selectedCourse.id} onChange={(event) => { const course = courseList.find((item) => item.id === event.target.value)!; setSelectedCourse(course); setTee(course.tees[0] ?? ""); }}>{courseList.map((course) => <option key={course.id} value={course.id}>{course.name}{course.holes.length ? "" : " (needs setup)"}</option>)}</select></div>
          {!selectedCourse.holes.length && <div className="tt-callout"><strong>This course needs a scorecard.</strong><p>Hole details aren&apos;t available yet. Add a verified hole list before playing.</p><button className="tt-text-button" onClick={() => go("course")}>Set up course <Icon name="arrow" size={16} /></button></div>}
          <fieldset className="tt-field"><legend>Scoring format</legend><div className="tt-format-options">{(["stroke", "scramble"] as const).map((value) => <button key={value} className={format === value ? "selected" : ""} aria-pressed={format === value} onClick={() => setFormat(value)}><Icon name={value === "stroke" ? "flag" : "friends"} /><strong>{value === "stroke" ? "Stroke play" : "Scramble"}</strong><span>{value === "stroke" ? "Individual scores" : "Team scores"}</span>{format === value && <span className="tt-selection-check"><Icon name="check" size={12} /></span>}</button>)}</div></fieldset>
          <div className="tt-section-heading"><h2>Players</h2><button className="tt-text-button" onClick={() => setSheet("guest")}><Icon name="plus" size={16} /> Add guest</button></div>
          <div className="tt-player-options">{roster.map((player) => <div className="tt-player-option" key={player.id}><label><input type="checkbox" checked={selectedPlayers.includes(player.id)} onChange={(event) => setSelectedPlayers(event.target.checked ? [...selectedPlayers, player.id] : selectedPlayers.filter((id) => id !== player.id))} /><Avatar player={player} small /><span>{player.name}{player.id === "alex" && <small> (you)</small>}</span></label>{format === "scramble" && selectedPlayers.includes(player.id) && <select aria-label={`Team for ${player.name}`} value={teamAssignments[player.id] ?? "pine"} onChange={(event) => setTeamAssignments({ ...teamAssignments, [player.id]: event.target.value })}><option value="pine">Team Pine</option><option value="oak">Team Oak</option></select>}</div>)}</div>
          {selectedCourse.tees.length > 0 && <div className="tt-field"><label htmlFor="tt-tee">Playing tees</label><select id="tt-tee" value={tee} onChange={(event) => setTee(event.target.value)}>{selectedCourse.tees.map((name) => <option key={name}>{name}</option>)}</select><span className="tt-help">Preview yardages use the course&apos;s reference tees.</span></div>}
          <label className="tt-toggle-row"><span><strong>Track hole stats</strong><span>Putts, fairways, greens and penalties</span></span><input type="checkbox" role="switch" checked={trackStats} onChange={(event) => setTrackStats(event.target.checked)} /></label>
          <div className="tt-callout subtle"><Icon name="courses" /><p>Score holes in any order and finish at any time.</p></div>
          <button className="tt-button" onClick={startRound}>Start scoring <Icon name="arrow" size={19} /></button>
        </>}

        {screen === "score" && <>
          <div className="tt-score-top"><button className="tt-back" onClick={() => go("home")}><Icon name="back" size={18} /> Home</button><button className="tt-text-button" onClick={() => { setViewRound(null); go("card"); }}>Scorecard <Icon name="courses" size={17} /></button></div>
          <div className="tt-score-course"><p className="tt-eyebrow">{round.format === "stroke" ? "STROKE PLAY" : "TEAM SCRAMBLE"}</p><h1 ref={headingRef} tabIndex={-1}>{round.course.name}</h1><p>{round.course.location}</p></div>
          <section className="tt-hole-hero"><div><p className="tt-eyebrow">ON THE COURSE</p><h2><span>Hole</span> {holeNumber.toString().padStart(2, "0")}</h2></div><div className="tt-hole-facts"><span><strong>{hole.par ?? "--"}</strong>PAR</span><span><strong>{hole.yardage ?? "--"}</strong>YARDS</span></div><span className="tt-hole-lines" aria-hidden="true" /></section>
          <div className="tt-hole-strip" aria-label="Jump to hole">{round.course.holes.map((item) => <button key={item.number} aria-label={`Hole ${item.number}${round.scores[scoreKey(round.scorers[0].id, item.number)] !== undefined ? ", scored" : ""}`} aria-current={item.number === holeNumber ? "step" : undefined} className={`${item.number === holeNumber ? "current" : ""} ${round.scores[scoreKey(round.scorers[0].id, item.number)] !== undefined ? "scored" : ""}`} onClick={() => { setHoleNumber(item.number); setError(""); }}>{item.number}</button>)}</div>
          <div className="tt-section-heading tt-scoring-label"><h2>Scores</h2><span className={`tt-save-status ${saveState}`} role="status">{saveState === "saved" ? <><Icon name="check" size={14} /> Demo saved</> : saveState === "saving" ? "Saving demo..." : "Not saved"}</span></div>
          {(saveState === "error" || saveState === "conflict") && <div className="tt-callout error" role="alert"><strong>{saveState === "error" ? "Connection lost. Your edits are still here." : "This round changed on another device."}</strong><p>{saveState === "error" ? "Simulated error: retry before leaving this page." : "Simulated conflict: review the current scorecard before retrying. No real data was changed."}</p><button className="tt-text-button" onClick={() => { setSaveMode("normal"); simulateSave("normal"); }}>{saveState === "error" ? "Retry demo save" : "Keep demo edits & retry"}</button></div>}
          {round.scorers.map((scorer) => {
            const score = round.scores[scoreKey(scorer.id, holeNumber)];
            const summary = summarize(round, scorer.id);
            const detail = round.details[scoreKey(scorer.id, holeNumber)] ?? {};
            return <section className="tt-scorer" key={scorer.id}>
              <div className="tt-scorer-heading"><Avatar player={scorer} small /><span><strong>{scorer.name}{scorer.id === "alex" && <small> (you)</small>}</strong><span>{summary.strokes || "--"} strokes <span aria-hidden="true">&middot;</span> {relativeLabel(summary.relative)} through {summary.played}</span></span>{score !== undefined && <button className="tt-clear" onClick={() => changeScore(scorer.id, null)}>Clear</button>}</div>
              <div className="tt-score-entry"><button aria-label={`Decrease ${scorer.name}'s strokes`} disabled={score === 1} onClick={() => changeScore(scorer.id, (score ?? hole.par ?? 4) - 1)}>&minus;</button><div><span className="tt-score-number">{score ?? <span className="tt-unplayed">&mdash;</span>}</span><span>{score === undefined ? "NO SCORE YET" : hole.par === null ? "STROKES" : score === hole.par ? "PAR" : score === hole.par - 1 ? "BIRDIE" : score === hole.par + 1 ? "BOGEY" : `${relativeLabel(score - hole.par)} TO PAR`}</span></div><button aria-label={`Increase ${scorer.name}'s strokes`} disabled={score === 30} onClick={() => changeScore(scorer.id, (score ?? hole.par ?? 4) + 1)}><Icon name="plus" size={24} /></button></div>
              <div className="tt-quick-scores" aria-label={`Quick scores for ${scorer.name}`}>{[2, 3, 4, 5, 6, 7].map((value) => <button key={value} aria-label={`${value} strokes for ${scorer.name}`} aria-pressed={score === value} className={score === value ? "selected" : ""} onClick={() => changeScore(scorer.id, value)}>{value}</button>)}</div>
              {round.stats && <details className="tt-hole-details" key={`${scorer.id}-${holeNumber}`}><summary>Hole details <span>Optional <Icon name="plus" size={15} /></span></summary><div className="tt-detail-fields"><label>Putts<select aria-label={`Putts for ${scorer.name}`} value={detail.putts ?? ""} onChange={(event) => changeDetail(scorer.id, { putts: event.target.value === "" ? undefined : Number(event.target.value) })}><option value="">Not tracked</option>{[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></label>{(["fir", "gir"] as const).filter((key) => key !== "fir" || hole.par !== 3).map((key) => <label key={key}>{key === "fir" ? "Fairway hit" : "Green in regulation"}<select aria-label={`${key.toUpperCase()} for ${scorer.name}`} value={detail[key] === undefined ? "" : String(detail[key])} onChange={(event) => changeDetail(scorer.id, { [key]: event.target.value === "" ? undefined : event.target.value === "true" })}><option value="">Not tracked</option><option value="true">Yes</option><option value="false">No</option></select></label>)}{(["ob", "sand"] as const).map((key) => <label key={key}>{key === "ob" ? "Out of bounds" : "Sand shots"}<select aria-label={`${key} for ${scorer.name}`} value={detail[key] ?? ""} onChange={(event) => changeDetail(scorer.id, { [key]: event.target.value === "" ? undefined : Number(event.target.value) })}><option value="">Not tracked</option>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>)}<label>Recovery shot <small>Custom stat</small><select aria-label={`Recovery shot for ${scorer.name}`} value={detail.recovery === undefined ? "" : String(detail.recovery)} onChange={(event) => changeDetail(scorer.id, { recovery: event.target.value === "" ? undefined : event.target.value === "true" })}><option value="">Not tracked</option><option value="true">Yes</option><option value="false">No</option></select></label></div></details>}
              {round.format === "scramble" && <details className="tt-hole-details"><summary>Who contributed? <span>Optional <Icon name="plus" size={15} /></span></summary><div className="tt-contributors">{round.players.filter((player) => scorer.playerIds.includes(player.id)).map((player) => <label key={player.id}><input type="checkbox" checked={detail.contributors?.includes(player.id) ?? false} onChange={(event) => changeDetail(scorer.id, { contributors: event.target.checked ? [...(detail.contributors ?? []), player.id] : detail.contributors?.filter((id) => id !== player.id) })} />{player.name}</label>)}</div></details>}
            </section>;
          })}
          <div className="tt-hole-navigation"><button className="tt-button tt-button-outline" disabled={holeNumber === round.course.holes[0].number} onClick={() => setHoleNumber(round.course.holes[round.course.holes.findIndex((item) => item.number === holeNumber) - 1].number)}><Icon name="back" size={18} /> Previous</button><button className="tt-button" disabled={holeNumber === round.course.holes.at(-1)?.number} onClick={() => setHoleNumber(round.course.holes[round.course.holes.findIndex((item) => item.number === holeNumber) + 1].number)}>Next hole <Icon name="arrow" size={18} /></button></div>
          <button className="tt-finish-link" onClick={() => setSheet("finish")}>Finish round</button>
          <p className="tt-help tt-center">Play in any order. Unplayed holes stay blank.</p>
        </>}

        {screen === "card" && <>
          <button className="tt-back" onClick={() => go(activeRound.finished ? "rounds" : "score")}><Icon name="back" size={18} /> {activeRound.finished ? "Your rounds" : "Back to scoring"}</button>
          {title(activeRound.course.name, `${activeRound.date} · ${activeRound.format === "stroke" ? "Stroke play" : "Scramble"} · ${isPartial(activeRound) ? "Partial round" : activeRound.finished ? "Complete round" : "In progress"}`)}
          <div className="tt-summary-grid">{activeRound.scorers.map((scorer) => {
            const summary = summarize(activeRound, scorer.id);
            return <div key={scorer.id}><Avatar player={scorer} small /><strong>{summary.played ? summary.strokes : "--"}<small>{relativeLabel(summary.relative)}</small></strong><span>{scorer.name}</span><span>{summary.played} of {activeRound.course.holes.length} holes scored</span>{summary.knownParHoles < summary.played && <span>Par known for {summary.knownParHoles} scored holes</span>}</div>;
          })}</div>
          <div className="tt-section-heading"><h2>The scorecard</h2><span className="tt-help">{activeRound.finished ? "Scroll for every hole" : "Tap a hole to edit"}</span></div>
          <div className="tt-table-scroll" tabIndex={0} role="region" aria-label="Scrollable golf scorecard"><table className="tt-scorecard"><thead><tr><th scope="col">Hole</th>{activeRound.course.holes.map((item) => <th scope="col" key={item.number}>{!activeRound.finished ? <button aria-label={`Edit hole ${item.number}`} onClick={() => { setHoleNumber(item.number); setViewRound(null); go("score"); }}>{item.number}</button> : item.number}</th>)}<th scope="col">Total</th></tr></thead><tbody><tr className="tt-par-row"><th scope="row">Par</th>{activeRound.course.holes.map((item) => <td key={item.number}>{item.par ?? "--"}</td>)}<td>{activeRound.course.holes.every((item) => item.par !== null) ? activeRound.course.holes.reduce((sum, item) => sum + (item.par ?? 0), 0) : "--"}</td></tr>{activeRound.scorers.map((scorer) => <tr key={scorer.id}><th scope="row">{scorer.name}</th>{activeRound.course.holes.map((item) => {
            const score = activeRound.scores[scoreKey(scorer.id, item.number)];
            return <td key={item.number}><span className={score !== undefined && item.par !== null ? score < item.par ? "tt-birdie" : score > item.par ? "tt-bogey" : "" : ""}>{score ?? <span aria-label="Unplayed">&mdash;</span>}</span></td>;
          })}<td><strong>{summarize(activeRound, scorer.id).strokes || "--"}</strong></td></tr>)}</tbody></table></div>
          <p className="tt-score-legend"><span className="tt-birdie">3</span> Under par <span className="tt-bogey">5</span> Over par <span>&mdash; Unplayed</span></p>
          {activeRound.scorers.map((scorer) => { const stats = recordedStats(activeRound, scorer.id); return <section className="tt-card-stats" key={scorer.id}><div className="tt-section-heading"><h2>{scorer.name}&apos;s details</h2><Icon name="stats" size={18} /></div><div className="tt-stat-grid"><div><strong>{stats.puttHoles ? stats.putts : "--"}</strong><span>Putts</span><small>{stats.puttHoles} holes tracked</small></div><div><strong>{stats.firHoles ? `${stats.fairways}/${stats.firHoles}` : "--"}</strong><span>Fairways hit</span><small>Recorded holes</small></div><div><strong>{stats.girHoles ? `${stats.greens}/${stats.girHoles}` : "--"}</strong><span>Greens hit</span><small>Recorded holes</small></div></div></section>; })}
          {activeRound.caption && <blockquote className="tt-round-quote">&ldquo;{activeRound.caption}&rdquo;</blockquote>}
          {!activeRound.finished && <><button className="tt-button" onClick={() => { setViewRound(null); go("score"); }}>Keep playing <Icon name="arrow" size={18} /></button><button className="tt-finish-link" onClick={() => setSheet("finish")}>Finish this round</button></>}
          {activeRound.finished && isPartial(activeRound) && <div className="tt-callout subtle"><Icon name="check" /><p>Partial round. Unplayed holes are not counted as zero.</p></div>}
        </>}

        {screen === "rounds" && <>
          {title("Rounds")}
          {!round.finished && <button className="tt-resume compact" onClick={() => { setViewRound(null); go("score"); }}><span className="tt-resume-icon"><Icon name="flag" /></span><span><span className="tt-eyebrow">RESUME ROUND</span><strong>{round.course.name}</strong><span>Round in progress</span></span><Icon name="arrow" /></button>}
          <div className="tt-tabs" role="group" aria-label="Filter rounds">{["all", "stroke", "scramble"].map((filter) => <button key={filter} aria-pressed={historyFilter === filter} className={historyFilter === filter ? "selected" : ""} onClick={() => setHistoryFilter(filter)}>{filter === "all" ? "All rounds" : filter === "stroke" ? "Stroke play" : "Scrambles"}</button>)}</div>
          <div className="tt-section-heading"><p className="tt-eyebrow">OCTOBER 2026</p><span className="tt-help">{counted(history.filter((item) => historyFilter === "all" || item.format === historyFilter).length, "round")}</span></div>
          <div className="tt-round-list">{history.filter((item) => historyFilter === "all" || item.format === historyFilter).map((item) => <RoundRow key={item.id} round={item} open={() => openRound(item)} />)}</div>
          <button className="tt-season" onClick={() => go("stats")}><Icon name="stats" /><span><strong>Your stats</strong><span>Scores, putts, fairways and greens</span></span><Icon name="arrow" size={18} /></button>
          <button className="tt-button" onClick={() => go("setup")}><Icon name="plus" size={18} /> Start a round</button>
        </>}

        {screen === "courses" && <>
          {title("Courses")}
          <label className="tt-search"><Icon name="search" size={20} /><input aria-label="Search courses" placeholder="Search a course or a place" value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} /></label>
          <div className="tt-section-heading"><h2>{courseQuery ? "Search results" : "Available courses"}</h2><span className="tt-help">{counted(filteredCourses.length, "course")}</span></div>
          <div className="tt-course-list">{filteredCourses.map((course) => <button key={course.id} className="tt-course-card" onClick={() => selectCourse(course)}><CourseArt className={course.id} /><span className="tt-course-card-copy"><span className="tt-eyebrow">{course.holes.length ? `${course.holes.length} HOLES · SCORECARD READY` : "CATALOG · DETAILS NEEDED"}</span><strong>{course.name}</strong><span><Icon name="pin" size={14} />{course.location}</span></span><span className="tt-course-arrow"><Icon name="arrow" size={19} /></span></button>)}</div>
          {!filteredCourses.length && <div className="tt-empty"><Icon name="search" size={32} /><h2>No courses found</h2><p>Try a different course name or location.</p><button className="tt-text-button" onClick={() => setCourseQuery("")}>Clear search</button></div>}
          <p className="tt-help tt-center">Four fictional courses in this preview.<br />Your historical catalog will be connected after design approval.</p>
        </>}

        {screen === "course" && <>
          <button className="tt-back" onClick={() => go("courses")}><Icon name="back" size={18} /> All courses</button>
          <CourseArt className={`tt-course-detail-art ${selectedCourse.id}`} />
          {title(selectedCourse.name, selectedCourse.location)}
          {selectedCourse.holes.length ? <><div className="tt-course-facts"><div><strong>{selectedCourse.holes.length}</strong><span>Holes</span></div><div><strong>{selectedCourse.holes.every((item) => item.par !== null) ? selectedCourse.holes.reduce((sum, item) => sum + (item.par ?? 0), 0) : "--"}</strong><span>Par</span></div><div><strong>{selectedCourse.tees.length || "--"}</strong><span>Tee sets</span></div></div><div className="tt-field"><label htmlFor="tt-course-tee">Tee set</label><select id="tt-course-tee" value={tee} onChange={(event) => setTee(event.target.value)}><option value="">Reference / unknown</option>{selectedCourse.tees.map((name) => <option key={name}>{name}</option>)}</select><span className="tt-help">Reference yardages shown below. Tee-specific distances are not modeled in this visual preview.</span></div><div className="tt-course-holes">{selectedCourse.holes.map((item) => <div key={item.number}><strong>{item.number.toString().padStart(2, "0")}</strong><span>Par {item.par ?? "--"}</span><span>{item.yardage === null ? "Yardage unknown" : `${item.yardage} yd`}</span></div>)}</div><button className="tt-button" onClick={() => go("setup")}>Play here <Icon name="arrow" size={18} /></button></> : <div className="tt-callout"><strong>Hole details unavailable</strong><p>Enter the verified number of holes to create a demo scorecard. Par and yardage will remain unknown.</p><form onSubmit={(event) => { event.preventDefault(); const count = Number(new FormData(event.currentTarget).get("holes")); if (!Number.isInteger(count) || count < 1 || count > 36) { setError("Enter a hole count from 1 to 36."); return; } const updated = { ...selectedCourse, holes: Array.from({ length: count }, (_, i) => ({ number: i + 1, par: null, yardage: null })) }; setSelectedCourse(updated); setCourseList(courseList.map((item) => item.id === updated.id ? updated : item)); setNotice("Demo scorecard created. Par and yardage remain unknown."); }}><label className="tt-field">Verified hole count<input type="number" name="holes" min={1} max={36} required placeholder="e.g. 9" /></label><button className="tt-button" type="submit">Create demo scorecard</button></form></div>}
        </>}

        {screen === "friends" && <>
          {title("Friends")}
          <div className="tt-tabs" role="group" aria-label="Friends views">{["activity", "people", "requests"].map((tab) => <button key={tab} aria-pressed={friendTab === tab} className={friendTab === tab ? "selected" : ""} onClick={() => setFriendTab(tab)}>{tab === "activity" ? "Activity" : tab === "people" ? "Players" : `Requests${request === "pending" ? " (1)" : ""}`}</button>)}</div>
          {friendTab === "activity" && <>{activity()}<p className="tt-help tt-center">You&apos;re all caught up.</p></>}
          {friendTab === "people" && <><div className="tt-section-heading"><h2>Friends &amp; playing partners</h2><button className="tt-text-button" onClick={() => setSheet("guest")}><Icon name="plus" size={16} /> Guest</button></div><div className="tt-people-list">{roster.slice(1).map((player) => <div key={player.id}><Avatar player={player} /><span><strong>{player.name}</strong><span>{player.id === "jamie" || player.id === "morgan" ? "Friend · linked account" : "Guest · no account needed"}</span></span><Icon name="flag" size={18} /></div>)}</div><p className="tt-help">Guest golfers can join a scorecard without signing up. Friend requests and linked profiles will use real accounts in phase 2.</p></>}
          {friendTab === "requests" && (request === "pending" ? <div className="tt-request"><Avatar player={initialPlayers[3]} /><h2>Friend request from Sam</h2><p>Friends can view and comment on shared rounds.</p><button className="tt-button" onClick={() => { setRequest("accepted"); setNotice("Demo friend request accepted."); }}>Accept request</button><button className="tt-finish-link" onClick={() => setRequest("declined")}>Not now</button></div> : <div className="tt-empty"><Icon name="check" size={32} /><h2>{request === "accepted" ? "Request accepted" : "No pending requests"}</h2>{request === "accepted" && <p>Sam&apos;s request is accepted in this demo.</p>}</div>)}
        </>}

        {screen === "stats" && <>
          <button className="tt-back" onClick={() => go("rounds")}><Icon name="back" size={18} /> Your rounds</button>
          {title("Stats")}
          <div className="tt-callout subtle"><Icon name="stats" /><p>Stroke play only. Complete scorecards are grouped by hole count. Scrambles and partial rounds stay separate.</p></div>
          {[18, 9].map((count) => { const rounds = history.filter((item) => item.format === "stroke" && item.course.holes.length === count && !isPartial(item) && item.scorers.some((scorer) => scorer.id === "alex")); return <section className="tt-card-stats" key={count}><div className="tt-section-heading"><h2>{count}-hole stroke play</h2><span className="tt-pill">{rounds.length} ROUND{rounds.length === 1 ? "" : "S"}</span></div><div className="tt-stat-grid"><div><strong>{rounds.length ? (rounds.reduce((sum, item) => sum + summarize(item, "alex").strokes, 0) / rounds.length).toFixed(1) : "--"}</strong><span>Average score</span><small>Complete rounds only</small></div><div><strong>{rounds.length ? Math.min(...rounds.map((item) => summarize(item, "alex").strokes)) : "--"}</strong><span>Best score</span><small>Recorded rounds</small></div><div><strong>{rounds.length}</strong><span>Rounds</span><small>Alex&apos;s scorecards</small></div></div></section>; })}
          <div className="tt-section-heading"><h2>Round stats</h2></div><p className="tt-help">Open a round to see putts, fairways and greens with their actual tracking coverage. Missing stats never count as missed shots.</p>
          <div className="tt-round-list">{history.slice(0, 2).map((item) => <RoundRow key={item.id} round={item} open={() => openRound(item)} />)}</div>
          <p className="tt-help tt-center">No official handicap is calculated.</p>
        </>}
        {error && <p className="tt-inline-error" role="alert">{error}</p>}
        <div className="tt-bottom-space" />
      </main>
      {notice && <div className="tt-toast" role="status"><Icon name="check" size={18} />{notice}</div>}
      <nav className="tt-bottom-nav" aria-label="Main navigation">{navItems.map((item) => <button key={item.screen} aria-current={activeNavigation === item.screen ? "page" : undefined} className={activeNavigation === item.screen ? "active" : ""} onClick={() => go(item.screen)}><Icon name={item.icon} size={22} /><span>{item.label}</span></button>)}</nav>
    </div>

    {sheet === "about" && <Modal title="About this demo" close={() => setSheet(null)}><p>This is an interactive design preview for Tee Time. Every player, course, round and interaction here is fictional.</p><div className="tt-callout"><strong>Nothing is saved to your database.</strong><p>Edits live in this tab only and reset on refresh. &ldquo;Demo saved&rdquo; simulates an online acknowledgment, not real persistence. Your existing authentication and backup are untouched.</p></div><button className="tt-button" onClick={() => setSheet(null)}>Close</button></Modal>}
    {sheet === "profile" && <Modal title="Profile & settings" close={() => setSheet(null)}><div className="tt-profile-card"><Avatar player={roster[0]} /><div><h3>Alex Lane</h3><p>Fictional preview profile</p></div></div><div className="tt-callout subtle"><p>Production accounts remain administrator-provisioned. This demo doesn&apos;t sign you in or change your account.</p></div><a className="tt-button tt-button-outline" href="/login">Go to existing sign in <Icon name="arrow" size={18} /></a><div className="tt-section-heading"><h2>Save scenarios</h2><Icon name="settings" size={18} /></div><p className="tt-help">Choose a scenario, then change a score or hole detail. No network request is made.</p><div className="tt-field"><label htmlFor="tt-save-mode">Demo saving behavior</label><select id="tt-save-mode" value={saveMode} onChange={(event) => setSaveMode(event.target.value as typeof saveMode)}><option value="normal">Successful save</option><option value="error">Connection error</option><option value="conflict">Another-device conflict</option></select></div><button className="tt-button" onClick={() => { setSheet(null); setViewRound(null); if (round.finished) { setRound(initialRound()); setHoleNumber(7); } go("score"); }}>Open scoring <Icon name="arrow" size={18} /></button><button className="tt-finish-link" onClick={() => { if (window.confirm("Reset all fictional preview rounds, people, and interactions?")) window.location.reload(); }}>Reset all demo data</button></Modal>}
    {sheet === "finish" && <Modal title="Finish round?" close={() => setSheet(null)}><p>Unscored holes stay blank. Partial rounds are excluded from full-round averages.</p><div className="tt-finish-summary">{round.scorers.map((scorer) => { const summary = summarize(round, scorer.id); return <div key={scorer.id}><span>{scorer.name}</span><strong>{summary.strokes || "--"} <small>{counted(summary.played, "hole")} scored</small></strong></div>; })}</div><label className="tt-field">Round notes<textarea value={round.caption} maxLength={500} placeholder="Add a note (optional)" onChange={(event) => setRound({ ...round, caption: event.target.value })} /></label>{saveState !== "saved" && <p className="tt-inline-error" role="alert">Return to scoring and resolve the demo save before finishing.</p>}<button className="tt-button" disabled={saveState !== "saved" || !Object.keys(round.scores).length} onClick={completeRound}>Finish round <Icon name="check" size={18} /></button><button className="tt-finish-link" onClick={() => setSheet(null)}>Keep playing</button></Modal>}
    {sheet === "guest" && <Modal title="Add guest" close={() => setSheet(null)}><p>Guest players do not need an account.</p><form onSubmit={(event) => { event.preventDefault(); const name = guestName.trim(); if (!name) { setError("Enter your guest's name."); return; } const id = `guest-${roster.length}`; setRoster([...roster, { id, name, initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(), color: "gold" }]); setSelectedPlayers([...selectedPlayers, id]); setGuestName(""); setSheet(null); setNotice(`${name} added to your demo roster.`); }}><label className="tt-field">Guest name<input autoComplete="off" maxLength={40} required value={guestName} onChange={(event) => { setGuestName(event.target.value); event.target.setCustomValidity(event.target.value.trim() ? "" : "Enter your guest's name."); }} placeholder="Name" /></label><button className="tt-button" type="submit">Add player <Icon name="plus" size={18} /></button></form></Modal>}
    {sheet === "comments" && <Modal title="Comments" close={() => setSheet(null)}><p className="tt-eyebrow">JAMIE&apos;S ROUND AT WILLOW CREEK</p><div className="tt-comments">{comments.map((body, i) => <p key={i}>{body}</p>)}</div><form onSubmit={(event) => { event.preventDefault(); if (!comment.trim()) return; setComments([...comments, `Alex: ${comment.trim()}`]); setComment(""); }}><label className="tt-field">Comment<textarea required maxLength={1000} value={comment} onChange={(event) => { setComment(event.target.value); event.target.setCustomValidity(event.target.value.trim() ? "" : "Write a comment before posting."); }} placeholder="Write a comment" /></label><button className="tt-button" type="submit">Post demo comment <Icon name="arrow" size={18} /></button></form></Modal>}
  </div>;
}
