"use client";

import { useEffect, useRef } from "react";
import type { TranscriptionResult } from "@/lib/types";
import { PianoRoll } from "./PianoRoll";
import { useYouTubePlayer } from "./useYouTubePlayer";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ResultView({ jobId, result }: { jobId: string; result: TranscriptionResult }) {
  const { containerRef, time, seek } = useYouTubePlayer(result.videoId);
  const chords = result.chords.filter((c) => c.name !== "N");
  const activeChord = chords.findIndex((c) => time >= c.start && time < c.end);
  const activeLyric = result.lyrics?.findIndex((l) => time >= l.start && time < l.end) ?? -1;

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
            {result.key ?? "Unknown key"} · {fmt(result.durationSeconds)} · {result.notes.length} notes · {chords.length} chord changes
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div ref={containerRef} className="aspect-video w-full overflow-hidden rounded-lg border border-line bg-black" />
          <PianoRoll notes={result.notes} chords={result.chords} duration={result.durationSeconds} time={time} onSeek={seek} />
        </div>

        <aside className="space-y-6">
          <Panel title="Chords">
            <ChordSheet chords={chords} active={activeChord} onSeek={seek} />
          </Panel>
          <Panel title="Lyrics">
            {result.lyrics && result.lyrics.length > 0 ? (
              <Lyrics lines={result.lyrics} active={activeLyric} onSeek={seek} />
            ) : (
              <p className="text-sm text-muted">{result.lyricsNote ?? "Lyrics were not requested."}</p>
            )}
          </Panel>
        </aside>
      </div>
      <p className="text-xs text-muted">
        Automatic transcription works best on a single instrument (solo piano, guitar). Full band mixes give rough notes; chords are
        usually more reliable than individual notes.
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

function ChordSheet({
  chords,
  active,
  onSeek,
}: {
  chords: TranscriptionResult["chords"];
  active: number;
  onSeek: (t: number) => void;
}) {
  const ref = useAutoScroll(active);
  if (chords.length === 0) return <p className="text-sm text-muted">No chords detected.</p>;
  return (
    <div ref={ref} className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto pr-1">
      {chords.map((c, i) => (
        <button
          key={`${c.start}-${i}`}
          data-active={i === active}
          onClick={() => onSeek(c.start)}
          title={`${fmt(c.start)} – ${fmt(c.end)}`}
          className={`rounded px-2.5 py-1 font-mono text-sm transition-colors ${
            i === active ? "bg-accent text-background" : "bg-background hover:bg-line"
          }`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

function Lyrics({
  lines,
  active,
  onSeek,
}: {
  lines: NonNullable<TranscriptionResult["lyrics"]>;
  active: number;
  onSeek: (t: number) => void;
}) {
  const ref = useAutoScroll(active);
  return (
    <div ref={ref} className="max-h-96 space-y-1 overflow-y-auto pr-1">
      {lines.map((l, i) => (
        <button
          key={`${l.start}-${i}`}
          data-active={i === active}
          onClick={() => onSeek(l.start)}
          className={`block w-full rounded px-2 py-1 text-left text-sm transition-colors ${
            i === active ? "bg-accent-2/15 text-accent-2" : "text-foreground/80 hover:bg-background"
          }`}
        >
          <span className="mr-2 font-mono text-xs text-muted">{fmt(l.start)}</span>
          {l.text}
        </button>
      ))}
    </div>
  );
}

/** Keeps the active item visible inside a scrolling list. */
function useAutoScroll(active: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);
  return ref;
}
