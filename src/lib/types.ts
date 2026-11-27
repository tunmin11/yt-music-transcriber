export type JobStatus = "queued" | "running" | "done" | "error";

export type Stage =
  | "queued"
  | "downloading"
  | "decoding"
  | "transcribing"
  | "chords"
  | "lyrics"
  | "done";

export interface Note {
  /** start time in seconds */
  start: number;
  /** duration in seconds */
  duration: number;
  /** MIDI pitch number (21 = A0, 108 = C8) */
  pitch: number;
  /** 0..1 */
  velocity: number;
}

export interface ChordSegment {
  start: number;
  end: number;
  /** e.g. "Am", "G7", "Cmaj7", or "N" for no chord */
  name: string;
  confidence: number;
}

export interface LyricWord {
  start: number;
  end: number;
  word: string;
}

export interface LyricSegment {
  start: number;
  end: number;
  text: string;
  /** Word-level timing, when the speech-to-text API provides it */
  words?: LyricWord[];
}

export interface TranscriptionResult {
  title: string;
  videoId: string;
  durationSeconds: number;
  key: string | null;
  notes: Note[];
  chords: ChordSegment[];
  lyrics: LyricSegment[] | null;
  /** Why lyrics are missing, if they are */
  lyricsNote: string | null;
}

export interface Job {
  id: string;
  url: string;
  wantLyrics: boolean;
  status: JobStatus;
  stage: Stage;
  /** 0..1 within the current stage */
  progress: number;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  result: TranscriptionResult | null;
}

/** Shape returned to the client (without heavy fields when not needed). */
export type PublicJob = Omit<Job, "result"> & { result: TranscriptionResult | null };
