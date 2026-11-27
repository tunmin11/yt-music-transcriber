import { getJob } from "@/lib/jobs";
import { notesToMidi } from "@/lib/transcribe";


export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job?.result) return Response.json({ error: "Transcription not ready" }, { status: 404 });

  const bytes = notesToMidi(job.result.notes, job.result.title);
  const safe = job.result.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 80) || "transcription";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "audio/midi",
      "Content-Disposition": `attachment; filename="${safe}.mid"`,
    },
  });
}
