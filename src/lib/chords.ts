import { Note as TonalNote } from "tonal";
import type { ChordSegment, Note } from "./types";

/**
 * Chord recognition from transcribed notes.
 *
 * 1. Slice the song into short windows and build a 12-bin chroma vector per window
 *    (each note adds overlap × velocity to its pitch class; low notes also feed a bass chroma).
 * 2. Score every window against chord templates (cosine similarity + bass-root bonus).
 * 3. Smooth with a mode filter, merge identical neighbours, absorb very short segments.
 */

const QUALITIES: { suffix: string; intervals: number[]; prior: number }[] = [
  { suffix: "", intervals: [0, 4, 7], prior: 1.0 },
  { suffix: "m", intervals: [0, 3, 7], prior: 1.0 },
  { suffix: "7", intervals: [0, 4, 7, 10], prior: 0.96 },
  { suffix: "maj7", intervals: [0, 4, 7, 11], prior: 0.95 },
  { suffix: "m7", intervals: [0, 3, 7, 10], prior: 0.96 },
  { suffix: "dim", intervals: [0, 3, 6], prior: 0.9 },
  { suffix: "sus4", intervals: [0, 5, 7], prior: 0.9 },
  { suffix: "sus2", intervals: [0, 2, 7], prior: 0.9 },
];

interface Template {
  root: number;
  quality: (typeof QUALITIES)[number];
  vec: number[];
}

const TEMPLATES: Template[] = [];
for (let root = 0; root < 12; root++) {
  for (const quality of QUALITIES) {
    const vec = new Array(12).fill(0);
    for (const iv of quality.intervals) vec[(root + iv) % 12] = 1;
    TEMPLATES.push({ root, quality, vec: normalize(vec) });
  }
}

// Krumhansl–Kessler key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface KeyEstimate {
  tonic: number;
  mode: "major" | "minor";
  name: string;
  useFlats: boolean;
}

export function estimateKey(notes: Note[]): KeyEstimate | null {
  const chroma = new Array(12).fill(0);
  for (const n of notes) chroma[n.pitch % 12] += n.duration * n.velocity;
  if (chroma.every((v) => v === 0)) return null;

  let best = { score: -Infinity, tonic: 0, mode: "major" as "major" | "minor" };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [
      ["major", MAJOR_PROFILE],
      ["minor", MINOR_PROFILE],
    ] as const) {
      const rotated = profile.map((_, i) => profile[(i - tonic + 12) % 12]);
      const score = pearson(chroma, rotated);
      if (score > best.score) best = { score, tonic, mode };
    }
  }
  // Decide sharps vs flats from the relative major's position on the circle of fifths.
  const majorTonic = best.mode === "major" ? best.tonic : (best.tonic + 3) % 12;
  const useFlats = [5, 10, 3, 8, 1].includes(majorTonic); // F Bb Eb Ab Db
  const name = `${pcName(best.tonic, useFlats)} ${best.mode}`;
  return { tonic: best.tonic, mode: best.mode, name, useFlats };
}

export interface ChordOptions {
  windowSeconds?: number;
  minSegmentSeconds?: number;
  useFlats?: boolean;
}

