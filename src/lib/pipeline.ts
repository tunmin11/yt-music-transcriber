import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decodeToMonoPcm, encodeSpeechMp3, MODEL_SAMPLE_RATE } from "./audio";
import { detectChords, estimateKey } from "./chords";
import { createJob, setRunner, updateJob } from "./jobs";
import { lyricsEnabled, transcribeLyrics } from "./lyrics";
import { transcribeNotes } from "./transcribe";
import type { Job, TranscriptionResult } from "./types";
import { downloadAudio, parseYouTubeId } from "./youtube";

export interface PipelineInput {
  /** Path to a local audio file (skips the YouTube download). */
  localFile?: string;
  videoId?: string;
  wantLyrics: boolean;
  title?: string;
}

type Progress = (stage: Job["stage"], progress: number) => void;

/** The whole pipeline, independent of the job queue (also used by scripts/transcribe.ts). */
export async function runPipeline(input: PipelineInput, report: Progress): Promise<TranscriptionResult> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "ytmt-"));
  try {
    let sourcePath = input.localFile;
    let title = input.title ?? (input.localFile ? path.basename(input.localFile) : "Untitled");
    if (!sourcePath) {
      if (!input.videoId) throw new Error("No video id or local file given");
      report("downloading", 0);
      const dl = await downloadAudio(input.videoId, workDir, (p) => report("downloading", p));
      sourcePath = dl.filePath;
      title = dl.title;
    }

    report("decoding", 0);
    const pcm = await decodeToMonoPcm(sourcePath);
    const durationSeconds = pcm.length / MODEL_SAMPLE_RATE;

    report("transcribing", 0);
    const notes = await transcribeNotes(pcm, (p) => report("transcribing", p));

    report("chords", 0);
    const key = estimateKey(notes);
    const chords = detectChords(notes, durationSeconds, { useFlats: key?.useFlats });

    let lyrics: TranscriptionResult["lyrics"] = null;
    let lyricsNote: string | null = null;
    if (input.wantLyrics) {
      if (!lyricsEnabled()) {
        lyricsNote = "Lyrics are disabled: set OPENAI_API_KEY on the server to enable them.";
      } else {
        report("lyrics", 0);
        const mp3 = path.join(workDir, "speech.mp3");
        await encodeSpeechMp3(sourcePath, mp3);
        try {
          lyrics = await transcribeLyrics(mp3);
          if (lyrics.length === 0) lyricsNote = "No vocals detected.";
        } catch (err) {
          lyricsNote = err instanceof Error ? err.message : String(err);
        }
      }
    }

    return {
      title,
      videoId: input.videoId ?? "",
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      key: key?.name ?? null,
      notes,
      chords,
      lyrics,
      lyricsNote,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

setRunner(async (job) => {
  const videoId = parseYouTubeId(job.url);
  if (!videoId) throw new Error("Not a valid YouTube URL");
  const result = await runPipeline({ videoId, wantLyrics: job.wantLyrics }, (stage, progress) =>
    updateJob(job.id, { stage, progress }),
  );
  updateJob(job.id, { result });
});

export { createJob };
