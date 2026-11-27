import type { ChordSegment, LyricSegment } from "./types";

/**
 * Builds a chord-over-lyrics song sheet: every chord change is attached to the
 * lyric word being sung when it happens. Chords with no singing over them
 * (intro, solos, outro) become instrumental lines.
 */

export interface SheetChord {
  name: string;
  start: number;
  /** true when the chord started on an earlier line and is still ringing */
  carried?: boolean;
}

export interface SheetWord {
  text: string;
  start: number;
  chords: SheetChord[];
}

export type SheetLine =
  | { kind: "lyric"; start: number; end: number; words: SheetWord[] }
  | { kind: "instrumental"; start: number; end: number; chords: SheetChord[] };

const GAP_SECONDS = 4; // silence between lines that counts as an instrumental break
const LEAD = 0.15; // chords often land just before the syllable
const PICKUP = 1.5; // a chord change this close before a line belongs to that line
const CHORDS_PER_INSTRUMENTAL_LINE = 4;

export function buildSheet(chordSegs: ChordSegment[], lyrics: LyricSegment[] | null): SheetLine[] {
  const chords = chordSegs.filter((c) => c.name !== "N");
  const segs = (lyrics ?? []).filter((l) => l.text.trim()).sort((a, b) => a.start - b.start);
  if (segs.length === 0) return instrumentalLines(chords.map((c) => ({ name: c.name, start: c.start })));

  const lines: SheetLine[] = [];
  let ci = 0;

  // Intro: chords before the first sung line
  const intro: SheetChord[] = [];
  while (ci < chords.length && chords[ci].start < segs[0].start - PICKUP) {
    intro.push({ name: chords[ci].name, start: chords[ci].start });
    ci++;
  }
  lines.push(...instrumentalLines(intro));

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const next = segs[i + 1];
    const hasBreak = next ? next.start - seg.end > GAP_SECONDS : true;
    // A lyric line owns chords up to the next line, or until shortly after it ends if a break follows
    const lineEnd = next && !hasBreak ? next.start - LEAD : seg.end + 1;

    const words = toWords(seg);
    let attached = 0;
    while (ci < chords.length && chords[ci].start < lineEnd) {
      const c = chords[ci++];
      words[wordIndexAt(words, c.start)].chords.push({ name: c.name, start: c.start });
      attached++;
    }
    // Show the chord that is still ringing at the start of the line
    if (words[0].chords.length === 0) {
      const ringing = chordAt(chords, seg.start);
      if (ringing) words[0].chords.unshift({ name: ringing.name, start: ringing.start, carried: attached > 0 });
    }
    lines.push({ kind: "lyric", start: seg.start, end: seg.end, words });

    if (hasBreak) {
      const breakChords: SheetChord[] = [];
      const breakEnd = next ? next.start - PICKUP : Infinity;
      while (ci < chords.length && chords[ci].start < breakEnd) {
        breakChords.push({ name: chords[ci].name, start: chords[ci].start });
        ci++;
      }
      lines.push(...instrumentalLines(breakChords));
    }
  }
  return lines;
}

/** Uses word timings when available, otherwise spreads the words evenly over the line. */
function toWords(seg: LyricSegment): SheetWord[] {
  if (seg.words?.length) {
    return seg.words.map((w) => ({ text: w.word, start: w.start, chords: [] }));
  }
  const parts = seg.text.split(/\s+/).filter(Boolean);
  const span = Math.max(0.1, seg.end - seg.start);
  return parts.map((text, i) => ({ text, start: seg.start + (span * i) / parts.length, chords: [] }));
}

function wordIndexAt(words: SheetWord[], t: number): number {
  let idx = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= t + LEAD) idx = i;
    else break;
  }
  return idx;
}

function chordAt(chords: ChordSegment[], t: number): ChordSegment | undefined {
  return chords.find((c) => c.start <= t + LEAD && c.end > t + LEAD);
}

function instrumentalLines(chords: SheetChord[]): SheetLine[] {
  const out: SheetLine[] = [];
  for (let i = 0; i < chords.length; i += CHORDS_PER_INSTRUMENTAL_LINE) {
    const group = chords.slice(i, i + CHORDS_PER_INSTRUMENTAL_LINE);
    const nextStart = chords[i + CHORDS_PER_INSTRUMENTAL_LINE]?.start;
    out.push({
      kind: "instrumental",
      start: group[0].start,
      end: nextStart ?? group[group.length - 1].start + 2,
      chords: group,
    });
  }
  return out;
}
