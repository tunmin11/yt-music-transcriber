import { readFile } from "node:fs/promises";
import type { LyricSegment } from "./types";

/**
 * Lyrics via an OpenAI-compatible speech-to-text endpoint (Whisper).
 * Works with OpenAI, or any compatible API (e.g. Groq) via OPENAI_BASE_URL.
 *
 * Env:
 *   OPENAI_API_KEY            required to enable lyrics
 *   OPENAI_BASE_URL           default https://api.openai.com/v1
 *   OPENAI_TRANSCRIBE_MODEL   default whisper-1 (must support verbose_json segments)
 */
export function lyricsEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function transcribeLyrics(mp3Path: string, language?: string): Promise<LyricSegment[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";

  const audio = await readFile(mp3Path);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (language) form.append("language", language);

  const res = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Speech-to-text request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    text?: string;
    segments?: { start: number; end: number; text: string }[];
  };
  if (json.segments?.length) {
    return json.segments
      .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
      .filter((s) => s.text.length > 0);
  }
  return json.text ? [{ start: 0, end: 0, text: json.text.trim() }] : [];
}
