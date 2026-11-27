import { spawn } from "node:child_process";

const ffmpegBin = () => process.env.FFMPEG_PATH || "ffmpeg";

function runFfmpeg(args: string[], collectStdout: boolean): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ ffmpegBin(), args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    if (collectStdout) child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "ENOENT" ? new Error("ffmpeg is not installed or not on PATH (set FFMPEG_PATH).") : err),
    );
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg failed (exit ${code}): ${stderr.trim().split("\n").pop()}`));
      else resolve(Buffer.concat(chunks));
    });
  });
}

/** Basic Pitch expects mono float32 PCM at 22050 Hz. */
export const MODEL_SAMPLE_RATE = 22050;

/** Decodes any audio file to mono Float32Array at the given sample rate. */
export async function decodeToMonoPcm(inputPath: string, sampleRate = MODEL_SAMPLE_RATE): Promise<Float32Array> {
  const buf = await runFfmpeg(
    ["-hide_banner", "-loglevel", "error", "-i", inputPath, "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "pipe:1"],
    true,
  );
  // Copy into an aligned ArrayBuffer (Buffer may be a view at an unaligned offset).
  const aligned = new ArrayBuffer(buf.byteLength - (buf.byteLength % 4));
  new Uint8Array(aligned).set(buf.subarray(0, aligned.byteLength));
  return new Float32Array(aligned);
}

/** Small mono MP3 for speech-to-text APIs (well under the 25 MB upload limit). */
export async function encodeSpeechMp3(inputPath: string, outPath: string): Promise<void> {
  await runFfmpeg(
    ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-ac", "1", "-ar", "16000", "-b:a", "32k", outPath],
    false,
  );
}
