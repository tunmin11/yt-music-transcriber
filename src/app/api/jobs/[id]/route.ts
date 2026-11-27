import { getJob, queuePosition } from "@/lib/jobs";


export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  return Response.json({ ...job, queuePosition: queuePosition(id) });
}
