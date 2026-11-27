"use client";

import { useEffect, useMemo, useRef } from "react";
import { buildSheet, type SheetChord, type SheetLine } from "@/lib/sheet";
import type { ChordSegment, LyricSegment } from "@/lib/types";
import { ChordDiagram } from "./ChordDiagram";

interface Props {
  chords: ChordSegment[];
  lyrics: LyricSegment[] | null;
  lyricsNote: string | null;
  time: number;
  onSeek: (t: number) => void;
  /** maps a detected chord name to what should be displayed (transpose / capo) */
  display: (name: string) => string;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Chords written above the lyric words, synced to playback. */
export function SongSheet({ chords, lyrics, lyricsNote, time, onSeek, display }: Props) {
  const lines = useMemo(() => buildSheet(chords, lyrics), [chords, lyrics]);
  const activeChordStart = useMemo(() => {
    const c = chords.find((c) => c.name !== "N" && time >= c.start && time < c.end);
    return c?.start ?? -1;
  }, [chords, time]);
  const activeLine = useMemo(() => {
    let idx = -1;
    lines.forEach((l, i) => {
      if (time >= l.start - 0.2) idx = i;
    });
    return idx;
  }, [lines, time]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>('[data-active-line="true"]');
    const box = scrollRef.current;
    if (el && box) box.scrollTo({ top: el.offsetTop - box.clientHeight / 3, behavior: "smooth" });
  }, [activeLine]);

  if (lines.length === 0) return <p className="text-sm text-muted">No chords detected.</p>;

  return (
    <div>
      {!lyrics?.length && (
        <p className="mb-3 text-xs text-muted">{lyricsNote ?? "No lyrics"} — showing chords only.</p>
      )}
      <div ref={scrollRef} className="relative max-h-[32rem] space-y-1 overflow-y-auto pr-2">
        {lines.map((line, i) => (
          <Line
            key={`${line.kind}-${line.start}-${i}`}
            line={line}
            active={i === activeLine}
            activeChordStart={activeChordStart}
            onSeek={onSeek}
            display={display}
          />
        ))}
      </div>
    </div>
  );
}

function Line({
  line,
  active,
  activeChordStart,
  onSeek,
  display,
}: {
  line: SheetLine;
  active: boolean;
  activeChordStart: number;
  onSeek: (t: number) => void;
  display: (name: string) => string;
}) {
  const base = `group flex gap-3 rounded-md px-3 py-1.5 transition-colors ${active ? "bg-accent/10" : "hover:bg-background/60"}`;
  const time = (
    <button onClick={() => onSeek(line.start)} className="w-10 shrink-0 pt-6 text-left font-mono text-[11px] text-muted hover:text-foreground">
      {fmt(line.start)}
    </button>
  );

  if (line.kind === "instrumental") {
    return (
      <div className={base} data-active-line={active}>
        <button onClick={() => onSeek(line.start)} className="w-10 shrink-0 text-left font-mono text-[11px] text-muted">
          {fmt(line.start)}
        </button>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="text-xs italic text-muted">instrumental</span>
          {line.chords.map((c, i) => (
            <ChordTag key={i} chord={c} active={c.start === activeChordStart} onSeek={onSeek} display={display} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={base} data-active-line={active}>
      {time}
      <div className="flex flex-wrap items-end gap-x-[0.4em] gap-y-1 text-[15px] leading-snug">
        {line.words.map((w, i) => (
          <span key={i} className="inline-flex flex-col">
            <span className="flex h-6 items-end gap-1.5">
              {w.chords.map((c, j) => (
                <ChordTag key={j} chord={c} active={c.start === activeChordStart} onSeek={onSeek} display={display} />
              ))}
            </span>
            <button
              onClick={() => onSeek(w.start)}
              className={`text-left ${active ? "text-foreground" : "text-foreground/75"} hover:text-accent-2`}
            >
              {w.text}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/** A chord name; hovering shows its guitar diagram. */
function ChordTag({
  chord,
  active,
  onSeek,
  display,
}: {
  chord: SheetChord;
  active: boolean;
  onSeek: (t: number) => void;
  display: (name: string) => string;
}) {
  const name = display(chord.name);
  return (
    <span className="group/chord relative">
      <button
        onClick={() => onSeek(chord.start)}
        className={`rounded px-1 font-mono text-sm font-bold leading-5 transition-colors ${
          active ? "bg-accent text-background" : chord.carried ? "text-accent/50" : "text-accent hover:bg-accent/15"
        }`}
      >
        {name}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 rounded-md border border-line bg-panel p-2 shadow-xl group-hover/chord:block">
        <ChordDiagram name={name} size={64} />
      </span>
    </span>
  );
}
