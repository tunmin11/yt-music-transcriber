import { connection } from "next/server";
import { createJob } from "@/lib/pipeline";
import { lyricsEnabled } from "@/lib/lyrics";
import { parseYouTubeId } from "@/lib/youtube";


export async function POST(request: Request) {
  let body: { url?: unknown; lyrics?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url : "";
  if (!parseYouTubeId(url)) {
    return Response.json({ error: "Please paste a valid YouTube link" }, { status: 400 });
  }
  const job = createJob(url, body.lyrics !== false);
  return Response.json({ id: job.id }, { status: 202 });
}

/** Lets the UI know which optional features the server supports. */
export async function GET() {
  await connection(); // read env at request time, not at build time
  return Response.json({ lyricsEnabled: lyricsEnabled() });
}
