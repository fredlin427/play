import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;
    if (search) where.title = { contains: search };

    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        generatedImages: { take: 1, orderBy: { createdAt: "desc" } },
        designVersions: { take: 1, orderBy: { version: "desc" } },
      },
    });

    return NextResponse.json(projects.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      currentStep: p.currentStep,
      thumbnailUrl: p.generatedImages[0]?.thumbnailUrl || null,
      latestStlUrl: p.designVersions[0]?.stlFilePath || null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })));
  } catch (error) {
    console.error("[Projects API] Error:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description } = body || {};

    const project = await prisma.project.create({
      data: {
        title: title || "Untitled Project",
        description: description || "",
      },
    });

    return NextResponse.json({
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      currentStep: project.currentStep,
    }, { status: 201 });
  } catch (error) {
    console.error("[Projects API] Error:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
