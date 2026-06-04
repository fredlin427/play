import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const job = await prisma.blenderJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      outputStlUrl: job.outputStlUrl ? `/api/files/stl/${encodeURIComponent(job.outputStlUrl.split("/").pop() || "")}` : null,
      checks: JSON.parse(job.checks || "[]"),
      warnings: JSON.parse(job.warnings || "[]"),
      errorMessage: job.errorMessage || undefined,
    });
  } catch (error) {
    console.error("[Blender Status] Error:", error);
    return NextResponse.json({ error: "Failed to get job status" }, { status: 500 });
  }
}
