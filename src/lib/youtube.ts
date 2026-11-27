import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extracts the 11-char video id from any common YouTube URL form. */
export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (YT_ID.test(trimmed)) return trimmed;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

export interface DownloadResult {
  filePath: string;
  title: string;
  durationSeconds: number;
}

const MAX_DURATION = Number(process.env.MAX_DURATION_SECONDS ?? 900);

/**
 * Downloads the best audio stream of a video with yt-dlp.
 * Requires the `yt-dlp` binary on PATH (or YTDLP_PATH).
 */
export function downloadAudio(
  videoId: string,
  outDir: string,
  onProgress: (p: number) => void,
): Promise<DownloadResult> {
  const bin = process.env.YTDLP_PATH || "yt-dlp";
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--newline",
    "-f",
    "bestaudio/best",
    "--match-filter",
    `duration <= ${MAX_DURATION}`,
    "--print",
    "before_dl:META\t%(title)s\t%(duration)s",
    "--no-simulate",
    "--progress-template",
    "download:PROGRESS\t%(progress._percent_str)s",
    "-o",
    path.join(outDir, "source.%(ext)s"),
    `https://www.youtube.com/watch?v=${videoId}`,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let title = videoId;
    let duration = 0;
    let stderr = "";
    let buf = "";

    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("META\t")) {
          const [, t, d] = line.split("\t");
          title = t || title;
          duration = Number(d) || 0;
        } else if (line.startsWith("PROGRESS\t")) {
          const pct = parseFloat(line.split("\t")[1]);
          if (!Number.isNaN(pct)) onProgress(Math.min(1, pct / 100));
        }
      }
    });
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));

    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "ENOENT"
          ? new Error("yt-dlp is not installed. Install it (e.g. `brew install yt-dlp` or `pip install yt-dlp`) or set YTDLP_PATH.")
          : err,
      );
    });

    child.on("close", async (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp failed (exit ${code}): ${stderr.trim().split("\n").pop() ?? ""}`));
      }
      const files = (await readdir(outDir)).filter((f) => f.startsWith("source."));
      if (files.length === 0) {
        return reject(
          new Error(
            duration > MAX_DURATION
              ? `Video is longer than the ${MAX_DURATION}s limit.`
              : "yt-dlp finished but no audio file was produced (the video may be longer than the limit or unavailable).",
          ),
        );
      }
      resolve({ filePath: path.join(outDir, files[0]), title, durationSeconds: duration });
    });
  });
}
