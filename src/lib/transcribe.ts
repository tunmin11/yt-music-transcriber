import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import * as tf from "@tensorflow/tfjs";
import {
  BasicPitch,
  addPitchBendsToNoteEvents,
  noteFramesToTime,
  outputToNotesPoly,
} from "@spotify/basic-pitch";
import { Midi } from "@tonejs/midi";
import type { Note } from "./types";

const nodeRequire = createRequire(import.meta.url);

/** Resolves an installed package's root folder at runtime (kept opaque to the bundler). */
function packageDir(name: string): string {
  const pkgJson = [name, "package.json"].join("/");
  return path.dirname(nodeRequire.resolve(/*turbopackIgnore: true*/ pkgJson));
}

let backendReady: Promise<string> | null = null;

/**
 * Backend selection (override with TF_BACKEND=tensorflow|wasm|cpu):
 *  1. native TensorFlow (@tensorflow/tfjs-node) if installed — fastest
 *  2. WebAssembly (@tensorflow/tfjs-backend-wasm) — default, no native build needed
 *  3. pure-JS CPU — slowest fallback
 */
function initBackend(): Promise<string> {
  if (!backendReady) {
    backendReady = (async () => {
      const forced = process.env.TF_BACKEND;
      const order = forced ? [forced] : ["tensorflow", "wasm", "cpu"];
      for (const name of order) {
        try {
          if (name === "tensorflow") nodeRequire(/*turbopackIgnore: true*/ "@tensorflow/tfjs-node");
          if (name === "wasm") {
            const wasm = nodeRequire(/*turbopackIgnore: true*/ "@tensorflow/tfjs-backend-wasm");
            const dist = path.join(packageDir("@tensorflow/tfjs-backend-wasm"), "dist");
            wasm.setWasmPaths(dist + path.sep);
            patchWasmFill();
          }
          if (await tf.setBackend(name)) {
            await tf.ready();
            return tf.getBackend();
          }
        } catch {
          // try the next backend
        }
      }
      throw new Error(`No TensorFlow.js backend could be initialised (tried ${order.join(", ")})`);
    })();
  }
  return backendReady;
}

/**
 * tfjs-backend-wasm 3.21's Fill kernel crashes when tf.fill() is called without a dtype
 * (Basic Pitch does this). Re-register it with the same default dtype the CPU backend infers.
 */
function patchWasmFill() {
  const kernel = tf.getKernel("Fill", "wasm");
  if (!kernel || (kernel as { __patched?: boolean }).__patched) return;
  tf.unregisterKernel("Fill", "wasm");
  const patched: tf.KernelConfig & { __patched?: boolean } = {
    ...kernel,
    kernelFunc: (args) => {
      const attrs = args.attrs as unknown as tf.FillAttrs;
      const dtype = attrs.dtype ?? (typeof attrs.value === "string" ? "string" : "float32");
      return kernel.kernelFunc({ ...args, attrs: { ...args.attrs, dtype } });
    },
  };
  patched.__patched = true;
  tf.registerKernel(patched);
}

let modelPromise: Promise<tf.GraphModel> | null = null;

/** Loads the Basic Pitch model shipped inside the npm package from disk. */
function loadModel(): Promise<tf.GraphModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const modelDir = path.join(packageDir("@spotify/basic-pitch"), "model");
      const modelJson = JSON.parse(await readFile(path.join(modelDir, "model.json"), "utf8"));
      const buffers = await Promise.all(
        modelJson.weightsManifest.flatMap((group: { paths: string[] }) =>
          group.paths.map((p) => readFile(path.join(modelDir, p))),
        ),
      );
      const weights = Buffer.concat(buffers);
      const weightData = weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength);
      const handler = tf.io.fromMemory({
        modelTopology: modelJson.modelTopology,
        weightSpecs: modelJson.weightsManifest.flatMap((g: { weights: tf.io.WeightsManifestEntry[] }) => g.weights),
        weightData,
        format: modelJson.format,
        generatedBy: modelJson.generatedBy,
        convertedBy: modelJson.convertedBy,
        signature: modelJson.signature,
        userDefinedMetadata: modelJson.userDefinedMetadata,
      });
      return tf.loadGraphModel(handler);
    })();
  }
  return modelPromise;
}

export interface TranscribeOptions {
  /** Onset confidence threshold (lower = more notes). */
  onsetThreshold?: number;
  /** Frame confidence threshold (lower = longer/more notes). */
  frameThreshold?: number;
  /** Minimum note length in model frames (~11.6 ms each). */
  minNoteFrames?: number;
}

/** Runs Basic Pitch on mono 22050 Hz PCM and returns note events. */
export async function transcribeNotes(
  pcm: Float32Array,
  onProgress: (p: number) => void,
  opts: TranscribeOptions = {},
): Promise<Note[]> {
  await initBackend();
  const basicPitch = new BasicPitch(loadModel());

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  await basicPitch.evaluateModel(
    pcm,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    onProgress,
  );

  const events = noteFramesToTime(
    addPitchBendsToNoteEvents(
      contours,
      outputToNotesPoly(
        frames,
        onsets,
        opts.onsetThreshold ?? 0.5,
        opts.frameThreshold ?? 0.3,
        opts.minNoteFrames ?? 11,
      ),
    ),
  );

  return events
    .map((e) => ({
      start: round(e.startTimeSeconds),
      duration: round(e.durationSeconds),
      pitch: e.pitchMidi,
      velocity: round(Math.min(1, Math.max(0.05, e.amplitude))),
    }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

export function getBackendName(): Promise<string> {
  return initBackend();
}

/** Builds a standard MIDI file (single piano track) from notes. */
export function notesToMidi(notes: Note[], title: string): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.name = title;
  const track = midi.addTrack();
  track.name = "Transcription";
  track.instrument.number = 0; // Acoustic Grand Piano
  for (const n of notes) {
    track.addNote({ midi: n.pitch, time: n.start, duration: n.duration, velocity: n.velocity });
  }
  return midi.toArray();
}

const round = (x: number) => Math.round(x * 1000) / 1000;
