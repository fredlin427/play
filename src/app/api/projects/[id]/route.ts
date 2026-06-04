import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";

/** Extract relative path after "uploads/" — handles both / and \ on Windows */
function extractUploadPath(absPath: string): string {
  if (!absPath) return "";
  // Normalize slashes and split on either / or \
  const normalized = absPath.replace(/\\/g, "/");
  const idx = normalized.indexOf("uploads/");
  if (idx === -1) return normalized.split("/").pop() || "";
  return normalized.slice(idx + "uploads/".length);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        promptVersions: { orderBy: { version: "desc" } },
        referenceImages: { orderBy: { createdAt: "desc" } },
        referenceModels: { orderBy: { createdAt: "desc" } },
        generatedImages: { orderBy: { createdAt: "desc" } },
        generatedModels: { orderBy: { createdAt: "desc" } },
        blenderJobs: { orderBy: { createdAt: "desc" } },
        designVersions: { orderBy: { version: "desc" } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      currentStep: project.currentStep,
      messages: project.messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })),
      promptVersions: project.promptVersions.map((pv) => ({
        id: pv.id, version: pv.version, userInput: pv.userInput,
        craftedPrompt: pv.craftedPrompt, negativePrompt: pv.negativePrompt,
        styleNotes: pv.styleNotes, clarityScore: pv.clarityScore,
        isApproved: pv.isApproved, feedback: pv.feedback, createdAt: pv.createdAt.toISOString(),
      })),
      referenceImages: project.referenceImages.map((ri) => ({
        id: ri.id, imageUrl: `/api/files/${extractUploadPath(ri.imageUrl)}`,
        thumbnailUrl: ri.thumbnailUrl, width: ri.width, height: ri.height,
        fileSize: ri.fileSize, analysis: ri.analysis, createdAt: ri.createdAt.toISOString(),
      })),
      referenceModels: project.referenceModels.map((rm) => ({
        id: rm.id, fileUrl: `/api/files/${extractUploadPath(rm.fileUrl)}`,
        fileFormat: rm.fileFormat, fileSize: rm.fileSize, analysis: rm.analysis, createdAt: rm.createdAt.toISOString(),
      })),
      images: project.generatedImages.map((gi) => ({
        id: gi.id, promptVersionId: gi.promptVersionId,
        imageUrl: `/api/files/${extractUploadPath(gi.imageUrl)}`,
        thumbnailUrl: gi.thumbnailUrl, width: gi.width, height: gi.height,
        fileSize: gi.fileSize, isApproved: gi.isApproved, createdAt: gi.createdAt.toISOString(),
      })),
      models: project.generatedModels.map((gm) => ({
        id: gm.id, sourceImageId: gm.sourceImageId,
        modelUrl: `/api/files/${extractUploadPath(gm.modelUrl)}`,
        modelFormat: gm.modelFormat, fileSize: gm.fileSize, createdAt: gm.createdAt.toISOString(),
      })),
      blenderJobs: project.blenderJobs.map((bj) => ({
        id: bj.id, sourceModelId: bj.sourceModelId, jobType: bj.jobType,
        status: bj.status, progress: bj.progress, outputStlUrl: bj.outputStlUrl,
        outputStlSize: bj.outputStlSize, checks: bj.checks, warnings: bj.warnings,
        logOutput: bj.logOutput, errorMessage: bj.errorMessage,
        startedAt: bj.startedAt?.toISOString() || null, completedAt: bj.completedAt?.toISOString() || null,
        createdAt: bj.createdAt.toISOString(),
      })),
      designVersions: project.designVersions.map((dv) => ({
        id: dv.id, version: dv.version, stlFilePath: dv.stlFilePath,
        stlFileSize: dv.stlFileSize, status: dv.status, createdAt: dv.createdAt.toISOString(),
      })),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("[Project API] Error:", error);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, status, currentStep } = body || {};

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (currentStep !== undefined) data.currentStep = currentStep;

    const project = await prisma.project.update({ where: { id }, data });

    return NextResponse.json({ id: project.id, title: project.title, status: project.status, currentStep: project.currentStep });
  } catch (error) {
    console.error("[Project API] Error:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Project API] Error:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
