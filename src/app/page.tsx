"use client";

import { useState, useEffect } from "react";
import { LangProvider, useLang } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Sparkles, Box, ArrowRight, Globe, PenTool, Image, Cpu, Star } from "lucide-react";

function HomePageInner() {
  const router = useRouter();
  const { lang, setLang, t } = useLang();
  const [langSelected, setLangSelected] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch: SSR always renders "en", client detects real lang
  useEffect(() => { setMounted(true); }, []);

  // Show nothing during SSR to avoid hydration mismatch
  if (!mounted) return <main className="min-h-screen" style={{ background: '#FDF8F3' }} />;

  if (!langSelected) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2C2416 0%, #3D2E1F 30%, #4A3728 60%, #2C2416 100%)' }}>
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, #C4823B 1px, transparent 1px), radial-gradient(circle at 75% 75%, #C4823B 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="text-center space-y-8 px-4 relative z-10">
          <div className="inline-flex items-center gap-3 text-[#C4823B] mb-4">
            <Box className="w-8 h-8" />
            <span className="text-xl font-light tracking-[0.3em] uppercase">MedForge</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-light text-[#F5EDE3] mb-2 tracking-wide">
            {t("Choose Your Language", "選擇你的語言")}
          </h1>
          <p className="text-[#8B7355] text-sm mb-8">
            {t("You can change this anytime", "隨時可以切換")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {[
              { code: "zh", label: "中文", sub: "繁體中文" },
              { code: "en", label: "EN", sub: "English" },
            ].map(({ code, label, sub }) => (
              <button key={code}
                onClick={() => { setLang(code as "zh" | "en"); setLangSelected(true); }}
                className="group relative px-14 py-8 rounded-2xl border transition-all duration-500 hover:scale-105"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(196,130,59,0.2)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(196,130,59,0.08)'; e.currentTarget.style.borderColor = 'rgba(196,130,59,0.5)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(196,130,59,0.2)'; }}
              >
                <div className="text-4xl mb-2 text-[#F5EDE3] font-light">{label}</div>
                <div className="text-sm text-[#8B7355] group-hover:text-[#C4823B] transition-colors">{sub}</div>
              </button>
            ))}
          </div>
          <p className="text-[#5C4A3A] text-xs mt-8">MDSSC · Z-Image-Turbo · Qwen 2.5 · LLaVA</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: '#FDF8F3' }}>
      {/* Subtle texture */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M30 5a2 2 0 012 2v10a2 2 0 01-4 0V7a2 2 0 012-2zm0 36a2 2 0 012 2v10a2 2 0 01-4 0V43a2 2 0 012-2zM5 30a2 2 0 012-2h10a2 2 0 010 4H7a2 2 0 01-2-2zm36 0a2 2 0 012-2h10a2 2 0 010 4H43a2 2 0 01-2-2z\" fill=\"%23C4823B\" opacity=\"0.3\"/%3E%3C/svg%3E")' }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #C4823B, #A0522D)' }}>
            <Box className="w-4 h-4 text-white" />
          </div>
          <span className="font-light tracking-[0.2em] text-sm uppercase" style={{ color: '#5C4A3A' }}>MedForge</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLangSelected(false)} className="px-3 py-2 rounded-xl text-sm transition-colors" style={{ color: '#8B7355' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(196,130,59,0.06)'; e.currentTarget.style.color = '#C4823B'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8B7355'; }}>
            <Globe className="w-4 h-4 inline mr-1" />{lang === "zh" ? "中文" : "EN"}
          </button>
          <button onClick={() => router.push("/dashboard")} className="px-4 py-2 rounded-xl text-sm transition-colors" style={{ color: '#8B7355' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(196,130,59,0.06)'; e.currentTarget.style.color = '#C4823B'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8B7355'; }}>
            {t("My Projects", "我的專案")}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 pt-16 sm:pt-28 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full mb-10 text-xs tracking-wide" style={{ background: 'rgba(196,130,59,0.08)', color: '#C4823B', border: '1px solid rgba(196,130,59,0.15)' }}>
          <Star className="w-3.5 h-3.5 fill-current" />
          {t("AI-Powered 3D Print Design Platform · by MDSSC", "AI 驅動的 3D 列印設計平台 · MDSSC")}
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-light tracking-tight mb-8 leading-tight" style={{ color: '#2C2416' }}>
          {t("From idea to", "從想法到")}
          <br />
          <span style={{ background: 'linear-gradient(135deg, #C4823B 0%, #A0522D 50%, #8B4513 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t("printable reality", "可列印的現實")}
          </span>
        </h1>

        <p className="text-lg max-w-xl mx-auto mb-12 leading-relaxed" style={{ color: '#8B7355' }}>
          {t(
            "Describe your idea. Our AI asks the right questions, crafts professional prompts, and brings your vision to life.",
            "描述你的想法。AI 會問對的問題、撰寫專業提示詞、把你的想像變成現實。"
          )}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-20">
          <button onClick={() => router.push("/create")}
            className="group px-10 py-5 rounded-2xl text-white font-medium text-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #C4823B, #A0522D)', boxShadow: '0 8px 32px rgba(196,130,59,0.3)' }}>
            <Sparkles className="w-5 h-5 inline mr-2" />
            {t("Start Creating", "開始創作")}
          </button>
          <button onClick={() => router.push("/dashboard")}
            className="px-10 py-5 rounded-2xl font-medium text-lg transition-all duration-300 hover:scale-105"
            style={{ color: '#5C4A3A', border: '1px solid rgba(196,130,59,0.3)', background: 'rgba(255,255,255,0.5)' }}>
            {t("My Projects", "我的專案")}
            <ArrowRight className="w-5 h-5 inline ml-2" />
          </button>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
          {[
            { icon: PenTool, title: t("Smart Q&A", "智能問答"), desc: t("Targeted questions about size, material, shape & usage", "針對尺寸、材質、形狀和用途的精準提問") },
            { icon: Image, title: t("Crafted Prompts", "精雕提示詞"), desc: t("Professional prompts optimized for Z-Image-Turbo", "為 Z-Image-Turbo 精心打磨的專業提示詞") },
            { icon: Cpu, title: t("High Quality", "高品質輸出"), desc: t("Up to 1024px with adjustable inference steps", "最高 1024px，推理步數可調") },
          ].map((f, i) => (
            <div key={i} className="group relative p-8 rounded-2xl transition-all duration-300 hover:-translate-y-1 text-left"
              style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(196,130,59,0.1)', boxShadow: '0 4px 24px rgba(140,100,60,0.04)' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform group-hover:scale-110"
                style={{ background: 'linear-gradient(135deg, rgba(196,130,59,0.12), rgba(160,82,45,0.08))' }}>
                <f.icon className="w-5 h-5" style={{ color: '#C4823B' }} />
              </div>
              <h3 className="font-medium text-lg mb-2" style={{ color: '#2C2416' }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#8B7355' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t py-8 text-center" style={{ borderColor: 'rgba(196,130,59,0.08)' }}>
        <p className="text-xs" style={{ color: '#B8A898' }}>MDSSC © 2026 · Z-Image-Turbo Q6 · Qwen 2.5 7B · LLaVA 7B · Next.js 16</p>
      </footer>
    </main>
  );
}

export default function HomePage() {
  return <LangProvider><HomePageInner /></LangProvider>;
}
