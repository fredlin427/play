"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LangProvider, useLang } from "@/lib/lang-context";
import { Search, Plus, Box, Trash2, Pencil, X, Check, Download, Sparkles, Square, CheckSquare } from "lucide-react";

interface ProjectSummary {
  id: string; title: string; description: string; status: string;
  currentStep: number; thumbnailUrl: string | null; latestStlUrl: string | null;
  createdAt: string; updatedAt: string;
}

type SortKey = "updated" | "created" | "title";

function DashboardInner() {
  const router = useRouter();
  const { lang, setLang, t } = useLang();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("updated");

  const loadProjects = () => {
    fetch("/api/projects").then(r => r.json()).then(setProjects).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { loadProjects(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(t("Delete this project?", "確定刪除此專案？"))) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects(prev => prev.filter(p => p.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const handleBatchDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(t(`Delete ${ids.length} projects?`, `確定刪除 ${ids.length} 個專案？`))) return;
    await Promise.all(ids.map(id => fetch(`/api/projects/${id}`, { method: "DELETE" })));
    setProjects(prev => prev.filter(p => !selected.has(p.id)));
    setSelected(new Set());
    setSelectMode(false);
  };

  const handleRename = async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: editTitle }) });
    setProjects(prev => prev.map(p => p.id === id ? { ...p, title: editTitle } : p));
    setEditingId(null);
  };

  const handleDownloadImage = async (p: ProjectSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!p.thumbnailUrl) return;
    try {
      const res = await fetch(p.thumbnailUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${p.title}.png`; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const filtered = projects
    .filter(p => search ? p.title.toLowerCase().includes(search.toLowerCase()) : true)
    .sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return new Date(b[sortBy === "created" ? "createdAt" : "updatedAt"]).getTime()
           - new Date(a[sortBy === "created" ? "createdAt" : "updatedAt"]).getTime();
    });

  return (
    <div className="min-h-screen" style={{ background: '#FDF8F3' }}>
      <div className="fixed inset-0 pointer-events-none opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M30 5a2 2 0 012 2v10a2 2 0 01-4 0V7a2 2 0 012-2zm0 36a2 2 0 012 2v10a2 2 0 01-4 0V43a2 2 0 012-2zM5 30a2 2 0 012-2h10a2 2 0 010 4H7a2 2 0 01-2-2zm36 0a2 2 0 012-2h10a2 2 0 010 4H43a2 2 0 01-2-2z\" fill=\"%23C4823B\" opacity=\"0.3\"/%3E%3C/svg%3E")' }} />

      {/* Header */}
      <header className="relative z-10 border-b" style={{ background: 'rgba(253,248,243,0.85)', backdropFilter: 'blur(12px)', borderColor: 'rgba(196,130,59,0.12)' }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => router.push("/")}
            className="text-sm font-medium transition-colors" style={{ color: '#8B7355' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#C4823B')} onMouseLeave={e => (e.currentTarget.style.color = '#8B7355')}>
            ← {t("Home", "首頁")}
          </button>
          <h1 className="text-lg font-semibold" style={{ color: '#2C2416' }}>{t("My Projects", "我的專案")}</h1>
          <span className="text-sm" style={{ color: '#B8A898' }}>({projects.length})</span>
          <div className="flex-1" />
          <button onClick={() => setLang(lang === "zh" ? "en" : "zh")} className="text-sm transition-colors" style={{ color: '#8B7355' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#C4823B')} onMouseLeave={e => (e.currentTarget.style.color = '#8B7355')}>
            {lang === "zh" ? "EN" : "中文"}
          </button>
          <button onClick={() => router.push("/create")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, #C4823B, #A0522D)', color: '#fff', boxShadow: '0 4px 16px rgba(196,130,59,0.25)' }}>
            <Plus className="w-4 h-4" />{t("New", "新專案")}
          </button>
        </div>
      </header>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#B8A898' }} />
            <input className="w-full h-11 pl-11 pr-4 rounded-2xl text-sm outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(196,130,59,0.12)', color: '#2C2416' }}
              placeholder={t("Search projects...", "搜尋專案...")} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}
              className="h-11 px-4 rounded-2xl text-sm outline-none cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(196,130,59,0.12)', color: '#5C4A3A' }}>
              <option value="updated">{t("Latest", "最近更新")}</option>
              <option value="created">{t("Newest", "最新建立")}</option>
              <option value="title">{t("Name", "名稱")}</option>
            </select>
            <button onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
              className="h-11 px-4 rounded-2xl text-sm font-medium transition-all"
              style={{ background: selectMode ? 'rgba(196,130,59,0.12)' : 'rgba(255,255,255,0.6)', border: '1px solid rgba(196,130,59,0.12)', color: selectMode ? '#C4823B' : '#8B7355' }}>
              {selectMode ? t("Cancel", "取消") : t("Select", "選取")}
            </button>
          </div>
        </div>

        {/* Batch actions */}
        {selectMode && selected.size > 0 && (
          <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-2xl" style={{ background: 'rgba(196,130,59,0.06)', border: '1px solid rgba(196,130,59,0.15)' }}>
            <span className="text-sm font-medium" style={{ color: '#C4823B' }}>{t(`${selected.size} selected`, `已選 ${selected.size} 個`)}</span>
            <div className="flex-1" />
            <button onClick={handleBatchDelete}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all" style={{ color: '#c86450', background: 'rgba(200,100,80,0.08)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,100,80,0.15)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(200,100,80,0.08)')}>
              <Trash2 className="w-4 h-4 inline mr-1" />{t("Delete", "刪除")}
            </button>
          </div>
        )}

        {/* Project grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.4)' }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Box className="w-16 h-16 mx-auto mb-6" style={{ color: '#D4B896' }} />
            <p className="text-sm mb-6" style={{ color: '#8B7355' }}>
              {search ? t("No matching projects", "沒有符合的專案") : t("No projects yet", "還沒有專案")}
            </p>
            {!search && (
              <button onClick={() => router.push("/create")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'linear-gradient(135deg, #C4823B, #A0522D)', color: '#fff' }}>
                <Sparkles className="w-4 h-4" />{t("Create Your First", "建立第一個專案")}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => {
              const isSelected = selected.has(p.id);
              return (
                <div key={p.id}
                  className="group relative rounded-2xl transition-all duration-300 hover:-translate-y-1"
                  style={{ background: isSelected ? 'rgba(196,130,59,0.06)' : 'rgba(255,255,255,0.6)', border: `1px solid ${isSelected ? 'rgba(196,130,59,0.4)' : 'rgba(196,130,59,0.1)'}`, boxShadow: '0 2px 12px rgba(140,100,60,0.03)' }}>

                  {/* Select checkbox */}
                  {selectMode && (
                    <button onClick={() => toggleSelect(p.id)}
                      className="absolute top-3 left-3 z-10 w-6 h-6 rounded-lg flex items-center justify-center transition-all"
                      style={{ background: isSelected ? '#C4823B' : 'rgba(255,255,255,0.8)', border: `2px solid ${isSelected ? '#C4823B' : 'rgba(196,130,59,0.3)'}` }}>
                      {isSelected && <Check className="w-4 h-4 text-white" />}
                    </button>
                  )}

                  {/* Main card — click to open */}
                  <div onClick={() => { if (!selectMode) router.push(`/projects/${p.id}`); }} className={`p-5 ${selectMode ? 'cursor-default' : 'cursor-pointer'}`}>
                    <div className="flex items-start gap-4">
                      {/* Thumbnail */}
                      <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style={{ background: 'rgba(196,130,59,0.06)' }}>
                        {p.thumbnailUrl ? (
                          <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Box className="w-6 h-6" style={{ color: '#D4B896' }} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Title — inline edit or display */}
                        {editingId === p.id ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                              className="flex-1 h-7 px-2 rounded-lg text-sm outline-none" autoFocus style={{ border: '1px solid #C4823B', background: '#fff' }}
                              onKeyDown={e => { if (e.key === "Enter") handleRename(p.id); if (e.key === "Escape") setEditingId(null); }} />
                            <button onClick={() => handleRename(p.id)} className="p-1"><Check className="w-3.5 h-3.5 text-green-600" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1"><X className="w-3.5 h-3.5" style={{ color: '#8B7355' }} /></button>
                          </div>
                        ) : (
                          <h3 className="font-medium text-sm truncate" style={{ color: '#2C2416' }}>{p.title}</h3>
                        )}
                        <p className="text-xs mt-0.5" style={{ color: '#8B7355' }}>
                          {new Date(p.updatedAt).toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                          {p.description && <span className="ml-2 truncate inline-block max-w-[120px] align-bottom">· {p.description}</span>}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Hover actions */}
                  <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); handleDownloadImage(p, e); }}
                      className="p-2 rounded-lg transition-colors" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(196,130,59,0.1)' }}
                      title={t("Download Image", "下載圖片")}>
                      <Download className="w-3.5 h-3.5" style={{ color: '#C4823B' }} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(p.id); setEditTitle(p.title); }}
                      className="p-2 rounded-lg transition-colors" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(196,130,59,0.1)' }}
                      title={t("Rename", "重新命名")}>
                      <Pencil className="w-3.5 h-3.5" style={{ color: '#8B7355' }} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                      className="p-2 rounded-lg transition-colors" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(196,130,59,0.1)' }}
                      title={t("Delete", "刪除")}>
                      <Trash2 className="w-3.5 h-3.5" style={{ color: '#c86450' }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return <LangProvider><DashboardInner /></LangProvider>;
}
