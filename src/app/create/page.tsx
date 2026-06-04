"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LangProvider, useLang } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { SketchPad } from "@/components/create/SketchPad";
import { ReferenceImageUploader } from "@/components/create/ReferenceImageUploader";
import { ReferenceModelUploader } from "@/components/create/ReferenceModelUploader";
import { ArrowRight, Sparkles, Pencil, ImagePlus, Box, Loader2, Copy, Check, RefreshCw, Wand2, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import type { DesignSpec } from "@/lib/schemas";
import { EMPTY_SPEC } from "@/lib/schemas";

const FIELD_CONFIG: Array<{path:string; zh:string; en:string; placeholder:string}> = [
  {path:"object.name",zh:"物品名稱",en:"Object Name",placeholder:"3-section adjustable phone stand"},
  {path:"object.type",zh:"類型",en:"Type",placeholder:"product"},
  {path:"visual.style",zh:"風格",en:"Style",placeholder:"minimalist"},
  {path:"visual.material",zh:"材質",en:"Material",placeholder:"white matte plastic"},
  {path:"visual.color",zh:"顏色",en:"Color",placeholder:"white"},
  {path:"visual.texture",zh:"紋理",en:"Texture",placeholder:"smooth matte"},
  {path:"visual.finish",zh:"表面處理",en:"Finish",placeholder:"matte"},
  {path:"visual.edgeTreatment",zh:"邊緣處理",en:"Edges",placeholder:"soft rounded"},
  {path:"composition.viewAngle",zh:"視角",en:"View",placeholder:"front"},
  {path:"composition.background",zh:"背景",en:"Bg",placeholder:"pure white"},
  {path:"composition.lighting",zh:"燈光",en:"Lighting",placeholder:"studio soft"},
  {path:"features.keyFeatures",zh:"關鍵特徵",en:"Features",placeholder:"3-section, adjustable, anti-slip"},
  {path:"dimensions.approximateSize",zh:"尺寸",en:"Size",placeholder:"10-15cm tall"},
  {path:"useCase.primaryUse",zh:"用途",en:"Use",placeholder:"desk phone stand"},
  {path:"useCase.environment",zh:"環境",en:"Env",placeholder:"indoor"},
];

function getSpecField(spec: DesignSpec, path: string): string {
  const parts = path.split(".");
  let val: unknown = spec;
  for (const p of parts) { val = (val as Record<string,unknown>)?.[p]; }
  if (Array.isArray(val)) return val.join(", ");
  return String(val ?? "");
}

function setSpecField(spec: DesignSpec, path: string, value: string): DesignSpec {
  const parts = path.split(".");
  const result = JSON.parse(JSON.stringify(spec));
  let obj: Record<string,unknown> = result;
  for (let i = 0; i < parts.length - 1; i++) { obj = obj[parts[i]] as Record<string,unknown>; }
  const last = parts[parts.length - 1];
  if (last === "keyFeatures") obj[last] = value.split(",").map(s=>s.trim()).filter(Boolean);
  else obj[last] = value;
  return result;
}

function CreatePageInner() {
  const router = useRouter();
  const { lang, setLang, t } = useLang();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pid, setPid] = useState<string|null>(null);

  // Structured spec
  const [spec, setSpec] = useState<DesignSpec>(EMPTY_SPEC);
  const [message, setMessage] = useState("");
  const [specReady, setSpecReady] = useState(false);
  const [showSpec, setShowSpec] = useState(true);

  // Result
  const [result, setResult] = useState<{id?:string;content?:string;craftedPrompt:string;negativePrompt:string}|null>(null);
  const [copied, setCopied] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Sketch/Upload
  const [mode, setMode] = useState<"text"|"sketch"|"image"|"model">("text");
  const [sketchNotes, setSketchNotes] = useState("");

  const filledCount = FIELD_CONFIG.filter(f => {
    const v = getSpecField(spec, f.path);
    return v && v !== "" && v !== "false" && v !== "0" && v !== "indoor";
  }).length;

  // ══════════════ Extract spec from text ══════════════

  const handleExtract = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      let id = pid;
      if (!id) { const r = await fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:input.slice(0,80),description:input})}); id=(await r.json()).id; setPid(id); }

      const text = mode==="sketch" ? `[Sketch notes]: ${sketchNotes}\n[Description]: ${input}` : input;

      const res = await fetch("/api/prompt/extract", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:id,text})});
      const data = await res.json();

      if (data.spec) {
        setSpec(data.spec);
        setMessage(data.message);
        setSpecReady(true);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // ══════════════ Craft from spec ══════════════

  const handleCraft = async () => {
    if (!pid) return;
    setLoading(true);
    try {
      const res = await fetch("/api/prompt/craft", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,spec})});
      const data = await res.json();
      setResult(data.promptVersion);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Iterate
  const handleIterate = async () => {
    if (!feedback.trim()||!pid) return;
    setLoading(true);
    try {
      const res = await fetch("/api/prompt/craft", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,spec,feedback})});
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

  const MODES = [
    {key:"text" as const,icon:Sparkles,zh:"文字",en:"Text"},
    {key:"sketch" as const,icon:Pencil,zh:"畫畫",en:"Sketch"},
    {key:"image" as const,icon:ImagePlus,zh:"圖片",en:"Image"},
    {key:"model" as const,icon:Box,zh:"3D檔案",en:"3D File"},
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={()=>router.push("/")}>← {t("Back","返回")}</Button>
          <h1 className="text-lg font-semibold">{t("Prompt Generator","提示詞生成器")}</h1>
          <div className="flex-1"/>
          <Button variant="ghost" size="sm" onClick={()=>setLang(lang==="zh"?"en":"zh")}>{lang==="zh"?"EN":"中文"}</Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ═══ LEFT: Input + Spec Editor (3 cols) ═══ */}
          <div className="lg:col-span-3 space-y-4">
            {/* Modes */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {MODES.map(m=>(<button key={m.key} onClick={()=>setMode(m.key)} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${mode===m.key?"bg-white text-blue-700 shadow-sm":"text-gray-600 hover:text-gray-900"}`}><m.icon className="w-3.5 h-3.5"/><span className="hidden sm:inline">{lang==="zh"?m.zh:m.en}</span></button>))}
            </div>
            {mode==="sketch"&&<><SketchPad onSave={()=>{}}/><Textarea value={sketchNotes} onChange={e=>setSketchNotes(e.target.value)} placeholder={t("Notes...","備註...")} rows={2} className="resize-none text-sm"/></>}
            {mode==="image"&&<ReferenceImageUploader projectId={pid} onUpload={()=>{}}/>}
            {mode==="model"&&<ReferenceModelUploader projectId={pid} onUpload={()=>{}}/>}

            <Textarea value={input} onChange={e=>setInput(e.target.value)}
              placeholder={t("Describe your object in detail...","詳細描述您的物品...")} rows={4} className="resize-none text-sm"/>

            {!specReady ? (
              <Button onClick={handleExtract} disabled={loading||!input.trim()} className="w-full" size="lg">
                {loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<Wand2 className="w-4 h-4 mr-2"/>}
                {t("Extract Structured Spec","提取結構化規格")}
              </Button>
            ) : (
              <div className="space-y-3">
                {/* Spec editor */}
                <div className="border rounded-lg bg-white">
                  <button onClick={()=>setShowSpec(!showSpec)} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-gray-50">
                    <span className="flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-blue-600"/>
                      {t("Structured Spec","結構化規格")}
                      <span className="text-xs text-gray-400">({filledCount}/{FIELD_CONFIG.length})</span>
                    </span>
                    {showSpec?<ChevronUp className="w-4 h-4"/>:<ChevronDown className="w-4 h-4"/>}
                  </button>
                  {showSpec && (
                    <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                      {FIELD_CONFIG.map(f=>{
                        const val = getSpecField(spec, f.path);
                        const filled = val && val !== "" && val !== "false" && val !== "0" && val !== "indoor";
                        return (
                          <div key={f.path} className="space-y-0.5">
                            <label className={`text-[10px] font-medium ${filled?"text-green-600":"text-gray-400"}`}>
                              {lang==="zh"?f.zh:f.en}{!filled?" *":""}
                            </label>
                            <Input
                              value={val}
                              onChange={e=>setSpec(setSpecField(spec,f.path,e.target.value))}
                              placeholder={f.placeholder}
                              className={`h-7 text-xs ${filled?"border-green-200":"border-amber-200 bg-amber-50"}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {message && <p className="text-xs text-blue-600 bg-blue-50 rounded px-3 py-2">{message}</p>}

                {!result ? (
                  <Button onClick={handleCraft} disabled={loading} className="w-full" size="lg">
                    {loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<Sparkles className="w-4 h-4 mr-2"/>}
                    {t("Generate 9-Section Prompt","生成 9-Section 提示詞")}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1 flex gap-1">
                        <Textarea value={feedback} onChange={e=>setFeedback(e.target.value)}
                          placeholder={t("Want changes?","想修改？")} rows={1} className="resize-none text-sm"
                          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleIterate();}}}/>
                        <Button size="sm" variant="outline" onClick={handleIterate} disabled={!feedback.trim()||loading}>
                          {loading?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>}
                        </Button>
                      </div>
                      <Button onClick={handleGenImages} disabled={genLoading} className="shrink-0">
                        {genLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<ArrowRight className="w-4 h-4 mr-1"/>}{t("2D","生成")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ═══ RIGHT: Result (2 cols) ═══ */}
          <div className="lg:col-span-2">
            {result ? (
              <Card>
                <CardContent className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
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
                <p className="text-sm">{!specReady ? t("Describe → Extract → Edit → Generate","描述→提取→編輯→生成") : t("Review spec → Generate","檢查規格→生成")}</p>
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
