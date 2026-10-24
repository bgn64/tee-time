"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar, CourseArt, Icon, Modal } from "@/components/golf-ui";
import { isPartial, recordedStats, relativeLabel, scoreKey, scoringHoles, summarize, type Course, type GolfState, type HoleDetail, type SavedRound } from "@/lib/golf-model.mts";
import { initials } from "@/lib/golf-validation.mts";
import type { MutationResult, Social, statistics } from "@/lib/golf-service.mts";
import { ApiError, golfRequest } from "./golf-client";
import { useRoundSave } from "./use-round-save";
import { LogoutButton } from "./logout-button";

type Screen = "home" | "rounds" | "courses" | "friends" | "setup" | "chooseCourse" | "score" | "card" | "course" | "editor" | "stats";
type Action = { operation: string; payload: unknown; mutationId: string; done: (result: MutationResult) => void };
const statLabels: Record<string, string> = { putts: "Putts", fir: "Fairway hit", gir: "Green in regulation", ob: "Out of bounds", sand: "Sand shots", recovery: "Recovery shot" };
function dateLabel(date: string) { return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function totalFor(round: SavedRound, userId: string) {
  return summarize(round, (round.scorers.find((s) => s.playerIds.includes(`account:${userId}`)) ?? round.scorers[0]).id);
}
function RoundRow({ round, userId, open }: { round: SavedRound; userId: string; open: () => void }) {
  const total = totalFor(round, userId);
  return <button className="tt-round-row" onClick={open}><CourseArt className="tt-round-thumb" description="Abstract golf-course contour lines" /><span className="tt-row-body"><strong>{round.course.name}</strong><span>{dateLabel(round.date)} · {round.format === "stroke" ? "Stroke play" : "Scramble"}</span><span className="tt-row-caption">{round.finished ? isPartial(round) ? "Partial round" : `${scoringHoles(round).length} holes` : "In progress"} · {round.players.length} {round.players.length === 1 ? "golfer" : "golfers"} · {total.played} scored</span></span><span className="tt-round-total"><strong>{total.played ? total.strokes : "--"}</strong><span>{relativeLabel(total.relative)}</span></span></button>;
}

function HoleLog({ round, scorerId }: { round: SavedRound; scorerId: string }) {
  const records = round.course.holes.filter((h) => round.details[scoreKey(scorerId, h.number)]);
  return <details className="tt-hole-log"><summary>Hole-by-hole stats</summary>{!records.length && <p className="tt-help">No hole stats recorded.</p>}{records.map((hole) => {
    const detail = round.details[scoreKey(scorerId, hole.number)], score = round.scores[scoreKey(scorerId, hole.number)];
    const fields = (["putts", "fir", "gir", "ob", "sand", "recovery"] as const).flatMap((id) => {
      const value = detail[id];
      return value === undefined ? [] : [{ id, label: statLabels[id], value: typeof value === "boolean" ? value ? "Yes" : "No" : String(value) }];
    });
    const custom = Object.entries(detail.custom ?? {}).map(([id, value]) => ({ id, label: round.customStats.find((s) => s.id === id)?.label ?? id, value: typeof value === "boolean" ? value ? "Yes" : "No" : String(value) }));
    return <section key={hole.number}><h3>Hole {hole.number} · {score === undefined ? "Unplayed" : `${score} strokes`}</h3><dl>{[...fields, ...custom].map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>{detail.contributors && <p>Shot contributors: {detail.contributors.map((id, i) => `${i + 1}. ${id ? round.players.find((p) => p.id === id)?.name ?? "Unknown historical player" : "Unassigned"}`).join(" · ")}</p>}</section>;
  })}</details>;
}

export function GolfApp({ initial }: { initial: GolfState }) {
  const [data, setData] = useState(initial);
  const [screen, setScreen] = useState<Screen>("home");
  const [sheet, setSheet] = useState<"profile" | "guest" | "finish" | "reload" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryAction, setRetryAction] = useState(false);
  const actionRef = useRef<Action | null>(null);
  const contentRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [courseQuery, setCourseQuery] = useState("");
  const [courseOffset, setCourseOffset] = useState(0);
  const [moreCourses, setMoreCourses] = useState(false);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseRevision, setCourseRevision] = useState(0);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [format, setFormat] = useState<"stroke" | "scramble">("stroke");
  const [selectedPlayers, setSelectedPlayers] = useState([`account:${initial.user.id}`]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [teeSelections, setTeeSelections] = useState<Record<string, string>>({});
  const [enabledStats, setEnabledStats] = useState<string[]>(["putts", "fir", "gir"]);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyOffset, setHistoryOffset] = useState(30);
  const [feedOffset, setFeedOffset] = useState(20);
  const [socialData, setSocialData] = useState<Social | null>(null);
  const [socialOffset, setSocialOffset] = useState(0);
  const socialRoundId = useRef<string | null>(null);
  const pagingRef = useRef(false);
  const [paging, setPaging] = useState(false);
  const [comment, setComment] = useState("");
  const [notes, setNotes] = useState("");
  const [stats, setStats] = useState<ReturnType<typeof statistics> | null>(null);
  const [editor, setEditor] = useState<Course | null>(null);
  const [holeCount, setHoleCount] = useState(18);
  const [editorTee, setEditorTee] = useState("");
  const [newTee, setNewTee] = useState("");
  const [friendTab, setFriendTab] = useState("activity");
  const saver = useRoundSave((round) => setData((previous) => ({ ...previous, rounds: [round, ...previous.rounds.filter((r) => r.id !== round.id)].sort((a, b) => b.date.localeCompare(a.date)) })));
  const round = saver.round;
  const cardHoles = round ? scoringHoles(round) : [];
  const activeRound = data.rounds.find((r) => !r.finished);
  const hole = round?.course.holes.find((h) => h.number === round.currentHole);
  const own = round?.ownerId === data.user.id;
  const activeNav = screen === "score" || screen === "card" || screen === "stats" ? "rounds" : screen === "course" || screen === "editor" ? "courses" : screen === "setup" || screen === "chooseCourse" ? "home" : screen;
  const self = { id: data.user.id, name: data.user.name, initials: initials(data.user.name), color: "" };

  useEffect(() => {
    if (!["courses", "chooseCourse"].includes(screen)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      golfRequest<{ courses: Course[]; hasMore: boolean }>(`?kind=courses&q=${encodeURIComponent(courseQuery)}`, undefined, controller.signal)
        .then((result) => { setCourses(result.courses); setMoreCourses(result.hasMore); setCourseOffset(20); })
        .catch((err: unknown) => { if (!(err instanceof DOMException && err.name === "AbortError")) setError(err instanceof Error ? err.message : "Could not load courses."); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [courseQuery, screen, courseRevision]);
  useEffect(() => {
    if (!busy && !retryAction && notes === (round?.caption ?? "")) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, retryAction, notes, round?.caption]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  function showError(err: unknown) { setError(err instanceof Error ? err.message : "The request failed. Please retry."); }
  function go(next: Screen) {
    if (saver.pending || notes !== (round?.caption ?? "")) { setError("Save your pending changes before leaving this screen, or reload the saved round to discard them."); return; }
    if (next !== "card" && next !== "score") socialRoundId.current = null;
    setError(""); setScreen(next);
    requestAnimationFrame(() => { contentRef.current?.scrollTo({ top: 0 }); headingRef.current?.focus(); });
    if (next === "stats") { setStats(null); void golfRequest<ReturnType<typeof statistics>>("?kind=stats").then(setStats).catch(showError); }
  }
  async function refresh() {
    try { setData(await golfRequest<GolfState>()); setHistoryOffset(30); setFeedOffset(20); }
    catch (err) { setError(`Could not refresh this screen. ${err instanceof Error ? err.message : "Reload to try again."}`); }
  }
  async function runAction(action: Action) {
    setBusy(true); setError(""); setRetryAction(false);
    let result: MutationResult;
    try {
      result = await golfRequest<MutationResult>("", { operation: action.operation, payload: action.payload, mutationId: action.mutationId });
    } catch (err) {
      showError(err);
      if (err instanceof ApiError && err.status > 0 && err.status < 500) actionRef.current = null;
      else setRetryAction(true);
      setBusy(false);
      return;
    }
    actionRef.current = null;
    setBusy(false);
    action.done(result);
  }
  function act(operation: string, payload: unknown, done: Action["done"] = () => { void refresh(); setNotice("Saved."); }) {
    if (actionRef.current) { setError("Retry the previous request before making another change."); return; }
    const action = { operation, payload, mutationId: crypto.randomUUID(), done };
    actionRef.current = action; void runAction(action);
  }
  function openRound(value: SavedRound, scoring = false) {
    if (saver.pending || notes !== (round?.caption ?? "")) { setError("Save or reload pending changes before opening another round."); return; }
    try {
      saver.select(value); setNotes(value.caption); setSocialData(null); setSocialOffset(0); setComment(""); socialRoundId.current = value.id;
      go(scoring && value.ownerId === data.user.id && !value.finished ? "score" : "card");
      void loadSocial(value.id);
    } catch (err) { showError(err); }
  }
  async function loadSocial(id: string, offset = 0) {
    if (!offset && socialRoundId.current === id) { setSocialData(null); setSocialOffset(0); }
    try {
      const result = await golfRequest<Social>(`?kind=social&id=${encodeURIComponent(id)}&offset=${offset}`);
      if (socialRoundId.current !== id) return;
      setSocialData((previous) => offset ? { ...result, comments: [...new Map([...(previous?.comments ?? []), ...result.comments].map((c) => [c.id, c])).values()] } : result);
      setSocialOffset(offset);
    } catch (err) { if (socialRoundId.current === id) showError(err); }
  }
  async function loadMore(read: () => Promise<void>) {
    if (pagingRef.current) return;
    pagingRef.current = true; setPaging(true);
    try { await read(); } catch (err) { showError(err); }
    finally { pagingRef.current = false; setPaging(false); }
  }
  function updateScore(scorerId: string, value: number | null) {
    if (!round || !hole) return;
    try {
      const existing = round.details[scoreKey(scorerId, hole.number)];
      saver.patch({ score: { scorerId, hole: hole.number, value },
        ...(value !== null && existing?.contributors && existing.contributors.length > value ? { detail: { scorerId, hole: hole.number, value: { ...existing, contributors: existing.contributors.slice(0, value) } } } : {}) });
    } catch (err) { showError(err); }
  }
  function updateDetail(scorerId: string, value: HoleDetail) {
    if (!hole) return;
    try { saver.patch({ detail: { scorerId, hole: hole.number, value } }); } catch (err) { showError(err); }
  }
  async function loadMoreCourses() {
    setCourseLoading(true);
    try { const result = await golfRequest<{ courses: Course[]; hasMore: boolean }>(`?kind=courses&q=${encodeURIComponent(courseQuery)}&offset=${courseOffset}`); setCourses((previous) => [...(previous ?? []), ...result.courses]); setCourseOffset((v) => v + 20); setMoreCourses(result.hasMore); }
    catch (err) { showError(err); } finally { setCourseLoading(false); }
  }
  function title(label: string) { return <div className="tt-page-heading"><h1 ref={headingRef} tabIndex={-1}>{label}</h1></div>; }
  function feedback(inDialog = false) {
    return <>{error && <div className="tt-callout error" role="alert"><p>{error}</p>{retryAction && <button className="tt-text-button" disabled={busy} onClick={() => { if (actionRef.current) void runAction(actionRef.current); }}>Retry request</button>}{!retryAction && <button className="tt-text-button" onClick={() => setError("")}>Dismiss</button>}</div>}{inDialog && notice && <p className="tt-help" role="status">{notice}</p>}</>;
  }
  function search() { return <label className="tt-search"><Icon name="search" size={19} /><span className="tt-sr-only">Search courses</span><input type="search" disabled={courseLoading} placeholder="Course name, city or region" value={courseQuery} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} onChange={(e) => { setError(""); setCourseQuery(e.target.value); setCourses(null); }} /></label>; }
  function credits() { return <p className="tt-help tt-catalog-credit">Contains data from <a href="https://opengolfapi.org" target="_blank" rel="noreferrer">OpenGolfAPI</a> and <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a>.</p>; }
  function empty(message: string) { return <div className="tt-empty"><Icon name="flag" size={30} /><p>{message}</p></div>; }
  function courseList(forSetup = false) {
    return <>{courses === null ? error ? <button className="tt-text-button" onClick={() => { setError(""); setCourseRevision((v) => v + 1); }}>Retry course search</button> : <p className="tt-help tt-loading-inline" role="status">Searching courses...</p> : !courses.length ? empty("No courses found. Add a course or try another search.") : <div className="tt-course-list">{courses.map((c) => <button type="button" key={c.id} className={`tt-course-card tt-compact-course ${forSetup && selectedCourse?.id === c.id ? "selected" : ""}`} onClick={() => { setSelectedCourse(c); setTeeSelections({}); go(forSetup ? "setup" : "course"); }} aria-pressed={forSetup ? selectedCourse?.id === c.id : undefined}><span className="tt-course-card-copy"><strong>{c.name}</strong><span><Icon name="pin" size={13} />{c.location || "Location not recorded"}</span><span className="tt-help">{c.holes.length ? `${c.holes.length} holes ready` : "Hole details needed"}</span></span><span className="tt-course-arrow"><Icon name={forSetup && selectedCourse?.id === c.id ? "check" : "arrow"} size={18} /></span></button>)}</div>}{moreCourses && <button type="button" className="tt-button tt-button-outline" disabled={courseLoading} onClick={() => void loadMoreCourses()}>{courseLoading ? "Loading..." : "More courses"}</button>}</>;
  }
  function startRound(e: FormEvent) {
    e.preventDefault();
    if (!selectedCourse) { setError("Choose a course first."); return; }
    const groups = ["1", "2", "3"].map((id) => ({ name: `Team ${id}`, playerIds: selectedPlayers.filter((p) => (assignments[p] ?? "1") === id) })).filter((t) => t.playerIds.length);
    act("createRound", { courseId: selectedCourse.id, format, playerIds: selectedPlayers, teams: groups, teeSelections, enabledStatKeys: enabledStats }, (result) => {
      if (!result.round) { setError("The server did not return the new round. Reload before starting another."); return; }
      setData((d) => ({ ...d, rounds: [result.round!, ...d.rounds] })); openRound(result.round, true);
    });
  }
  function editCourse(c: Course) { setEditor(structuredClone(c)); setEditorTee(c.teeSets?.[0]?.id ?? ""); go("editor"); }
  function newCourse() { editCourse({ id: crypto.randomUUID(), name: "", location: "", description: "", holes: [], tees: [], teeSets: [] }); }
  function submitComment(e: FormEvent) {
    e.preventDefault(); if (!round) return;
    act("comment", { roundId: round.id, body: comment }, () => { setComment(""); void loadSocial(round.id); });
  }
  function chooseHole(number: number) {
    try { saver.patch({ currentHole: number }); contentRef.current?.scrollTo({ top: 0, behavior: "smooth" }); } catch (err) { showError(err); }
  }
  const nav = [{ id: "home", label: "Home", icon: "home" }, { id: "rounds", label: "Rounds", icon: "flag" }, { id: "courses", label: "Courses", icon: "courses" }, { id: "friends", label: "Friends", icon: "friends" }] as const;

  return <div className="tt-preview tt-visual tt-design-night tt-production"><div className="tt-app">
    <header className="tt-header"><button className="tt-wordmark" onClick={() => go("home")} aria-label="Tee Time home"><span className="tt-brand-icon"><Icon name="flag" size={20} /></span>tee time<span className="tt-brand-period">.</span></button><button className="tt-profile-button" aria-label="Open profile and settings" onClick={() => setSheet("profile")}><Avatar player={self} small /></button></header>
    <main className="tt-content" ref={contentRef}>
      {feedback()}
      {saver.pending && <div className={`tt-save-bar ${saver.status === "saving" ? "" : "tt-callout error"}`} role={saver.status === "saving" ? "status" : "alert"}><strong>{saver.status === "saving" ? "Saving changes..." : "Changes not saved"}</strong>{saver.error && <p>{saver.error}</p>}{saver.status === "error" && <button className="tt-text-button" onClick={() => void saver.retry()}>Retry save</button>}{saver.status !== "saving" && <button className="tt-text-button" onClick={() => setSheet("reload")}>Reload saved round</button>}</div>}
      {screen === "home" && <>
        {title("Home")}
        <section className="tt-hero"><CourseArt description="Abstract golf-course contour lines" /><div className="tt-hero-copy"><button className="tt-button" onClick={() => activeRound ? openRound(activeRound, true) : go("setup")}>{activeRound ? "Resume round" : "Start a round"}<Icon name="arrow" size={19} /></button></div></section>
        {activeRound && <button className="tt-resume" onClick={() => openRound(activeRound, true)}><span className="tt-resume-icon"><Icon name="flag" /></span><span><span className="tt-eyebrow"><span className="tt-live-dot" />ROUND IN PROGRESS</span><strong>{activeRound.course.name}</strong><span>Hole {activeRound.currentHole} · {activeRound.players.length} golfers · {totalFor(activeRound, data.user.id).strokes || "--"} strokes</span></span><Icon name="arrow" /></button>}
        <div className="tt-section-heading"><h2>Recent rounds</h2><button className="tt-text-button" onClick={() => go("rounds")}>All rounds <Icon name="arrow" size={16} /></button></div>
        <div className="tt-round-list">{data.rounds.filter((r) => r.finished).slice(0, 3).map((r) => <RoundRow key={r.id} round={r} userId={data.user.id} open={() => openRound(r)} />)}</div>
        {!data.rounds.length && empty("No rounds yet. Start a round to begin scoring.")}
        <button className="tt-season" onClick={() => go("stats")}><span className="tt-season-icon"><Icon name="stats" /></span><span><strong>Your stats</strong><span>Scores, putts, fairways and greens</span></span><Icon name="arrow" size={19} /></button>
        <div className="tt-section-heading"><h2>Friends activity</h2><button className="tt-text-button" onClick={() => go("friends")}>Friends <Icon name="arrow" size={16} /></button></div>
        {data.feed.slice(0, 2).map((r) => <article className="tt-activity" key={r.id}><div className="tt-activity-heading"><div><strong>{data.friends.find((f) => f.id === r.ownerId)?.name}</strong><p>{dateLabel(r.date)} · Friends</p></div><span className="tt-pill">{r.format === "stroke" ? "STROKE" : "SCRAMBLE"}</span></div><RoundRow round={r} userId={data.user.id} open={() => openRound(r)} /></article>)}
        {!data.feed.length && <p className="tt-help">Rounds shared by your friends will appear here.</p>}
      </>}
      {screen === "setup" && <><button className="tt-back" onClick={() => go("home")}><Icon name="back" size={18} />Home</button>{title("Start a round")}<form onSubmit={startRound}>
        <div className="tt-section-heading"><h2>Course</h2><button type="button" className="tt-text-button" onClick={newCourse}><Icon name="plus" size={16} />Add course</button></div>
        <button type="button" className="tt-button tt-button-outline" onClick={() => go("chooseCourse")}>{selectedCourse ? "Change course" : "Choose a course"}<Icon name="search" size={18} /></button>
        {selectedCourse && <div className="tt-callout"><strong>{selectedCourse.name}</strong><p>{selectedCourse.holes.length ? `${selectedCourse.holes.length} holes available. Play any holes and finish when you're ready.` : "Add verified hole details before playing."}</p>{!selectedCourse.holes.length && <button type="button" className="tt-text-button" onClick={() => editCourse(selectedCourse)}>Set up scorecard <Icon name="arrow" size={16} /></button>}</div>}
        <fieldset className="tt-field"><legend>Scoring format</legend><div className="tt-format-options">{(["stroke", "scramble"] as const).map((f) => <button type="button" key={f} className={format === f ? "selected" : ""} aria-pressed={format === f} onClick={() => setFormat(f)}><Icon name={f === "stroke" ? "flag" : "friends"} /><strong>{f === "stroke" ? "Stroke play" : "Scramble"}</strong><span>{f === "stroke" ? "Individual scores" : "Team scores"}</span></button>)}</div></fieldset>
        <div className="tt-section-heading"><h2>Players</h2><button type="button" className="tt-text-button" onClick={() => setSheet("guest")}><Icon name="plus" size={16} />Add guest</button></div>
        <div className="tt-player-options">{data.players.filter((p) => !p.deleted).map((p) => <div className="tt-player-option tt-setup-player" key={p.id}><label><input type="checkbox" checked={selectedPlayers.includes(p.id)} onChange={(e) => { setSelectedPlayers((ids) => e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id)); if (!e.target.checked) setTeeSelections((v) => Object.fromEntries(Object.entries(v).filter(([id]) => id !== p.id))); }} /><Avatar player={p} small /><span>{p.name}{p.accountId === data.user.id && <small> (you)</small>}</span></label>{selectedPlayers.includes(p.id) && <div className="tt-player-selections">{format === "scramble" && <select aria-label={`Team for ${p.name}`} value={assignments[p.id] ?? "1"} onChange={(e) => setAssignments({ ...assignments, [p.id]: e.target.value })}>{["1", "2", "3"].map((n) => <option key={n} value={n}>Team {n}</option>)}</select>}{!!selectedCourse?.teeSets?.length && <select aria-label={`Tees for ${p.name}`} value={teeSelections[p.id] ?? ""} onChange={(e) => setTeeSelections((v) => e.target.value ? { ...v, [p.id]: e.target.value } : Object.fromEntries(Object.entries(v).filter(([id]) => id !== p.id)))}><option value="">Reference yardages</option>{selectedCourse.teeSets.map((tee) => <option value={tee.id} key={tee.id}>{tee.name}</option>)}</select>}</div>}</div>)}</div>
        <fieldset className="tt-field"><legend>Optional stats</legend><div className="tt-stat-options">{[...Object.entries(statLabels).map(([id, label]) => ({ id, label })), ...data.customStats].map((s) => <label key={s.id}><input type="checkbox" checked={enabledStats.includes(s.id)} onChange={(e) => setEnabledStats((v) => e.target.checked ? [...v, s.id] : v.filter((id) => id !== s.id))} />{s.label}</label>)}</div></fieldset>
        <p className="tt-help">New rounds are private. You can share them with friends from the scorecard.</p><button className="tt-button" disabled={busy || !selectedCourse?.holes.length || !selectedPlayers.length}>Start scoring <Icon name="arrow" size={19} /></button>
      </form></>}
      {screen === "chooseCourse" && <><button className="tt-back" onClick={() => go("setup")}><Icon name="back" size={18} />Round setup</button>{title("Choose a course")}{search()}{credits()}{courseList(true)}</>}
      {screen === "score" && round && hole && <>
        <div className="tt-score-top"><button className="tt-back" onClick={() => go("home")}><Icon name="back" size={18} />Home</button><button className="tt-text-button" onClick={() => go("card")}>Scorecard <Icon name="courses" size={17} /></button></div>
        <div className="tt-score-course"><p className="tt-eyebrow">{round.format === "stroke" ? "STROKE PLAY" : "TEAM SCRAMBLE"}</p><h1 ref={headingRef} tabIndex={-1}>{round.course.name}</h1><p>{round.course.location}</p></div>
        <section className="tt-hole-hero"><div><p className="tt-eyebrow">ON THE COURSE</p><h2><span>Hole</span> {String(hole.number).padStart(2, "0")}</h2></div><div className="tt-hole-facts"><span><strong>{hole.par ?? "--"}</strong>PAR</span><span><strong>{hole.yardage ?? "--"}</strong>YARDS</span></div><span className="tt-hole-lines" aria-hidden="true" /></section>
        <div className="tt-hole-strip" aria-label="Jump to hole">{round.course.holes.map((h) => <button key={h.number} className={`${h.number === hole.number ? "current" : ""} ${round.scorers.some((s) => round.scores[scoreKey(s.id, h.number)] !== undefined) ? "scored" : ""}`} aria-current={h.number === hole.number ? "step" : undefined} aria-label={`Hole ${h.number}`} disabled={round.finished || saver.status === "conflict"} onClick={() => chooseHole(h.number)}>{h.number}</button>)}</div>
        <div className="tt-section-heading"><h2>Scores</h2><span className={`tt-save-status ${saver.status}`} role="status">{saver.status === "saved" ? <><Icon name="check" size={14} />Saved</> : saver.status === "saving" ? "Saving..." : "Not saved"}</span></div>
        {round.scorers.map((s) => {
          const key = scoreKey(s.id, hole.number), value = round.scores[key], detail = round.details[key] ?? {}, total = summarize(round, s.id);
          const teeId = round.format === "stroke" ? round.teeSelections[s.playerIds[0]] : undefined, yards = teeId ? hole.yardages?.[teeId] : hole.yardage;
          return <article className="tt-scorer" key={s.id}><div className="tt-scorer-heading"><Avatar player={s} small /><span><strong>{s.name}</strong><span>{total.played ? `${total.strokes} strokes · ${relativeLabel(total.relative)} through ${total.played}` : "No holes scored"}{teeId ? ` · ${round.course.teeSets?.find((t) => t.id === teeId)?.name ?? "Selected tees"}: ${yards ?? "--"} yd` : ""}</span></span><button className="tt-clear" disabled={value === undefined || round.finished || saver.status === "conflict"} onClick={() => updateScore(s.id, null)}>Clear</button></div>
            <fieldset disabled={round.finished || saver.status === "conflict" || !own} className="tt-score-controls"><div className="tt-score-entry"><button aria-label={`Decrease strokes for ${s.name}`} disabled={value === undefined || value <= 1} onClick={() => updateScore(s.id, value - 1)}>-</button><div><input className="tt-direct-score" aria-label={`Strokes for ${s.name}`} type="number" inputMode="numeric" min={1} max={30} value={value ?? ""} placeholder="--" onChange={(e) => { const n = Number(e.target.value); if (!e.target.value) updateScore(s.id, null); else if (Number.isInteger(n) && n >= 1 && n <= 30) updateScore(s.id, n); else setError("Enter 1 to 30 strokes."); }} /><span>{value === undefined ? "Unplayed" : hole.par === null ? "Par unknown" : relativeLabel(value - hole.par)}</span></div><button aria-label={`Increase strokes for ${s.name}`} disabled={value >= 30} onClick={() => updateScore(s.id, value === undefined ? hole.par ?? 4 : value + 1)}>+</button></div>
              <div className="tt-quick-scores">{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <button key={n} className={value === n ? "selected" : ""} aria-pressed={value === n} aria-label={`${n} strokes for ${s.name}`} onClick={() => updateScore(s.id, n)}>{n}</button>)}</div>
              {(round.stats || round.format === "scramble") && <details className="tt-hole-details"><summary>Hole stats <span>{value === undefined ? "Score first" : "Optional"}<Icon name="plus" size={14} /></span></summary><fieldset disabled={value === undefined} className="tt-detail-fields">{round.enabledStatKeys.map((id) => {
                const definition = round.customStats.find((c) => c.id === id), label = definition?.label ?? statLabels[id] ?? id;
                const binary = definition?.valueType === "binary" || ["fir", "gir", "recovery"].includes(id);
                const current = id.startsWith("custom:") ? detail.custom?.[id] : detail[id as keyof HoleDetail];
                const change = (raw: string) => {
                  if (raw !== "" && !binary && (!Number.isInteger(Number(raw)) || Number(raw) < 0 || Number(raw) > (definition ? 999 : 30))) { setError(`Enter a whole number from 0 to ${definition ? 999 : 30}.`); return; }
                  const next = structuredClone(detail);
                  const parsed = raw === "" ? undefined : binary ? raw === "true" : Number(raw);
                  if (id.startsWith("custom:")) { const custom = { ...next.custom }; if (parsed === undefined) delete custom[id]; else custom[id] = parsed; next.custom = custom; }
                  else { const field = id as "putts" | "fir" | "gir" | "ob" | "sand" | "recovery"; if (parsed === undefined) delete next[field]; else Object.assign(next, { [field]: parsed }); }
                  updateDetail(s.id, next);
                };
                return <label key={id}>{label}{definition?.valueType === "integer" ? <input aria-label={`${label} for ${s.name}`} type="number" inputMode="numeric" min={0} max={999} value={current === undefined ? "" : String(current)} placeholder="Not recorded" onChange={(e) => change(e.target.value)} /> : <select aria-label={`${label} for ${s.name}`} value={current === undefined ? "" : String(current)} onChange={(e) => change(e.target.value)}><option value="">Not recorded</option>{binary ? <><option value="true">Yes</option><option value="false">No</option></> : Array.from({ length: 31 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select>}</label>;
              })}</fieldset>{round.format === "scramble" && value !== undefined && <div className="tt-contributor-list"><p className="tt-help">Shot contributors (optional)</p>{Array.from({ length: value }, (_, index) => <label key={index}>Shot {index + 1}<select aria-label={`Shot ${index + 1} contributor for ${s.name}`} value={detail.contributors?.[index] ?? ""} onChange={(e) => { const contributors = Array.from({ length: value }, (_, i) => detail.contributors?.[i] ?? ""); contributors[index] = e.target.value; updateDetail(s.id, { ...detail, contributors }); }}><option value="">Not assigned</option>{s.playerIds.map((id) => <option key={id} value={id}>{round.players.find((p) => p.id === id)?.name}</option>)}</select></label>)}</div>}</details>}
            </fieldset>
          </article>;
        })}
        <div className="tt-hole-navigation"><button className="tt-button tt-button-outline" disabled={round.finished || round.course.holes[0].number === hole.number || saver.status === "conflict"} onClick={() => chooseHole(round.course.holes[round.course.holes.findIndex((h) => h.number === hole.number) - 1].number)}><Icon name="back" size={17} />Previous</button><button className="tt-button tt-button-outline" disabled={round.finished || round.course.holes.at(-1)?.number === hole.number || saver.status === "conflict"} onClick={() => chooseHole(round.course.holes[round.course.holes.findIndex((h) => h.number === hole.number) + 1].number)}>Next<Icon name="arrow" size={17} /></button></div>
        {round.finished ? <button className="tt-button" disabled={saver.pending} onClick={() => go("card")}>View round</button> : <button className="tt-finish-link" disabled={saver.pending} onClick={() => setSheet("finish")}>Finish round</button>}
      </>}
      {screen === "card" && round && <>
        <button className="tt-back" onClick={() => go("rounds")}><Icon name="back" size={18} />Rounds</button>{title(round.course.name)}<p className="tt-help">{dateLabel(round.date)} · {round.format === "stroke" ? "Stroke play" : "Scramble"} · {round.finished ? isPartial(round) ? "Finished · partial round" : "Finished" : "In progress"}{!own ? ` · ${data.friends.find((f) => f.id === round.ownerId)?.name ?? "Friend"}` : ""}</p>
        {round.expectedHoleNumbers && <p className="tt-help">Historical {round.legacyHoleRange === "front9" ? "front nine" : "back nine"}. Reopening makes the full scorecard available.</p>}
        <div className="tt-summary-grid">{round.scorers.map((s) => { const total = summarize(round, s.id); return <div key={s.id}><Avatar player={s} small /><span>{s.name}</span><strong>{total.played ? total.strokes : "--"}<small>{relativeLabel(total.relative)}</small></strong><span>{total.played} of {cardHoles.length} holes scored</span><span>Par known for {total.knownParHoles} scored holes</span></div>; })}</div>
        <div className="tt-section-heading"><h2>Scorecard</h2>{own && !round.finished && <button className="tt-text-button" onClick={() => go("score")}>Continue scoring<Icon name="arrow" size={17} /></button>}</div>
        <div className="tt-table-scroll" tabIndex={0} role="region" aria-label="Scrollable scorecard"><table className="tt-scorecard"><thead><tr><th scope="col">Hole</th>{cardHoles.map((h) => <th scope="col" key={h.number}>{own && !round.finished ? <button disabled={saver.pending} aria-label={`Edit hole ${h.number}`} onClick={() => { chooseHole(h.number); setScreen("score"); }}>{h.number}</button> : h.number}</th>)}</tr></thead><tbody><tr className="tt-par-row"><th scope="row">Par</th>{cardHoles.map((h) => <td key={h.number}>{h.par ?? "--"}</td>)}</tr>{round.scorers.map((s) => <tr key={s.id}><th scope="row">{s.name}</th>{cardHoles.map((h) => { const value = round.scores[scoreKey(s.id, h.number)]; return <td key={h.number}><span className={value !== undefined && h.par !== null ? value < h.par ? "tt-birdie" : value > h.par ? "tt-bogey" : "" : ""}>{value ?? "--"}</span></td>; })}</tr>)}</tbody></table></div>
        <p className="tt-score-legend">-- Unplayed <span className="tt-birdie">-</span>Under par <span className="tt-bogey">+</span>Over par</p>
        {round.scorers.map((s) => { const st = recordedStats(round, s.id); return <section className="tt-card-stats" key={s.id}>
          <div className="tt-section-heading"><h2>{s.name}</h2></div>
          <p className="tt-help">{s.playerIds.map((id) => `${round.players.find((p) => p.id === id)?.name}: ${round.course.teeSets?.find((t) => t.id === round.teeSelections[id])?.name ?? "Reference tees"}`).join(" · ")}</p>
          <div className="tt-stat-grid"><div><strong>{st.puttHoles ? st.putts : "--"}</strong><span>Putts</span><small>{st.puttHoles} holes recorded</small></div><div><strong>{st.firHoles ? `${Math.round(st.fairways / st.firHoles * 100)}%` : "--"}</strong><span>Fairways</span><small>{st.fairways}/{st.firHoles} recorded</small></div><div><strong>{st.girHoles ? `${Math.round(st.greens / st.girHoles * 100)}%` : "--"}</strong><span>Greens</span><small>{st.greens}/{st.girHoles} recorded</small></div></div>
          <HoleLog round={round} scorerId={s.id} />
        </section>; })}
        {own ? <><label className="tt-field">Round notes<textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label><button className="tt-button tt-button-outline" disabled={saver.pending || notes === round.caption} onClick={() => saver.patch({ caption: notes })}>Save notes</button><label className="tt-field">Who can see this round?<select value={round.visibility} disabled={saver.pending} onChange={(e) => saver.patch({ visibility: e.target.value === "friends" ? "friends" : "private" })}><option value="private">Only me</option><option value="friends">My friends</option></select><span className="tt-help">Friends can view and comment, never edit your scores.</span></label>{round.finished ? <button className="tt-button tt-button-outline" disabled={saver.pending || !!activeRound} onClick={() => { saver.patch({ reopen: true }); setScreen("score"); }}>Reopen to edit scores</button> : <button className="tt-button" disabled={saver.pending} onClick={() => setSheet("finish")}>Finish round</button>}</> : round.caption && <blockquote className="tt-round-quote">{round.caption}</blockquote>}
        <div className="tt-section-heading"><h2>Comments</h2>{socialData && <button className="tt-text-button" disabled={busy || paging} aria-label={`${socialData.liked ? "Unlike" : "Like"} round (${socialData.likes} likes)`} aria-pressed={socialData.liked} onClick={() => act("like", { roundId: round.id, liked: !socialData.liked }, () => { void loadSocial(round.id); })}><Icon name="heart" size={18} />{socialData.likes}</button>}</div>
        {!socialData ? <p className="tt-help" role="status">Loading comments...</p> : <><div className="tt-comments">{socialData.comments.map((c) => <div key={c.id}><p><strong>{c.name}</strong><br />{c.body}</p>{(c.userId === data.user.id || own) && <button className="tt-text-button" disabled={busy || paging} onClick={() => act("deleteComment", { roundId: round.id, id: c.id }, () => { void loadSocial(round.id); })}>Delete comment</button>}</div>)}</div>{socialData.hasMore && <button className="tt-text-button" disabled={busy || paging} onClick={() => { void loadMore(() => loadSocial(round.id, socialOffset + 30)); }}>Older comments</button>}<form onSubmit={submitComment}><label className="tt-field">Comment<textarea value={comment} maxLength={1000} required onChange={(e) => setComment(e.target.value)} /></label><button className="tt-button" disabled={busy || paging || !comment.trim()}>Post comment</button></form></>}
      </>}
      {screen === "rounds" && <>{title("Rounds")}<label className="tt-field">Filter<select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}><option value="all">All rounds</option><option value="stroke">Stroke play</option><option value="scramble">Scrambles</option><option value="active">In progress</option></select></label><div className="tt-round-list">{data.rounds.filter((r) => historyFilter === "all" || (historyFilter === "active" ? !r.finished : r.format === historyFilter)).map((r) => <RoundRow key={r.id} round={r} userId={data.user.id} open={() => openRound(r, !r.finished)} />)}</div>{!data.rounds.length && empty("Your rounds will appear here.")}{data.hasMoreRounds && <button className="tt-button tt-button-outline" disabled={paging} onClick={() => { void loadMore(async () => { const result = await golfRequest<{ rounds: SavedRound[]; hasMore: boolean }>(`?kind=rounds&offset=${historyOffset}`); setData((d) => ({ ...d, rounds: [...new Map([...d.rounds, ...result.rounds].map((r) => [r.id, r])).values()], hasMoreRounds: result.hasMore })); setHistoryOffset(historyOffset + 30); }); }}>More rounds</button>}</>}
      {screen === "courses" && <>{title("Courses")}<div className="tt-section-heading"><h2>Course search</h2><button className="tt-text-button" onClick={newCourse}><Icon name="plus" size={16} />Add course</button></div>{search()}{credits()}{courseList()}</>}
      {screen === "course" && selectedCourse && <>
        <button className="tt-back" onClick={() => go("courses")}><Icon name="back" size={18} />Courses</button>
        {title(selectedCourse.name)}<p className="tt-help">{selectedCourse.location}</p>
        <div className="tt-callout"><strong>{selectedCourse.holes.length ? `${selectedCourse.holes.length} holes available` : "Hole details needed"}</strong><p>{selectedCourse.holes.length ? "Par and yardages are shown only where recorded." : "This catalog entry doesn't have a scorecard. Add verified holes; unknown par and yardage can stay blank."}</p></div>
        <button className="tt-button" onClick={() => selectedCourse.holes.length ? go("setup") : editCourse(selectedCourse)}>{selectedCourse.holes.length ? "Play this course" : "Set up scorecard"}<Icon name="arrow" size={18} /></button>
        <button className="tt-text-button" onClick={() => editCourse(selectedCourse)}>Edit a personal copy</button>
        <div className="tt-course-holes">{selectedCourse.holes.map((h) => <div key={h.number}><strong>{h.number}</strong><span>Par {h.par ?? "--"}</span><span>{h.yardage ?? "--"} yd</span></div>)}</div>
        {credits()}
      </>}
      {screen === "editor" && editor && <><button className="tt-back" onClick={() => go("courses")}><Icon name="back" size={18} />Courses</button>{title("Course scorecard")}<form onSubmit={(e) => { e.preventDefault(); act("course", { course: { ...editor, tees: editor.teeSets ?? [] } }, (result) => { if (!result.course) { setError("The server did not return the course."); return; } setSelectedCourse(result.course); setCourseRevision((v) => v + 1); setScreen("course"); setNotice("Personal scorecard saved."); }); }}><label className="tt-field">Course name<input required maxLength={200} value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} /></label><label className="tt-field">Location<input maxLength={200} value={editor.location} onChange={(e) => setEditor({ ...editor, location: e.target.value })} /></label>
        {!editor.holes.length && <><label className="tt-field">Number of holes<input type="number" inputMode="numeric" min={1} max={36} value={holeCount} onChange={(e) => setHoleCount(Number(e.target.value))} /></label><button type="button" className="tt-button tt-button-outline" onClick={() => { if (!Number.isInteger(holeCount) || holeCount < 1 || holeCount > 36) { setError("Enter 1 to 36 holes."); return; } setEditor({ ...editor, holes: Array.from({ length: holeCount }, (_, i) => ({ number: i + 1, par: null, yardage: null })) }); }}>Add blank holes</button></>}
        <p className="tt-help">Enter verified details. Leave unknown values blank. Historical rounds stay unchanged.</p>
        <div className="tt-field"><label htmlFor="tt-new-tee">Add playing tees (optional)</label><input id="tt-new-tee" value={newTee} maxLength={80} onChange={(e) => setNewTee(e.target.value)} /><button type="button" className="tt-button tt-button-outline" disabled={!newTee.trim()} onClick={() => { const id = crypto.randomUUID(); setEditor({ ...editor, teeSets: [...(editor.teeSets ?? []), { id, name: newTee.trim() }], tees: [...editor.tees, newTee.trim()] }); setEditorTee(id); setNewTee(""); }}>Add tees</button></div>
        <label className="tt-field">Yardages for<select value={editorTee} onChange={(e) => setEditorTee(e.target.value)}><option value="">Reference scorecard</option>{editor.teeSets?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        {editor.holes.map((h, index) => <fieldset className="tt-course-hole-editor" key={index}><legend>Hole {h.number}</legend>{(["number", "par", "yardage"] as const).map((field) => <label key={field}>{field === "number" ? "Number" : field === "par" ? "Par" : "Yards"}<input type="number" inputMode="numeric" required={field === "number"} min={1} max={field === "number" ? 36 : field === "par" ? 9 : 1500} value={field === "yardage" && editorTee ? h.yardages?.[editorTee] ?? "" : h[field] ?? ""} onChange={(e) => { const number = e.target.value ? Number(e.target.value) : null; setEditor({ ...editor, holes: editor.holes.map((v, i) => i !== index ? v : field === "yardage" && editorTee ? { ...v, yardages: number === null ? Object.fromEntries(Object.entries(v.yardages ?? {}).filter(([id]) => id !== editorTee)) : { ...v.yardages, [editorTee]: number } } : { ...v, [field]: number }) }); }} /></label>)}</fieldset>)}
        <button className="tt-button" disabled={busy || !editor.holes.length}>Save personal scorecard</button></form></>}
      {screen === "friends" && <>{title("Friends")}<div className="tt-tabs">{["activity", "people", "requests"].map((tab) => <button key={tab} className={friendTab === tab ? "selected" : ""} onClick={() => setFriendTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}{tab === "requests" && data.requests.length ? ` (${data.requests.length})` : ""}</button>)}</div>
        {friendTab === "activity" && <>{data.feed.map((r) => <article className="tt-activity" key={r.id}><div className="tt-activity-heading"><strong>{data.friends.find((f) => f.id === r.ownerId)?.name}</strong></div><RoundRow round={r} userId={data.user.id} open={() => openRound(r)} /></article>)}{!data.feed.length && empty("No shared rounds yet.")}{data.hasMoreFeed && <button className="tt-button tt-button-outline" disabled={paging} onClick={() => { void loadMore(async () => { const result = await golfRequest<{ rounds: SavedRound[]; hasMore: boolean }>(`?kind=feed&offset=${feedOffset}`); setData((d) => ({ ...d, feed: [...new Map([...d.feed, ...result.rounds].map((r) => [r.id, r])).values()], hasMoreFeed: result.hasMore })); setFeedOffset(feedOffset + 20); }); }}>More activity</button>}<button className="tt-text-button" disabled={paging} onClick={() => void refresh()}>Refresh activity</button></>}
        {friendTab === "people" && <><form onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); act("friendRequest", { handle: form.get("handle") }); }}><label className="tt-field">Add a friend by handle<input name="handle" required maxLength={40} placeholder="Their Tee Time handle" /></label><button className="tt-button" disabled={busy}>Send request</button></form><div className="tt-people-list">{data.friends.map((f) => <div key={f.id}><Avatar player={{ ...f, initials: initials(f.name), color: "" }} small /><span><strong>{f.name}</strong><span>@{f.handle}</span></span><button className="tt-text-button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${f.name} as a friend? You will lose access to each other's shared rounds.`)) act("removeFriend", { id: f.id }); }}>Remove</button></div>)}</div><div className="tt-section-heading"><h2>Guests</h2><button className="tt-text-button" onClick={() => setSheet("guest")}>Add guest<Icon name="plus" size={16} /></button></div><div className="tt-people-list">{data.players.filter((p) => !p.accountId && !p.deleted).map((p) => <div key={p.id}><Avatar player={p} small /><span><strong>{p.name}</strong><span>Guest · historical scores are preserved</span></span><button className="tt-text-button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${p.name} from your active roster? Historical rounds will be preserved.`)) act("deleteGuest", { playerId: p.id }); }}>Remove</button></div>)}</div></>}
        {friendTab === "requests" && <>{!data.requests.length && empty("No pending friend requests.")}{data.requests.map((r) => <div className="tt-callout" key={r.id}><strong>{r.name}</strong><p>{r.fromId === data.user.id ? "Request sent" : "Wants to add you as a friend"}</p><div className="tt-hole-navigation">{(r.toId === data.user.id ? ["accepted", "declined"] : ["cancelled"]).map((answer) => <button className="tt-button tt-button-outline" disabled={busy} key={answer} onClick={() => act("answerRequest", { id: r.id, answer })}>{answer === "accepted" ? "Accept" : answer === "declined" ? "Decline" : "Cancel request"}</button>)}</div></div>)}</>}
      </>}
      {screen === "stats" && <>{title("Your stats")}{!stats ? <p role="status" className="tt-help">Loading recorded stats...</p> : <>
        <p className="tt-help">Your completed individual stroke-play rounds. Scrambles are excluded. Partial rounds are not included in full-round averages.</p>
        <div className="tt-summary-grid"><div><strong>{stats.rounds}</strong><span>Stroke rounds</span></div><div><strong>{stats.partial}</strong><span>Partial rounds</span></div></div>
        {Object.entries(stats.lengths).map(([length, group]) => <section className="tt-card-stats" key={length}><div className="tt-section-heading"><h2>{length}-hole rounds</h2></div><div className="tt-stat-grid"><div><strong>{group.rounds}</strong><span>Complete rounds</span></div><div><strong>{(group.strokes / group.rounds).toFixed(1)}</strong><span>Average score</span></div><div><strong>{group.best}</strong><span>Best score</span></div></div></section>)}
        <div className="tt-section-heading"><h2>Recorded hole stats</h2></div>
        <div className="tt-stat-grid"><div><strong>{stats.puttHoles ? (stats.putts / stats.puttHoles).toFixed(1) : "--"}</strong><span>Putts per hole</span><small>{stats.puttHoles} holes recorded</small></div><div><strong>{stats.firHoles ? `${Math.round(stats.fairways / stats.firHoles * 100)}%` : "--"}</strong><span>Fairways</span><small>{stats.fairways}/{stats.firHoles} recorded</small></div><div><strong>{stats.girHoles ? `${Math.round(stats.greens / stats.girHoles * 100)}%` : "--"}</strong><span>Greens</span><small>{stats.greens}/{stats.girHoles} recorded</small></div></div>
        <p className="tt-help tt-loading-inline">Missing stats are excluded, not treated as misses or zeros. These are scoring summaries, not an official handicap.</p>
      </>}</>}
      <div className="tt-bottom-space" />
    </main>
    <nav className="tt-bottom-nav" aria-label="Main navigation">{nav.map((item) => <button key={item.id} className={activeNav === item.id ? "active" : ""} aria-current={activeNav === item.id ? "page" : undefined} onClick={() => go(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
    {notice && <div className="tt-toast" role="status"><Icon name="check" size={18} />{notice}</div>}
    {sheet === "guest" && <Modal title="Add guest" close={() => setSheet(null)}>
      {feedback(true)}
      <form onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); act("guest", { name: form.get("name") }, (result) => { const player = result.player; if (!player) { setError("The server did not return the guest."); return; } setData((d) => ({ ...d, players: [...d.players, player] })); setSelectedPlayers((v) => [...v, player.id]); setSheet(null); setNotice("Guest added."); }); }}>
        <label className="tt-field">Name<input name="name" autoComplete="off" maxLength={80} required autoFocus /></label>
        <p className="tt-help">Guests need no account. Scores stay with the round owner.</p>
        <button className="tt-button" disabled={busy}>Add guest</button>
      </form>
    </Modal>}
    {sheet === "finish" && round && <Modal title="Finish round" close={() => setSheet(null)}><p>{isPartial(round) ? "Unplayed holes will stay blank. This will be recorded as a partial round." : "All holes have scores. Finish this round?"}</p><div className="tt-finish-summary">{round.scorers.map((s) => { const total = summarize(round, s.id); return <div key={s.id}><span>{s.name}<small>{total.played} holes scored</small></span><strong>{total.played ? total.strokes : "--"} · {relativeLabel(total.relative)}</strong></div>; })}</div><button className="tt-button" disabled={saver.pending || !Object.keys(round.scores).length} onClick={() => { saver.patch({ finish: true }); setSheet(null); setScreen("card"); }}>Finish round</button><p>Saved rounds can be reopened for corrections.</p></Modal>}
    {sheet === "reload" && <Modal title="Discard unsaved edits?" close={() => setSheet(null)}>
      {feedback(true)}<p>Unconfirmed edits will be replaced by the saved round from the server. Use Retry instead to keep your edits.</p>
      <button className="tt-button" onClick={() => { void saver.reload().then((saved) => { setSheet(null); setNotes(saved?.caption ?? ""); }).catch(showError); }}>Reload saved round</button>
    </Modal>}
    {sheet === "profile" && <Modal title="Profile & settings" close={() => setSheet(null)}>
      {feedback(true)}<p>{data.user.email}</p>
      <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); act("profile", { name: f.get("name"), handle: f.get("handle") }); }}>
        <label className="tt-field">Display name<input name="name" defaultValue={data.user.name} required maxLength={80} /></label>
        <label className="tt-field">Friend handle<input name="handle" defaultValue={data.user.handle ?? ""} required minLength={3} maxLength={40} autoCapitalize="none" /><span className="tt-help">Share your handle so friends can find you.</span></label>
        <button className="tt-button" disabled={busy}>Save profile</button>
      </form>
      <div className="tt-section-heading"><h2>Custom stats</h2></div>
      <p>Definitions are copied into new rounds. Historical stats stay unchanged.</p>
      {data.customStats.map((s) => <div className="tt-custom-stat" key={s.id}><span>{s.label}</span><button className="tt-text-button" disabled={busy} onClick={() => { if (window.confirm(`Remove "${s.label}" from new rounds? Historical values are preserved.`)) act("statDefinition", { id: s.id, deleted: true }); }}>Remove</button></div>)}
      <form onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget, f = new FormData(form); act("statDefinition", { label: f.get("label"), valueType: f.get("valueType") }, () => { form.reset(); void refresh(); }); }}>
        <label className="tt-field">New stat label<input name="label" required maxLength={80} /></label>
        <label className="tt-field">Value type<select name="valueType"><option value="binary">Yes / No</option><option value="integer">Whole number</option></select></label>
        <button className="tt-button tt-button-outline" disabled={busy}>Add stat</button>
      </form>
      <div className="tt-callout subtle"><p>Online saving only. Wait for Saved before closing the app. Only acknowledged saves survive a reload.</p></div>
      <fieldset disabled={saver.pending || busy || retryAction || notes !== (round?.caption ?? "")}><LogoutButton /></fieldset>
    </Modal>}
  </div></div>;
}
