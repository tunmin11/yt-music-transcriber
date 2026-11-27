"use client";

import { useMemo, useState } from "react";
import { suggestCapo, transposeChord } from "@/lib/guitar";
import type { TranscriptionResult } from "@/lib/types";
import { ChordDiagram } from "./ChordDiagram";
import { PianoRoll } from "./PianoRoll";
import { SongSheet } from "./SongSheet";
import { useYouTubePlayer } from "./useYouTubePlayer";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ResultView({ jobId, result }: { jobId: string; result: TranscriptionResult }) {
  const { containerRef, time, seek } = useYouTubePlayer(result.videoId);
  const [transpose, setTranspose] = useState(0);
  const [capo, setCapo] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const chords = useMemo(() => result.chords.filter((c) => c.name !== "N"), [result.chords]);
  const keyFlats = useMemo(() => /\b[A-G]b\b/.test(result.key ?? "") || chords.some((c) => /^[A-G]b/.test(c.name)), [result.key, chords]);

  /** Sounding chord after transpose, then the shape you play with the capo on. */
  const display = useMemo(
    () => (name: string) => transposeChord(name, transpose - capo, capo > 0 ? false : keyFlats),
    [transpose, capo, keyFlats],
  );
  const suggested = useMemo(() => suggestCapo(chords, transpose), [chords, transpose]);

  // Unique chord shapes in order of first appearance
  const used = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of chords) {
      const n = display(c.name);
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
    return out;
  }, [chords, display]);
  const activeChord = chords.find((c) => time >= c.start && time < c.end);
  const activeName = activeChord ? display(activeChord.name) : null;

  const keyLabel = result.key
    ? `${transposeChord(result.key.split(" ")[0], transpose, keyFlats)} ${result.key.split(" ")[1] ?? ""}`.trim()
    : "Unknown key";

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${result.title.replace(/[^\w\- ]+/g, "").trim() || "transcription"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{result.title}</h2>
          <p className="mt-1 text-sm text-muted">
            Key: {keyLabel} · {fmt(result.durationSeconds)} · {chords.length} chord changes
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/jobs/${jobId}/midi`}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background hover:brightness-110"
          >
            Download MIDI
          </a>
          <button onClick={downloadJson} className="rounded-md border border-line px-4 py-2 text-sm hover:bg-panel">
            JSON
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div ref={containerRef} className="aspect-video w-full overflow-hidden rounded-lg border border-line bg-black" />

        <Panel title="Guitar">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stepper label="Transpose" value={transpose} onChange={setTranspose} min={-11} max={11} format={(v) => (v > 0 ? `+${v}` : `${v}`)} />
              <Stepper label="Capo" value={capo} onChange={setCapo} min={0} max={9} format={(v) => (v === 0 ? "none" : `fret ${v}`)} />
            </div>
            {suggested !== capo && (
              <button
                onClick={() => setCapo(suggested)}
                className="w-full rounded-md border border-dashed border-accent/40 px-3 py-2 text-left text-xs text-muted hover:border-accent hover:text-foreground"
              >
                Easier shapes: <span className="font-semibold text-accent">{suggested === 0 ? "no capo" : `capo ${suggested}`}</span>
              </button>
            )}
            {capo > 0 && <p className="text-xs text-muted">Chord names below are the shapes you play with the capo on fret {capo}.</p>}
            <div className="grid max-h-80 grid-cols-4 gap-x-0 gap-y-2 overflow-y-auto">
              {used.map((n) => (
                <ChordDiagram key={n} name={n} size={68} active={n === activeName} />
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Chords + lyrics">
        <SongSheet
          chords={result.chords}
          lyrics={result.lyrics}
          lyricsNote={result.lyricsNote}
          time={time}
          onSeek={seek}
          display={display}
        />
      </Panel>

      <div>
        <button onClick={() => setShowNotes((v) => !v)} className="mb-3 text-sm text-muted hover:text-foreground">
          {showNotes ? "▾" : "▸"} Notes (piano roll, {result.notes.length} notes)
        </button>
        {showNotes && (
          <PianoRoll notes={result.notes} chords={result.chords} duration={result.durationSeconds} time={time} onSeek={seek} />
        )}
      </div>

      <p className="text-xs text-muted">
        Chords and lyrics are detected automatically, so expect some mistakes. They are most accurate on clear recordings with one or two instruments.
      </p>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {children}
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  format: (v: number) => string;
}) {
  const btn = "h-7 w-7 rounded border border-line text-base leading-none hover:bg-background disabled:opacity-30";
  return (
    <div>
      <div className="mb-1 text-xs text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <button className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`${label} down`}>
          −
        </button>
        <span className="min-w-12 text-center font-mono text-sm">{format(value)}</span>
        <button className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`${label} up`}>
          +
        </button>
      </div>
    </div>
  );
}
