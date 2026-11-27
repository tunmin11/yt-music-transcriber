/**
 * CLI: transcribe a local audio file or a YouTube URL without the web UI.
 *
 *   npm run transcribe -- ./song.mp3
 *   npm run transcribe -- "https://youtu.be/VIDEO_ID" --lyrics --midi out.mid
 */
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { runPipeline } from "../src/lib/pipeline";
import { getBackendName, notesToMidi } from "../src/lib/transcribe";
import { parseYouTubeId } from "../src/lib/youtube";

async function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--"));
  if (!input) {
    console.error("Usage: npm run transcribe -- <file|youtube-url> [--lyrics] [--midi out.mid] [--json out.json]");
    process.exit(1);
  }
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const isFile = existsSync(input);
  const videoId = isFile ? undefined : parseYouTubeId(input) ?? undefined;
  if (!isFile && !videoId) throw new Error(`Not a file or YouTube URL: ${input}`);

  console.error(`backend: ${await getBackendName()}`);
  const t0 = Date.now();
  let lastStage = "";
  const result = await runPipeline(
    { localFile: isFile ? input : undefined, videoId, wantLyrics: args.includes("--lyrics") },
    (stage, p) => {
      if (stage !== lastStage) {
        lastStage = stage;
        console.error(`\n[${stage}]`);
      }
      process.stderr.write(`\r  ${(p * 100).toFixed(0)}%`);
    },
  );
  console.error(`\n\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.error(`title: ${result.title}\nkey: ${result.key}\nnotes: ${result.notes.length}`);
  console.error(`chords: ${result.chords.map((c) => `${c.name}@${c.start.toFixed(1)}`).join("  ")}`);
  if (result.lyrics) console.error(`lyrics:\n${result.lyrics.map((l) => `  [${l.start.toFixed(1)}] ${l.text}`).join("\n")}`);
  if (result.lyricsNote) console.error(`lyrics note: ${result.lyricsNote}`);

  const midiOut = flag("--midi");
  if (midiOut) await writeFile(midiOut, notesToMidi(result.notes, result.title));
  const jsonOut = flag("--json");
  if (jsonOut) await writeFile(jsonOut, JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
