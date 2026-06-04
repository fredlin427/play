"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LangProvider, useLang } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { SketchPad } from "@/components/create/SketchPad";
import { ReferenceImageUploader } from "@/components/create/ReferenceImageUploader";
import { ReferenceModelUploader } from "@/components/create/ReferenceModelUploader";
import { ArrowRight, Sparkles, Pencil, ImagePlus, Box, Loader2, Copy, Check, RefreshCw, Wand2 } from "lucide-react";

function CreatePageInner() {
  const router = useRouter();
  const { lang, setLang, t } = useLang();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pid, setPid] = useState<string|null>(null);
  const [result, setResult] = useState<{id?:string;content?:string;craftedPrompt:string;negativePrompt:string}|null>(null);
  const [copied, setCopied] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [mode, setMode] = useState<"text"|"sketch"|"image"|"model">("text");
  const [sketchNotes, setSketchNotes] = useState("");

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      let id = pid;
      if (!id) { const r = await fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:input.slice(0,80),description:input})}); id=(await r.json()).id; setPid(id); }

      const desc = mode==="sketch" ? `[Sketch notes]: ${sketchNotes}\n[Description]: ${input}` : input;

      const res = await fetch("/api/prompt/craft", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:id,description:desc})});
      const data = await res.json();
      setResult(data.promptVersion);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleIterate = async () => {
    if (!feedback.trim()||!pid) return;
    setLoading(true);
    try {
      const desc = `[Original]: ${input}\n[Feedback]: ${feedback}`;
      const res = await fetch("/api/prompt/craft", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,description:desc})});
      const data = await res.json();
      setResult(data.promptVersion);
      setFeedback("");
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleGenImages = async () => {
    if (!pid||!result) return;
    setGenLoading(true);
    try {
      const proj = await (await fetch(`/api/projects/${pid}`)).json();
      const pv = proj.promptVersions?.[0];
      if (!pv) throw new Error("No version");
      await fetch("/api/hunyuan/text-to-image", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,promptVersionId:pv.id,prompt:result.craftedPrompt,negativePrompt:result.negativePrompt,numImages:4})});
      router.push(`/projects/${pid}`);
    } catch (err) { console.error(err); }
    finally { setGenLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={()=>router.push("/")}>← {t("Back","返回")}</Button>
          <h1 className="text-lg font-semibold">{t("Prompt Generator","提示詞生成器")}</h1>
          <div className="flex-1"/>
          <Button variant="ghost" size="sm" onClick={()=>setLang(lang==="zh"?"en":"zh")}>{lang==="zh"?"EN":"中文"}</Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ═══ LEFT: Input ═══ */}
          <div className="space-y-4">
            {/* Mode tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {[
                {key:"text" as const,icon:Sparkles,zh:"文字",en:"Text"},
                {key:"sketch" as const,icon:Pencil,zh:"畫畫",en:"Sketch"},
                {key:"image" as const,icon:ImagePlus,zh:"圖片",en:"Image"},
                {key:"model" as const,icon:Box,zh:"3D檔案",en:"3D File"},
              ].map(m=>(<button key={m.key} onClick={()=>setMode(m.key)} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${mode===m.key?"bg-white text-blue-700 shadow-sm":"text-gray-600 hover:text-gray-900"}`}><m.icon className="w-3.5 h-3.5"/><span className="hidden sm:inline">{lang==="zh"?m.zh:m.en}</span></button>))}
            </div>

            {mode==="sketch"&&<><SketchPad onSave={()=>{}}/><Textarea value={sketchNotes} onChange={e=>setSketchNotes(e.target.value)} placeholder={t("Notes...","備註...")} rows={2} className="resize-none text-sm"/></>}
            {mode==="image"&&<ReferenceImageUploader projectId={pid} onUpload={()=>{}}/>}
            {mode==="model"&&<ReferenceModelUploader projectId={pid} onUpload={()=>{}}/>}

            <Textarea
              value={input}
              onChange={e=>setInput(e.target.value)}
              placeholder={t(
                "Describe your object in detail — the more specific, the better the prompt.\n\nInclude: what it is, shape, material, color, texture, style, size, where it's used, any special features...\n\nExamples:\n• A 3-section adjustable phone stand, white matte plastic, minimal style, anti-slip base, for desk use, 10-15cm tall\n• A dragon-shaped candle holder in cast bronze, gothic style, coiled around a standard tea light, for dining table",
                "詳細描述您的物品 — 越具體，提示詞越好。\n\n包含：是什麼、形狀、材質、顏色、紋理、風格、大小、使用場景、特殊功能...\n\n例如：\n• 3節可調節手機支架，白色啞光塑膠，簡約風格，防滑底座，桌面使用，10-15cm高\n• 龍形蠟燭台，青銅鑄造，哥特風格，環繞標準茶蠟，餐桌使用"
              )}
              rows={6} className="resize-none text-sm"
            />

            {!result ? (
              <Button onClick={handleGenerate} disabled={loading||!input.trim()} className="w-full" size="lg">
                {loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<Wand2 className="w-4 h-4 mr-2"/>}
                {t("Generate Prompt","生成提示詞")}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-1">
                    <Textarea value={feedback} onChange={e=>setFeedback(e.target.value)}
                      placeholder={t("Want changes? Describe what to adjust...","想修改？描述要調整什麼...")} rows={1} className="resize-none text-sm"
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleIterate();}}}/>
                    <Button size="sm" variant="outline" onClick={handleIterate} disabled={!feedback.trim()||loading}>
                      {loading?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>}
                    </Button>
                  </div>
                  <Button onClick={handleGenImages} disabled={genLoading} className="shrink-0">
                    {genLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<ArrowRight className="w-4 h-4 mr-1"/>}{t("Generate 2D","生成2D")}
                  </Button>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 text-center">
              {t("Tip: Be specific! Instead of 'a phone stand', say 'a 3-section adjustable phone stand, white matte plastic, minimal style, anti-slip base, 10-15cm tall, for desk use'","提示：越具體越好！與其說「手機支架」，不如說「3節可調節手機支架，白色啞光塑膠，簡約風格，防滑底座，10-15cm高，桌面使用」")}
            </p>
          </div>

          {/* ═══ RIGHT: Result ═══ */}
          <div>
            {result ? (
              <Card>
                <CardContent className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                  <div className="flex items-center justify-between sticky top-0 bg-white pb-2 border-b">
                    <CardTitle className="text-sm"><Sparkles className="w-4 h-4 text-blue-600 inline mr-1"/>{t("Prompt Package","提示詞方案")}</CardTitle>
                    <Button variant="ghost" size="sm" onClick={()=>{navigator.clipboard.writeText(result.content||result.craftedPrompt);setCopied(true);setTimeout(()=>setCopied(false),2000);}}>
                      {copied?<Check className="w-3.5 h-3.5 text-green-600"/>:<Copy className="w-3.5 h-3.5"/>}
                    </Button>
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed"
                    dangerouslySetInnerHTML={{__html:(result.content||result.craftedPrompt)
                      .replace(/## ([^\n]+)/g,'<h3 class="text-base font-bold text-gray-900 mt-4 mb-2 border-b pb-1">$1</h3>')
                      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
                      .replace(/^- (.+)$/gm,'<li class="ml-4 text-gray-700">$1</li>')
                      .replace(/\n\n/g,'<br/><br/>')}}/>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-24 text-gray-300">
                <Wand2 className="w-16 h-16 mb-4 opacity-20"/>
                <p className="text-sm">{t("Describe your object on the left → click Generate","在左側描述物品 → 點擊生成")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreatePage() {
  return <LangProvider><CreatePageInner/></LangProvider>;
}
