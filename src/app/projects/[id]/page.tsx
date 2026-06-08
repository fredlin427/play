"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LangProvider, useLang } from "@/lib/lang-context";
import { ArrowLeft, Download, CheckSquare, Square, ExternalLink, Check } from "lucide-react";

function ProjectPageInner() {
  const params = useParams();
  const router = useRouter();
  const { lang, setLang, t } = useLang();
  const id = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(setProject)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const toggleSelect = (imageId: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(imageId) ? n.delete(imageId) : n.add(imageId); return n; });
  };

  const selectAll = () => {
    if (selected.size === images.length) { setSelected(new Set()); return; }
    setSelected(new Set(images.map((i: any) => i.id)));
  };

  const downloadSelected = async () => {
    for (const imageId of selected) {
      const img = images.find((i: any) => i.id === imageId);
      if (!img) continue;
      try {
        const res = await fetch(img.imageUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${project?.title || "image"}_${imageId.slice(0, 8)}.png`;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise(r => setTimeout(r, 300));
      } catch {}
    }
  };

  const downloadAll = async () => {
    for (const img of images) {
      try {
        const res = await fetch(img.imageUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${project?.title || "image"}_${img.id.slice(0, 8)}.png`;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise(r => setTimeout(r, 300));
      } catch {}
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FDF8F3' }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#C4823B', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FDF8F3' }}>
        <p style={{ color: '#8B7355' }}>{t("Project not found", "找不到專案")}</p>
      </div>
    );
  }

  const images = (project.images || []) as any[];
  const promptVersions = (project.promptVersions || []) as any[];
  const latestPrompt = promptVersions[0];

  return (
    <div className="min-h-screen" style={{ background: '#FDF8F3' }}>
      <div className="fixed inset-0 pointer-events-none opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M30 5a2 2 0 012 2v10a2 2 0 01-4 0V7a2 2 0 012-2zm0 36a2 2 0 012 2v10a2 2 0 01-4 0V43a2 2 0 012-2zM5 30a2 2 0 012-2h10a2 2 0 010 4H7a2 2 0 01-2-2zm36 0a2 2 0 012-2h10a2 2 0 010 4H43a2 2 0 01-2-2z\" fill=\"%23C4823B\" opacity=\"0.3\"/%3E%3C/svg%3E")' }} />

      {/* Header */}
      <header className="relative z-10 border-b" style={{ background: 'rgba(253,248,243,0.85)', backdropFilter: 'blur(12px)', borderColor: 'rgba(196,130,59,0.12)' }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => router.push("/dashboard")}
            className="text-sm font-medium transition-colors" style={{ color: '#8B7355' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#C4823B')} onMouseLeave={e => (e.currentTarget.style.color = '#8B7355')}>
            ← {t("Projects", "專案")}
          </button>
          <h1 className="text-lg font-semibold truncate max-w-md" style={{ color: '#2C2416' }}>{project.title || "Untitled"}</h1>
          <span className="text-sm" style={{ color: '#B8A898' }}>{images.length} {t("images", "張圖片")}</span>
          <div className="flex-1" />
          <button onClick={() => setLang(lang === "zh" ? "en" : "zh")} className="text-sm transition-colors" style={{ color: '#8B7355' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#C4823B')} onMouseLeave={e => (e.currentTarget.style.color = '#8B7355')}>
            {lang === "zh" ? "EN" : "中文"}
          </button>
          {/* Reopen project — go back to create with this project loaded */}
          <button onClick={() => router.push(`/create?project=${id}`)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, #C4823B, #A0522D)', color: '#fff', boxShadow: '0 4px 16px rgba(196,130,59,0.25)' }}>
            <ExternalLink className="w-4 h-4" />
            {t("Reopen in Studio", "重新打開專案")}
          </button>
        </div>
      </header>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Image count + select controls */}
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-base font-medium" style={{ color: '#2C2416' }}>{t("Generated Images", "生成的圖片")}</h2>
          <span className="text-sm" style={{ color: '#B8A898' }}>({images.length})</span>
          <div className="flex-1" />
          {images.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
                className="px-4 py-2 rounded-xl text-sm transition-all"
                style={{ background: selectMode ? 'rgba(196,130,59,0.1)' : 'rgba(255,255,255,0.6)', border: '1px solid rgba(196,130,59,0.12)', color: selectMode ? '#C4823B' : '#8B7355' }}>
                {selectMode ? t("Done", "完成") : t("Select", "選取")}
              </button>
              <button onClick={downloadAll}
                className="px-4 py-2 rounded-xl text-sm transition-all"
                style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(196,130,59,0.12)', color: '#8B7355' }}>
                <Download className="w-4 h-4 inline mr-1" />{t("Download All", "全部下載")}
              </button>
            </div>
          )}
        </div>

        {/* Select bar */}
        {selectMode && (
          <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-2xl" style={{ background: 'rgba(196,130,59,0.06)', border: '1px solid rgba(196,130,59,0.15)' }}>
            <button onClick={selectAll} className="text-sm font-medium transition-colors" style={{ color: '#C4823B' }}>
              {selected.size === images.length ? t("Deselect All", "取消全選") : t("Select All", "全選")}
            </button>
            <span className="text-sm" style={{ color: '#8B7355' }}>· {t(`${selected.size} selected`, `已選 ${selected.size} 張`)}</span>
            <div className="flex-1" />
            <button onClick={downloadSelected} disabled={selected.size === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{ background: selected.size > 0 ? '#C4823B' : 'rgba(196,130,59,0.2)', color: selected.size > 0 ? '#fff' : '#B8A898' }}>
              <Download className="w-4 h-4 inline mr-1" />{t("Download Selected", "下載選取")}
            </button>
          </div>
        )}

        {/* Image grid */}
        {images.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm mb-4" style={{ color: '#8B7355' }}>{t("No images generated yet", "還沒有生成的圖片")}</p>
            <button onClick={() => router.push(`/create?project=${id}`)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'linear-gradient(135deg, #C4823B, #A0522D)', color: '#fff' }}>
              {t("Generate Images", "生成圖片")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img: any, i: number) => {
              const isSelected = selected.has(img.id);
              return (
                <div key={img.id} className="group relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                  style={{ border: `1px solid ${isSelected ? '#C4823B' : 'rgba(196,130,59,0.1)'}`, boxShadow: isSelected ? '0 0 0 2px rgba(196,130,59,0.3)' : '0 2px 12px rgba(140,100,60,0.04)' }}>
                  {/* Image */}
                  <img src={img.imageUrl} alt={`Generated ${i+1}`} className="w-full aspect-square object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />

                  {/* Hover overlay — download single */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <button onClick={() => {
                      const a = document.createElement("a"); a.href = img.imageUrl; a.download = `${project.title}_${img.id.slice(0,8)}.png`; a.click();
                    }}
                      className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                      style={{ background: 'rgba(255,255,255,0.9)', color: '#2C2416' }}>
                      <Download className="w-4 h-4 inline mr-1" />{t("Download", "下載")}
                    </button>
                  </div>

                  {/* Select checkbox */}
                  {selectMode && (
                    <button onClick={() => toggleSelect(img.id)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all z-10"
                      style={{ background: isSelected ? '#C4823B' : 'rgba(255,255,255,0.85)', border: `2px solid ${isSelected ? '#C4823B' : 'rgba(196,130,59,0.25)'}` }}>
                      {isSelected && <Check className="w-4 h-4 text-white" />}
                    </button>
                  )}

                  {/* Number badge */}
                  <span className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(0,0,0,0.4)', color: '#fff' }}>#{i + 1}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Prompt info */}
        {latestPrompt && (
          <div className="mt-8 p-5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(196,130,59,0.1)' }}>
            <h3 className="text-sm font-medium mb-2" style={{ color: '#2C2416' }}>{t("Prompt", "提示詞")}</h3>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#8B7355' }}>{latestPrompt.craftedPrompt}</p>
            {latestPrompt.negativePrompt && (
              <div className="mt-3">
                <span className="text-xs font-medium" style={{ color: '#B8A898' }}>{t("Negative", "負向提示詞")}:</span>
                <p className="text-xs mt-1" style={{ color: '#B8A898' }}>{latestPrompt.negativePrompt}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectPage() {
  return <LangProvider><ProjectPageInner /></LangProvider>;
}
