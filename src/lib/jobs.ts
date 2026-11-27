import { randomUUID } from "node:crypto";
import type { Job } from "./types";

/**
 * In-memory job store + single-worker queue.
 * Transcription is CPU-heavy, so jobs run one at a time.
 * Kept on globalThis so it survives Next.js dev hot reloads.
 * For multiple server instances, swap this for Redis/BullMQ or a database.
 */
interface Store {
  jobs: Map<string, Job>;
  queue: string[];
  running: boolean;
  runner: ((job: Job) => Promise<void>) | null;
}

const g = globalThis as unknown as { __ytmtStore?: Store };
const store: Store = (g.__ytmtStore ??= { jobs: new Map(), queue: [], running: false, runner: null });

const MAX_JOBS = 50;
const JOB_TTL_MS = 6 * 60 * 60 * 1000;

export function setRunner(runner: (job: Job) => Promise<void>) {
  store.runner = runner;
}

export function createJob(url: string, wantLyrics: boolean): Job {
  prune();
  const job: Job = {
    id: randomUUID(),
    url,
    wantLyrics,
    status: "queued",
    stage: "queued",
    progress: 0,
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    result: null,
  };
  store.jobs.set(job.id, job);
  store.queue.push(job.id);
  void pump();
  return job;
}

export function getJob(id: string): Job | undefined {
  return store.jobs.get(id);
}

export function queuePosition(id: string): number {
  return store.queue.indexOf(id);
}

export function updateJob(id: string, patch: Partial<Job>) {
  const job = store.jobs.get(id);
  if (job) Object.assign(job, patch);
}

async function pump() {
  if (store.running || !store.runner) return;
  const id = store.queue.shift();
  if (!id) return;
  const job = store.jobs.get(id);
  if (!job) return pump();
  store.running = true;
  try {
    updateJob(id, { status: "running" });
    await store.runner(job);
    updateJob(id, { status: "done", stage: "done", progress: 1, finishedAt: Date.now() });
  } catch (err) {
    updateJob(id, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      finishedAt: Date.now(),
    });
  } finally {
    store.running = false;
    void pump();
  }
}

function prune() {
  const now = Date.now();
  for (const [id, job] of store.jobs) {
    if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) store.jobs.delete(id);
  }
  if (store.jobs.size > MAX_JOBS) {
    const finished = [...store.jobs.values()]
      .filter((j) => j.finishedAt)
      .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
    for (const j of finished.slice(0, store.jobs.size - MAX_JOBS)) store.jobs.delete(j.id);
  }
}
