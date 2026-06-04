import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runBlenderJob } from "@/lib/blender/client";
import { saveStl, getPublicPath } from "@/lib/storage";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, modelId, options } = body || {};

    if (!projectId || !modelId) {
      return NextResponse.json({ error: "projectId and modelId are required" }, { status: 400 });
    }

    // Get source model
    const sourceModel = await prisma.generatedModel.findUnique({ where: { id: modelId } });
    if (!sourceModel) {
      return NextResponse.json({ error: "Source model not found" }, { status: 404 });
    }

    // Get max version
    const latestVersion = await prisma.designVersion.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
    });
    const version = (latestVersion?.version || 0) + 1;

    // Define output path
    const outputPath = path.join(process.cwd(), "uploads", "stl", `${projectId}_v${version}_blender.stl`);

    // Create BlenderJob record
    const job = await prisma.blenderJob.create({
      data: {
        projectId,
        sourceModelId: modelId,
        jobType: "auto_process",
        status: "pending",
      },
    });

    // Update project
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "blender_processing", currentStep: 6 },
    });

    // Run Blender asynchronously
    runBlenderJob({
      projectId,
      modelId,
      inputPath: sourceModel.modelUrl,
      outputPath,
      jobType: "auto_process",
      options: {
        decimateRatio: options?.decimateRatio || 0.5,
        printerVolume: options?.printerVolume || [220, 220, 250],
      },
    }).then(async (result) => {
      // Update job on completion
      await prisma.blenderJob.update({
        where: { id: job.id },
        data: {
          status: result.success ? "completed" : "failed",
          progress: 1.0,
          outputStlUrl: result.stlPath,
          outputStlSize: result.fileSize,
          checks: JSON.stringify(result.checks),
          warnings: JSON.stringify(result.warnings),
          logOutput: result.logOutput,
          completedAt: new Date(),
        },
      });

      // Create DesignVersion
      await prisma.designVersion.create({
        data: {
          projectId,
          version,
          stlFilePath: getPublicPath(result.stlPath),
          stlFileSize: result.fileSize,
          status: result.success ? "generated" : "draft",
        },
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { status: result.success ? "stl_ready" : "model_review", currentStep: result.success ? 8 : 5 },
      });
    }).catch(async (err) => {
      await prisma.blenderJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          errorMessage: String(err),
          completedAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      jobId: job.id,
      status: "running",
    });
  } catch (error) {
    console.error("[Blender Process] Error:", error);
    return NextResponse.json({ error: "Failed to start Blender job" }, { status: 500 });
  }
}
