# YT Music Transcriber

Paste a YouTube link → get a **guitar chord sheet with the chords above the lyrics**, chord diagrams, the **notes as MIDI**, and the key, all synced to the video.

Next.js (App Router) + a Node.js transcription pipeline. No Python needed.

```
YouTube URL ─► yt-dlp ─► ffmpeg (mono 22.05 kHz) ─► Basic Pitch (TF.js) ─► notes ─► MIDI
                                   │                                     └──► chord + key detection
                                   └──► 16 kHz mp3 ─► Whisper API ─► timed lyrics
```

## Features

- **Chords over lyrics**: each chord change is placed above the word being sung when it happens (uses Whisper word timestamps). Intros, solos and outros show as instrumental lines. The current line and chord follow the video; click any chord or word to jump there.
- **Guitar chord diagrams** for every chord in the song (open shapes where possible, otherwise E/A-shape barres). Hover a chord in the sheet to see its shape.
- **Transpose and capo**: shift the key, put a capo on, and the sheet shows the shapes you actually play. "Easier shapes" suggests the capo position that avoids the most barre chords.

- **Notes → MIDI** with Spotify's [Basic Pitch](https://github.com/spotify/basic-pitch-ts) (polyphonic, instrument-agnostic).
- **Chords & key**: chroma template matching (major, minor, 7, maj7, m7, dim, sus2, sus4) with bass-root weighting and smoothing; key via Krumhansl–Kessler profiles.
- **Lyrics** (optional): any OpenAI-compatible speech-to-text endpoint (OpenAI Whisper, Groq, …), with timestamps.
- **Synced player**: embedded YouTube video, piano roll with playhead, clickable chord sheet and lyrics. Click anywhere to seek.
- Job queue with progress, MIDI/JSON download, and a CLI.

## Requirements

- Node.js 20+
- [`ffmpeg`](https://ffmpeg.org/) and [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on your PATH
  ```bash
  brew install ffmpeg yt-dlp        # macOS
  # or: pip install yt-dlp && apt install ffmpeg
  ```

## Getting started

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY if you want lyrics
npm run dev                  # http://localhost:3000
```

### CLI

```bash
npm run transcribe -- ./song.mp3 --midi song.mid --json song.json
npm run transcribe -- "https://youtu.be/VIDEO_ID" --lyrics --midi out.mid
```

## Performance

Inference runs on TensorFlow.js. The fastest available backend is picked automatically:

| Backend | How | Speed (approx.) |
| --- | --- | --- |
| `tensorflow` (native) | `npm i @tensorflow/tfjs-node@3.21.1` (optional) | fastest |
| `wasm` (default) | bundled | ~10 s per 1 min of audio on 2 vCPU |
| `cpu` | pure JS fallback | ~12× slower than wasm |

Force one with `TF_BACKEND=wasm|cpu|tensorflow`.

## Accuracy notes

- Basic Pitch works best on **one instrument** (solo piano/guitar/vocals). Full band mixes produce rough note output; chords are usually more reliable than individual notes.
- Lyrics are transcribed from the full mix, so heavy instrumentation lowers accuracy.
- Upgrade ideas: stem separation (Demucs) before transcription, or a stronger multi-instrument model (e.g. MuScriptor / YourMT3+) behind the same `transcribeNotes()` interface.

## Deploy

The pipeline is long-running and CPU-bound, so run it on a normal server or container rather than serverless functions.

```bash
docker build -t yt-music-transcriber .
docker run -p 3000:3000 -e OPENAI_API_KEY=sk-... yt-music-transcriber
```

Jobs are kept in memory and run one at a time. For multiple instances, replace `src/lib/jobs.ts` with Redis/BullMQ (or SQS + a worker).

## Project layout

```
src/
  app/
    page.tsx                     UI entry
    api/jobs/route.ts            POST create job · GET server capabilities
    api/jobs/[id]/route.ts       GET job status + result
    api/jobs/[id]/midi/route.ts  GET .mid download
  components/                    Transcriber, ResultView, SongSheet, ChordDiagram, PianoRoll, YouTube player hook
  lib/
    pipeline.ts                  orchestrates the stages
    youtube.ts                   URL parsing + yt-dlp download
    audio.ts                     ffmpeg decode/encode
    transcribe.ts                Basic Pitch inference + MIDI export
    chords.ts                    chord & key detection
    guitar.ts                    chord shapes, transpose, capo suggestion
    sheet.ts                     aligns chords to lyric words
    lyrics.ts                    Whisper API client
    jobs.ts                      in-memory job queue
scripts/transcribe.ts            CLI
```

## Legal

Downloading YouTube audio may be against YouTube's Terms of Service and the rights of the copyright holder. Use this for personal study of music you have the right to use.
