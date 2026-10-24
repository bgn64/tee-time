"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Player } from "@/lib/golf-model.mts";

type IconName = "home" | "flag" | "courses" | "friends" | "plus" | "arrow" | "back" | "search" | "pin" | "heart" | "comment" | "close" | "check" | "stats" | "settings";

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />,
    flag: <><path d="M5 22V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0" /><path d="M2 22h6" /></>,
    courses: <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16" />,
    friends: <><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 14 0v3m0-17a3 3 0 0 1 0 6m4 11v-4a6 6 0 0 0-3-5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    back: <path d="m14 5-7 7 7 7" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    pin: <><path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z" /><circle cx="12" cy="9" r="2" /></>,
    heart: <path d="M12 21 3.5 13a5.5 5.5 0 0 1 8.5-7 5.5 5.5 0 0 1 8.5 7Z" />,
    comment: <path d="M21 11a9 9 0 0 1-9 9H4l-2 2 1-7a9 9 0 1 1 18-4Z" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    stats: <path d="M4 21V11m8 10V3m8 18V7" />,
    settings: <><path d="M3 6h18M3 18h18" /><circle cx="8" cy="6" r="3" /><circle cx="16" cy="18" r="3" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Avatar({ player, small = false }: { player: Player; small?: boolean }) {
  return <span className={`tt-avatar ${player.color} ${small ? "small" : ""}`} aria-label={player.name}>{player.initials}</span>;
}

export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="tt-dialog" aria-labelledby="tt-dialog-title" onCancel={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="tt-sheet">
      <div className="tt-sheet-handle" />
      <div className="tt-section-heading"><h2 id="tt-dialog-title">{title}</h2><button className="tt-icon-button" onClick={close} aria-label="Close dialog"><Icon name="close" /></button></div>
      {children}
    </div>
  </dialog>;
}

export function CourseArt({ className = "", description = "Illustrated fairway winding through a quiet pine forest" }: { className?: string; description?: string }) {
  return <div className={`tt-course-art ${className}`} role="img" aria-label={description} />;
}
