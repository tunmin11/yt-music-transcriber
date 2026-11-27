"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChordSegment, Note } from "@/lib/types";

interface Props {
  notes: Note[];
  chords: ChordSegment[];
  duration: number;
  time: number;
  onSeek: (t: number) => void;
}

const KEY_W = 36;
const CHORD_H = 22;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(p % 12);

/** Canvas piano roll showing a window of time around the playhead. */
export function PianoRoll({ notes, chords, duration, time, onSeek }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [windowSec, setWindowSec] = useState(8);
  const height = 360;

  const [lo, hi] = useMemo(() => {
    if (notes.length === 0) return [48, 72];
    let min = 127, max = 0;
    for (const n of notes) {
      if (n.pitch < min) min = n.pitch;
      if (n.pitch > max) max = n.pitch;
    }
    return [Math.max(21, min - 2), Math.min(108, max + 2)];
  }, [notes]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Window start keeps the playhead at 25% of the view.
  const viewStart = Math.max(0, Math.min(time - windowSec * 0.25, Math.max(0, duration - windowSec)));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rollW = width - KEY_W;
    const rollH = height - CHORD_H;
    const rows = hi - lo + 1;
    const rowH = rollH / rows;
    const pxPerSec = rollW / windowSec;
    const x = (t: number) => KEY_W + (t - viewStart) * pxPerSec;
    const y = (p: number) => CHORD_H + (hi - p) * rowH;

    ctx.fillStyle = "#101216";
    ctx.fillRect(0, 0, width, height);

    // rows + keyboard
    for (let p = lo; p <= hi; p++) {
      ctx.fillStyle = isBlack(p) ? "#0d0f12" : "#14171c";
      ctx.fillRect(KEY_W, y(p), rollW, rowH);
      ctx.fillStyle = isBlack(p) ? "#2a2d35" : "#d9d6cf";
      ctx.fillRect(0, y(p), KEY_W - 2, rowH - 0.5);
      if (p % 12 === 0 && rowH >= 7) {
        ctx.fillStyle = "#4b4f59";
        ctx.font = `${Math.min(10, rowH)}px ui-monospace, monospace`;
        ctx.fillText(`C${Math.floor(p / 12) - 1}`, 3, y(p) + rowH - 1);
      }
    }

    // beat-ish grid every second
    ctx.strokeStyle = "#1f2229";
    ctx.lineWidth = 1;
    for (let s = Math.ceil(viewStart); s < viewStart + windowSec; s++) {
      ctx.beginPath();
      ctx.moveTo(x(s), CHORD_H);
      ctx.lineTo(x(s), height);
      ctx.stroke();
    }

    // chord lane
    ctx.fillStyle = "#0c0d10";
    ctx.fillRect(KEY_W, 0, rollW, CHORD_H);
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    for (const c of chords) {
      if (c.end < viewStart || c.start > viewStart + windowSec || c.name === "N") continue;
      const active = time >= c.start && time < c.end;
      const x0 = Math.max(KEY_W, x(c.start));
      ctx.fillStyle = active ? "#f5b942" : "#262932";
      ctx.fillRect(x0 + 1, 3, Math.max(0, x(c.end) - x0 - 2), CHORD_H - 6);
      ctx.fillStyle = active ? "#0c0d10" : "#e8e6e3";
      ctx.fillText(c.name, x0 + 5, CHORD_H - 7);
    }

    // notes
    for (const n of notes) {
      const end = n.start + n.duration;
      if (end < viewStart || n.start > viewStart + windowSec) continue;
      const playing = time >= n.start && time < end;
      const alpha = 0.45 + 0.55 * n.velocity;
      ctx.fillStyle = playing ? `rgba(245,185,66,${alpha})` : `rgba(94,196,182,${alpha})`;
      const nx = Math.max(KEY_W, x(n.start));
      ctx.fillRect(nx, y(n.pitch) + 0.5, Math.max(2, x(end) - nx), Math.max(1.5, rowH - 1));
      if (playing) {
        ctx.fillStyle = "#f5b942";
        ctx.fillRect(0, y(n.pitch), KEY_W - 2, rowH - 0.5);
      }
    }

    // playhead
    ctx.strokeStyle = "#f5b942";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(time), 0);
    ctx.lineTo(x(time), height);
    ctx.stroke();
  }, [notes, chords, width, windowSec, viewStart, time, lo, hi]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - KEY_W;
    if (px < 0) return;
    onSeek(Math.max(0, viewStart + (px / (width - KEY_W)) * windowSec));
  };

  const hovered = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rowH = (height - CHORD_H) / (hi - lo + 1);
    const p = hi - Math.floor((e.clientY - rect.top - CHORD_H) / rowH);
    e.currentTarget.title = p >= lo && p <= hi ? `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}` : "";
  };

  return (
    <div className="space-y-2">
      <div ref={wrapRef} className="w-full overflow-hidden rounded-lg border border-line">
        <canvas
          ref={canvasRef}
          style={{ width, height, display: "block", cursor: "pointer" }}
          onClick={handleClick}
          onMouseMove={hovered}
        />
      </div>
      <label className="flex items-center gap-3 text-xs text-muted">
        Zoom
        <input
          type="range"
          min={3}
          max={30}
          value={windowSec}
          onChange={(e) => setWindowSec(Number(e.target.value))}
          className="w-40 accent-[var(--accent)]"
        />
        <span className="font-mono">{windowSec}s view</span>
      </label>
    </div>
  );
}
