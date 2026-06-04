"use client";

import { LangProvider, useLang } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Sparkles, Box, Palette, Zap, ArrowRight, Languages } from "lucide-react";

function HomePageInner() {
  const router = useRouter();
  const { lang, setLang, t } = useLang();

  return (
    <main className="flex-1">
      <div className="relative overflow-hidden bg-gradient-to-br from-white via-blue-50 to-white">
        <div className="max-w-5xl mx-auto px-4 py-16 sm:py-24">
          <div className="absolute top-4 right-4">
            <Button variant="ghost" size="sm" onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
              <Languages className="w-4 h-4 mr-1" />{lang === "zh" ? "EN" : "中文"}
            </Button>
          </div>
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight mb-6">
              {t("3D Print Anything", "3D 列印任何物品")}
              <br />
              <span className="text-blue-600">{t("With AI", "用 AI 驅動")}</span>
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
              {t(
                "Describe your idea, let AI craft the perfect design prompt, generate 2D images, convert to 3D models, and export ready-to-print STL files — all in one workflow.",
                "描述您的想法，讓 AI 撰寫最佳設計提示詞、生成 2D 圖片、轉換為 3D 模型、匯出可列印的 STL 檔案 — 一站式工作流。"
              )}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Button size="xl" className="font-medium" onClick={() => router.push("/create")}>
                {t("Start Creating", "開始創作")}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button variant="outline" size="xl" onClick={() => router.push("/dashboard")}>
                {t("My Projects", "我的專案")}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
              <div className="flex flex-col items-center gap-2 p-4">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-medium">{t("AI Prompt Helper", "AI 提示詞助手")}</h3>
                <p className="text-sm text-gray-500">
                  {t("Optimized text-to-image prompts for best results", "優化的文字生圖提示詞，確保最佳效果")}
                </p>
              </div>
              <div className="flex flex-col items-center gap-2 p-4">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Box className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="font-medium">{t("2D → 3D Conversion", "2D → 3D 轉換")}</h3>
                <p className="text-sm text-gray-500">
                  {t("Hunyuan AI turns images into detailed 3D models", "騰訊混元 AI 將圖片轉換為精細 3D 模型")}
                </p>
              </div>
              <div className="flex flex-col items-center gap-2 p-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <Zap className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="font-medium">{t("Print-Ready STL", "列印就緒 STL")}</h3>
                <p className="text-sm text-gray-500">
                  {t("Auto mesh repair + printability check via Blender", "Blender 自動網格修復 + 可列印性檢查")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-gray-200 bg-gray-50 py-8 mt-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-500">
          <p className="mb-1">
            <strong>3D Print AI</strong> — MVP Version
          </p>
        </div>
      </footer>
    </main>
  );
}

export default function HomePage() {
  return (
    <LangProvider>
      <HomePageInner />
    </LangProvider>
  );
}
