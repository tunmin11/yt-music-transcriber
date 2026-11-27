"use client";

import { useEffect, useState } from "react";
import type { Job, Stage } from "@/lib/types";
import { ResultView } from "./ResultView";

type JobResponse = Job & { queuePosition: number };

const STAGES: { key: Stage; label: string }[] = [
  { key: "downloading", label: "Downloading audio" },
  { key: "decoding", label: "Decoding" },
  { key: "transcribing", label: "Transcribing notes" },
  { key: "chords", label: "Detecting chords & key" },
  { key: "lyrics", label: "Transcribing lyrics" },
];

export function Transcriber() {
  const [url, setUrl] = useState("");
  const [wantLyrics, setWantLyrics] = useState(true);
  const [lyricsAvailable, setLyricsAvailable] = useState<boolean | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((d) => setLyricsAvailable(Boolean(d.lyricsEnabled)))
      .catch(() => setLyricsAvailable(false));
  }, []);

  // Poll the job until it finishes
  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const data = await res.json();
        if (stop) return;
        if (!res.ok) throw new Error(data.error ?? "Job not found");
        setJob(data);
        if (data.status === "done" || data.status === "error") return;
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : String(e));
        return;
      }
      timer = setTimeout(poll, 1000);
    };
    poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setJob(null);
    setJobId(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, lyrics: wantLyrics }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setJobId(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || job?.status === "queued" || job?.status === "running";

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 rounded-md border border-line bg-panel px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-6 py-3 text-sm font-semibold text-background disabled:opacity-50"
          >
            {busy ? "Working…" : "Transcribe"}
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={wantLyrics}
            onChange={(e) => setWantLyrics(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Include lyrics
          {lyricsAvailable === false && <span className="text-xs">(server has no OPENAI_API_KEY — lyrics will be skipped)</span>}
        </label>
      </form>

      {error && <p className="rounded-md border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}

      {job && job.status !== "done" && <Progress job={job} />}

      {job?.status === "done" && job.result && <ResultView jobId={job.id} result={job.result} />}
    </div>
  );
}

function Progress({ job }: { job: JobResponse }) {
  if (job.status === "error") {
    return (
      <p className="rounded-md border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
        Transcription failed: {job.error}
      </p>
    );
  }
  const stages = STAGES.filter((s) => s.key !== "lyrics" || job.wantLyrics);
  const currentIdx = stages.findIndex((s) => s.key === job.stage);
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      {job.status === "queued" ? (
        <p className="text-sm text-muted">
          Queued{job.queuePosition > 0 ? ` — ${job.queuePosition} job(s) ahead` : "…"}
        </p>
      ) : (
        <ol className="space-y-3">
          {stages.map((s, i) => {
            const state = i < currentIdx ? "done" : i === currentIdx ? "active" : "todo";
            return (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    state === "done" ? "bg-accent-2" : state === "active" ? "animate-pulse bg-accent" : "bg-line"
                  }`}
                />
                <span className={state === "todo" ? "text-muted" : ""}>{s.label}</span>
                {state === "active" && job.progress > 0 && (
                  <span className="ml-auto flex items-center gap-2">
                    <span className="h-1.5 w-32 overflow-hidden rounded bg-line">
                      <span className="block h-full bg-accent" style={{ width: `${Math.round(job.progress * 100)}%` }} />
                    </span>
                    <span className="w-9 text-right font-mono text-xs text-muted">{Math.round(job.progress * 100)}%</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
