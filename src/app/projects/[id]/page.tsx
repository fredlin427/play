"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { LangProvider, useLang } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ThreeViewer } from "@/components/shared/ThreeViewer";
import { ImageGallery } from "@/components/project/ImageGallery";
import { BlenderStatusCard } from "@/components/project/BlenderStatusCard";
import {
  Check, Loader2, Download, ArrowLeft, RefreshCw, ChevronRight,
} from "lucide-react";

const STEPS = [
  { step: 1, key: "Describe", zh: "描述需求" },
  { step: 2, key: "Craft Prompt", zh: "撰寫提示詞" },
  { step: 3, key: "Generate 2D", zh: "生成 2D 圖片" },
  { step: 4, key: "Review Images", zh: "審核圖片" },
  { step: 5, key: "Generate 3D", zh: "生成 3D 模型" },
  { step: 6, key: "Review Model", zh: "審核模型" },
  { step: 7, key: "Blender Process", zh: "Blender 處理" },
  { step: 8, key: "Export STL", zh: "匯出 STL" },
];

function ProjectPageInner() {
  const params = useParams();
  const router = useRouter();
  const { lang, setLang, t } = useLang();
  const id = params.id as string;

  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating3D, setGenerating3D] = useState(false);
  const [blenderJobId, setBlenderJobId] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      const data = await res.json();
      setProject(data);
    } catch (err) {
      console.error("Failed to load project:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // Approve an image and generate 3D
  const handleApproveImage = async (imageId: string) => {
    setGenerating3D(true);
    try {
      const res = await fetch("/api/hunyuan/image-to-3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, imageId, format: "glb" }),
      });
      await res.json();
      await loadProject();
    } catch (err) {
      console.error("3D generation failed:", err);
    } finally {
      setGenerating3D(false);
    }
  };

  // Start Blender processing
  const handleBlenderProcess = async (modelId: string) => {
    try {
      const res = await fetch("/api/blender/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, modelId }),
      });
      const data = await res.json();
      setBlenderJobId(data.jobId);
      await loadProject();
    } catch (err) {
      console.error("Blender start failed:", err);
    }
  };

  const handleBlenderComplete = async () => {
    await loadProject();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Project not found</p>
      </div>
    );
  }

  const currentStep = (project.currentStep as number) || 0;
  const images = (project.images as Array<Record<string, unknown>>) || [];
  const models = (project.models as Array<Record<string, unknown>>) || [];
  const designVersions = (project.designVersions as Array<Record<string, unknown>>) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> {t("Dashboard", "儀表板")}
          </Button>
          <h1 className="text-lg font-semibold truncate">
            {(project.title as string) || "Untitled"}
          </h1>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
            {lang === "zh" ? "EN" : "中文"}
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left: Step indicator */}
        <div className="space-y-1">
          {STEPS.map((s) => {
            const isActive = currentStep >= s.step;
            const isCurrent = currentStep === s.step;
            return (
              <div
                key={s.step}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                  isCurrent ? "bg-blue-50 text-blue-700 font-medium" : isActive ? "text-gray-700" : "text-gray-400"
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  isActive ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
                }`}>
                  {isActive ? <Check className="w-3 h-3" /> : s.step}
                </div>
                <span>{lang === "zh" ? s.zh : s.key}</span>
                {isCurrent && <ChevronRight className="w-3 h-3 ml-auto" />}
              </div>
            );
          })}
        </div>

        {/* Center: Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 3-4: Image review */}
          {currentStep >= 3 && images.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <CardTitle className="text-sm mb-4">
                  {t("Generated Images", "生成的圖片")}
                </CardTitle>
                <ImageGallery
                  images={images.map((img) => ({
                    id: img.id as string,
                    projectId: id,
                    promptVersionId: img.promptVersionId as string,
                    imageUrl: img.imageUrl as string,
                    thumbnailUrl: img.thumbnailUrl as string,
                    width: img.width as number,
                    height: img.height as number,
                    fileSize: img.fileSize as number,
                    isApproved: img.isApproved as boolean,
                    createdAt: img.createdAt as string,
                  }))}
                  approvedImageId={null}
                  onApprove={handleApproveImage}
                  onReject={() => {}}
                />
                {generating3D && (
                  <div className="flex items-center gap-2 mt-4 text-sm text-blue-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("Generating 3D model...", "正在生成 3D 模型...")}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 5-6: 3D Model */}
          {currentStep >= 5 && models.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <CardTitle className="text-sm mb-4">
                  {t("3D Model Preview", "3D 模型預覽")}
                </CardTitle>
                <ThreeViewer
                  modelUrl={(models[0].modelUrl as string) || null}
                  className="min-h-[400px] w-full rounded-lg border"
                />
                {currentStep === 5 && (
                  <Button
                    onClick={() => handleBlenderProcess(models[0].id as string)}
                    className="w-full mt-4"
                  >
                    {t("Process with Blender", "Blender 自動處理")}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 7: Blender status */}
          {currentStep >= 6 && (
            <Card>
              <CardContent className="p-4">
                <CardTitle className="text-sm mb-4">
                  {t("Blender Processing", "Blender 處理")}
                </CardTitle>
                <BlenderStatusCard
                  jobId={blenderJobId || (project.blenderJobs as Array<Record<string, unknown>>)?.[0]?.id as string || null}
                  onComplete={handleBlenderComplete}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 8: Download STL */}
          {currentStep >= 8 && designVersions.length > 0 && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4 text-center">
                <Check className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <CardTitle className="text-sm mb-2">
                  {t("STL Ready!", "STL 已就緒！")}
                </CardTitle>
                <a
                  href={designVersions[0].stlFilePath as string}
                  download
                  className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
                >
                  <Download className="w-4 h-4" />
                  {t("Download STL", "下載 STL")}
                </a>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {currentStep < 3 && (
            <div className="text-center py-16 text-gray-400">
              {currentStep <= 1 && (
                <div className="space-y-3">
                  <p>{t("Craft your prompt first", "請先撰寫提示詞")}</p>
                  <Button onClick={() => router.push(`/create`)} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("Go to Prompt Helper", "前往提示詞助手")}
                  </Button>
                </div>
              )}
              {currentStep === 2 && (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t("Generating images...", "正在生成圖片...")}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Info sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-2 text-sm">
              <div>
                <span className="text-gray-500">{t("Status", "狀態")}:</span>{" "}
                <span className="font-medium">{(project.status as string) || "draft"}</span>
              </div>
              <div>
                <span className="text-gray-500">{t("Step", "步驟")}:</span>{" "}
                <span className="font-medium">{currentStep}/8</span>
              </div>
              <div>
                <span className="text-gray-500">{t("Created", "建立時間")}:</span>{" "}
                <span className="font-medium">{new Date(project.createdAt as string).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ProjectPage() {
  return (
    <LangProvider>
      <ProjectPageInner />
    </LangProvider>
  );
}