export function detectChords(notes: Note[], durationSeconds: number, opts: ChordOptions = {}): ChordSegment[] {
  const win = opts.windowSeconds ?? 0.5;
  const minSeg = opts.minSegmentSeconds ?? 1.0;
  const useFlats = opts.useFlats ?? false;
  const end = Math.max(durationSeconds, ...notes.map((n) => n.start + n.duration), 0);
  const nWin = Math.ceil(end / win);
  if (nWin === 0) return [];

  const chroma: number[][] = Array.from({ length: nWin }, () => new Array(12).fill(0));
  const bass: number[][] = Array.from({ length: nWin }, () => new Array(12).fill(0));
  const lowest: number[] = new Array(nWin).fill(Infinity);

  for (const n of notes) {
    const nEnd = n.start + n.duration;
    const first = Math.floor(n.start / win);
    const last = Math.min(nWin - 1, Math.floor(nEnd / win));
    for (let w = first; w <= last; w++) {
      const overlap = Math.min(nEnd, (w + 1) * win) - Math.max(n.start, w * win);
      if (overlap <= 0) continue;
      const weight = overlap * n.velocity;
      chroma[w][n.pitch % 12] += weight;
      if (n.pitch < lowest[w]) lowest[w] = n.pitch;
    }
  }
  // Bass chroma: notes within a fifth of the window's lowest note, below middle C.
  for (const n of notes) {
    const nEnd = n.start + n.duration;
    const first = Math.floor(n.start / win);
    const last = Math.min(nWin - 1, Math.floor(nEnd / win));
    for (let w = first; w <= last; w++) {
      if (n.pitch <= Math.min(60, lowest[w] + 7)) {
        const overlap = Math.min(nEnd, (w + 1) * win) - Math.max(n.start, w * win);
        if (overlap > 0) bass[w][n.pitch % 12] += overlap * n.velocity;
      }
    }
  }

  const energies = chroma.map((c) => c.reduce((a, b) => a + b, 0));
  const sorted = [...energies].filter((e) => e > 0).sort((a, b) => a - b);
  const silence = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] * 0.25 : 0;

  // Per-window best label
  const labels: { name: string; score: number }[] = chroma.map((c, w) => {
    if (energies[w] <= silence || energies[w] === 0) return { name: "N", score: 0 };
    const cn = normalize(c);
    const bn = normalize(bass[w]);
    let best = { name: "N", score: -Infinity };
    for (const t of TEMPLATES) {
      let s = dot(cn, t.vec) * t.quality.prior;
      s += 0.15 * bn[t.root]; // bass on the root
      if (s > best.score) best = { name: pcName(t.root, useFlats) + t.quality.suffix, score: s };
    }
    return best;
  });

  // Mode filter over 5 windows to remove flicker
  const smoothed = labels.map((_, i) => {
    const counts = new Map<string, number>();
    for (let j = Math.max(0, i - 2); j <= Math.min(labels.length - 1, i + 2); j++) {
      counts.set(labels[j].name, (counts.get(labels[j].name) ?? 0) + labels[j].score + (j === i ? 0.01 : 0));
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  });

  // Merge runs
  let segs: ChordSegment[] = [];
  for (let i = 0; i < smoothed.length; i++) {
    const name = smoothed[i];
    const last = segs[segs.length - 1];
    if (last && last.name === name) {
      last.end = Math.min(end, (i + 1) * win);
      last.confidence += labels[i].score;
    } else {
      segs.push({ start: i * win, end: Math.min(end, (i + 1) * win), name, confidence: labels[i].score });
    }
  }

  // Absorb short segments into the longer neighbour
  let changed = true;
  while (changed && segs.length > 1) {
    changed = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.end - s.start >= minSeg) continue;
      const prev = segs[i - 1];
      const next = segs[i + 1];
      const target = !prev ? next : !next ? prev : prev.end - prev.start >= next.end - next.start ? prev : next;
      target.start = Math.min(target.start, s.start);
      target.end = Math.max(target.end, s.end);
      target.confidence += s.confidence;
      segs.splice(i, 1);
      changed = true;
      break;
    }
    // re-merge identical neighbours created by absorption
    segs = segs.reduce<ChordSegment[]>((acc, s) => {
      const last = acc[acc.length - 1];
      if (last && last.name === s.name) {
        last.end = s.end;
        last.confidence += s.confidence;
      } else acc.push({ ...s });
      return acc;
    }, []);
  }

  return segs.map((s) => ({
    start: r3(s.start),
    end: r3(s.end),
    name: s.name,
    confidence: r3(Math.min(1, s.confidence / Math.max(1, (s.end - s.start) / win))),
  }));
}

function pcName(pc: number, useFlats: boolean): string {
  const n = useFlats ? TonalNote.fromMidi(60 + pc) : TonalNote.fromMidiSharps(60 + pc);
  return TonalNote.pitchClass(n);
}

function normalize(v: number[]): number[] {
  const m = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  return m === 0 ? v.map(() => 0) : v.map((x) => x / m);
}
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
function pearson(a: number[], b: number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;
