"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LangProvider, useLang } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Search, Plus, Layers, CheckCircle, Clock, AlertTriangle, Box } from "lucide-react";

interface ProjectSummary {
  id: string;
  title: string;
  description: string;
  status: string;
  currentStep: number;
  thumbnailUrl: string | null;
  latestStlUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_MAP: Record<string, { en: string; zh: string; color: string }> = {
  draft: { en: "Draft", zh: "草稿", color: "bg-gray-100 text-gray-700" },
  prompt_crafting: { en: "Crafting Prompt", zh: "撰寫提示詞中", color: "bg-blue-100 text-blue-700" },
  image_generating: { en: "Generating Images", zh: "生成圖片中", color: "bg-purple-100 text-purple-700" },
  image_review: { en: "Review Images", zh: "審核圖片", color: "bg-yellow-100 text-yellow-700" },
  model_generating: { en: "Generating 3D", zh: "生成 3D 中", color: "bg-purple-100 text-purple-700" },
  model_review: { en: "Review 3D Model", zh: "審核 3D 模型", color: "bg-yellow-100 text-yellow-700" },
  blender_processing: { en: "Blender Processing", zh: "Blender 處理中", color: "bg-orange-100 text-orange-700" },
  engineer_review: { en: "Engineer Review", zh: "工程師審查", color: "bg-red-100 text-red-700" },
  stl_ready: { en: "STL Ready", zh: "STL 就緒", color: "bg-green-100 text-green-700" },
  completed: { en: "Completed", zh: "已完成", color: "bg-green-100 text-green-700" },
};

function DashboardInner() {
  const router = useRouter();
  const { lang, setLang, t } = useLang();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter((p) => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    return true;
  });

  const stats = {
    total: projects.length,
    inProgress: projects.filter((p) => !["stl_ready", "completed"].includes(p.status)).length,
    ready: projects.filter((p) => p.status === "stl_ready" || p.status === "completed").length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
            ← {t("Home", "首頁")}
          </Button>
          <h1 className="text-lg font-semibold">{t("My Projects", "我的專案")}</h1>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
            {lang === "zh" ? "EN" : "中文"}
          </Button>
          <Button size="sm" onClick={() => router.push("/create")}>
            <Plus className="w-4 h-4 mr-1" />
            {t("New Project", "新專案")}
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Layers className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-500">{t("Total Projects", "全部專案")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="w-5 h-5 text-orange-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.inProgress}</p>
                <p className="text-xs text-gray-500">{t("In Progress", "進行中")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.ready}</p>
                <p className="text-xs text-gray-500">{t("Ready", "已完成")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              className="pl-9"
              placeholder={t("Search projects...", "搜尋專案...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
          >
            <option value="all">{t("All Statuses", "所有狀態")}</option>
            <option value="draft">{t("Draft", "草稿")}</option>
            <option value="prompt_crafting">{t("Crafting", "撰寫提示詞")}</option>
            <option value="image_review">{t("Image Review", "圖片審核")}</option>
            <option value="model_review">{t("Model Review", "模型審核")}</option>
            <option value="blender_processing">{t("Processing", "處理中")}</option>
            <option value="stl_ready">{t("STL Ready", "STL 就緒")}</option>
            <option value="completed">{t("Completed", "已完成")}</option>
          </select>
        </div>

        {/* Project grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Box className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm mb-4">
              {search || filterStatus !== "all"
                ? t("No projects match your filters", "沒有符合篩選條件的專案")
                : t("No projects yet — start your first one!", "還沒有專案 — 開始第一個吧！")}
            </p>
            {!search && filterStatus === "all" && (
              <Button onClick={() => router.push("/create")}>
                <Plus className="w-4 h-4 mr-1" />
                {t("Create Project", "建立專案")}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => {
              const statusInfo = STATUS_MAP[p.status] || STATUS_MAP.draft;
              return (
                <Card
                  key={p.id}
                  className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Thumbnail or placeholder */}
                      <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {p.thumbnailUrl ? (
                          <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Box className="w-6 h-6 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{p.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{p.description || t("No description", "無描述")}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                            {lang === "zh" ? statusInfo.zh : statusInfo.en}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {t("Step", "步驟")} {p.currentStep}/8
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
                          <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                          {p.latestStlUrl && <span className="text-green-600">• STL ✓</span>}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <LangProvider>
      <DashboardInner />
    </LangProvider>
  );
}
