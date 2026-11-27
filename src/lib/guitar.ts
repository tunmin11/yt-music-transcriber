/**
 * Guitar chord helpers: parse / transpose chord names and find a playable
 * fingering (open shape when one exists, otherwise an E- or A-shape barre).
 *
 * Frets are listed low E → high e. -1 = muted string, 0 = open string.
 */

export type Frets = [number, number, number, number, number, number];

export interface GuitarShape {
  frets: Frets;
  /** first fret shown in the diagram (1 = nut is visible) */
  baseFret: number;
  /** fret + string range for a barre, if any */
  barre: { fret: number; from: number; to: number } | null;
  open: boolean;
}

const PCS: Record<string, number> = {
  C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, F: 5, "E#": 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11,
};
const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export interface ParsedChord {
  root: number;
  suffix: string;
  flats: boolean;
}

export function parseChord(name: string): ParsedChord | null {
  const m = name.match(/^([A-G][#b]?)(.*)$/);
  if (!m || PCS[m[1]] === undefined) return null;
  return { root: PCS[m[1]], suffix: m[2], flats: m[1].includes("b") };
}

export function chordName(root: number, suffix: string, flats: boolean): string {
  return (flats ? FLATS : SHARPS)[((root % 12) + 12) % 12] + suffix;
}

/** Transposes a chord name by `semitones`, keeping its sharp/flat spelling. */
export function transposeChord(name: string, semitones: number, preferFlats?: boolean): string {
  const p = parseChord(name);
  if (!p) return name;
  return chordName(p.root + semitones, p.suffix, preferFlats ?? p.flats);
}

// Common open-position voicings, keyed by sharp spelling.
const OPEN: Record<string, string> = {
  C: "x32010", A: "x02220", G: "320003", E: "022100", D: "xx0232",
  Am: "x02210", Em: "022000", Dm: "xx0231",
  C7: "x32310", A7: "x02020", G7: "320001", E7: "020100", D7: "xx0212", B7: "x21202",
  Cmaj7: "x32000", Amaj7: "x02120", Gmaj7: "320002", Emaj7: "021100", Dmaj7: "xx0222", Fmaj7: "xx3210",
  Am7: "x02010", Em7: "020000", Dm7: "xx0211",
  Asus4: "x02230", Dsus4: "xx0233", Esus4: "022200",
  Asus2: "x02200", Dsus2: "xx0230", Csus2: "x30013",
  Bdim: "x2343x",
};

// Movable shapes as offsets from the root fret r (null = muted).
type Movable = (number | null)[];
const E_SHAPES: Record<string, Movable> = {
  "": [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  "7": [0, 2, 0, 1, 0, 0],
  maj7: [0, null, 1, 1, 0, null],
  m7: [0, 2, 0, 0, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0],
};
const A_SHAPES: Record<string, Movable> = {
  "": [null, 0, 2, 2, 2, 0],
  m: [null, 0, 2, 2, 1, 0],
  "7": [null, 0, 2, 0, 2, 0],
  maj7: [null, 0, 2, 1, 2, 0],
  m7: [null, 0, 2, 0, 1, 0],
  dim: [null, 0, 1, 2, 1, null],
  sus4: [null, 0, 2, 2, 3, 0],
  sus2: [null, 0, 2, 2, 0, 0],
};

/** Returns a playable fingering for a chord name, or null if unknown. */
export function guitarShape(name: string): GuitarShape | null {
  const p = parseChord(name);
  if (!p) return null;
  const key = chordName(p.root, p.suffix, false);
  if (OPEN[key]) return fromFrets(parseFretString(OPEN[key]), true);

  const candidates: Frets[] = [];
  for (const [shapes, openPc] of [
    [E_SHAPES, 4],
    [A_SHAPES, 9],
  ] as const) {
    const shape = shapes[p.suffix];
    if (!shape) continue;
    let r = (p.root - openPc + 12) % 12;
    if (r === 0) r = 12; // open version is handled by OPEN; use the octave barre
    candidates.push(shape.map((o) => (o === null ? -1 : r + o)) as Frets);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => minFret(a) - minFret(b));
  return fromFrets(candidates[0], false);
}

function parseFretString(s: string): Frets {
  return s.split("").map((c) => (c === "x" ? -1 : Number(c))) as Frets;
}

const minFret = (f: Frets) => Math.min(...f.filter((x) => x > 0));

function fromFrets(frets: Frets, open: boolean): GuitarShape {
  const fretted = frets.filter((f) => f > 0);
  const max = Math.max(0, ...fretted);
  const min = fretted.length ? Math.min(...fretted) : 1;
  const baseFret = max <= 4 ? 1 : min;

  // Barre: the lowest fret is held across 3+ strings with nothing lower in between
  let barre: GuitarShape["barre"] = null;
  if (!open && fretted.length) {
    const idx = frets.map((f, i) => (f === min ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 2) {
      const from = idx[0];
      const to = idx[idx.length - 1];
      const clean = frets.slice(from, to + 1).every((f) => f === -1 || f >= min);
      if (clean && to - from >= 2) barre = { fret: min, from, to };
    }
  }
  return { frets, baseFret, barre, open };
}

/** True when a chord needs a barre (harder for beginners). */
export function isBarreChord(name: string): boolean {
  const s = guitarShape(name);
  return !s || !s.open;
}

/**
 * Picks the capo position (0–7) that makes the song easiest:
 * the fewest seconds spent on barre or unknown chord shapes.
 */
export function suggestCapo(chords: { name: string; start: number; end: number }[], transpose = 0): number {
  let best = { capo: 0, cost: Infinity };
  for (let capo = 0; capo <= 7; capo++) {
    let cost = capo * 0.5; // slight preference for lower capo
    for (const c of chords) {
      if (c.name === "N") continue;
      if (isBarreChord(transposeChord(c.name, transpose - capo, false))) cost += c.end - c.start;
    }
    if (cost < best.cost) best = { capo, cost };
  }
  return best.capo;
}
