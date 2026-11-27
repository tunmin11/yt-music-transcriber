import { Transcriber } from "@/components/Transcriber";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          YT Music <span className="text-accent">Transcriber</span>
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          Paste a YouTube link and get the notes as MIDI, the chord progression and the lyrics, synced to the video.
        </p>
      </div>
      <Transcriber />
    </main>
  );
}
