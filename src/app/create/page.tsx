"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LangProvider, useLang } from "@/lib/lang-context";
import { detectLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { SketchPad } from "@/components/create/SketchPad";
import { ReferenceImageUploader } from "@/components/create/ReferenceImageUploader";
import { ReferenceModelUploader } from "@/components/create/ReferenceModelUploader";
import { ArrowRight, Sparkles, Pencil, ImagePlus, Box, Loader2, Copy, Check, RefreshCw, Wand2, Lightbulb, ChevronDown, ChevronUp, MessageSquare, AlertCircle } from "lucide-react";
import type { DesignSpec } from "@/lib/schemas";
import { EMPTY_SPEC } from "@/lib/schemas";
import type { AskContext } from "@/lib/agents/prompt-helper";
import type { CoverageReport } from "@/lib/agents/coverage";
import { TERMINATION } from "@/lib/agents/field-tiers";
import { getSpecPath } from "@/lib/agents/prompt-template";
import { getCoverage } from "@/lib/agents/coverage";

const CRITICAL_FIELDS = ["subject.name","meta.assetType","meta.generationGoal","visual.material","meta.style","visual.color","dimensions.approximateSize","useCase.primaryUse"];
const ALL_FIELDS = [
  {path:"subject.name",zh:"物品名",en:"Name"},
  {path:"meta.assetType",zh:"類型",en:"Type"},
  {path:"meta.generationGoal",zh:"目標",en:"Goal"},
  {path:"meta.style",zh:"風格",en:"Style"},
  {path:"visual.material",zh:"材質",en:"Material"},
  {path:"visual.color",zh:"顏色",en:"Color"},
  {path:"visual.texture",zh:"紋理",en:"Texture"},
  {path:"visual.finish",zh:"表面",en:"Finish"},
  {path:"visual.edgeTreatment",zh:"邊緣",en:"Edges"},
  {path:"dimensions.approximateSize",zh:"尺寸",en:"Size"},
  {path:"useCase.primaryUse",zh:"用途",en:"Use"},
  {path:"useCase.environment",zh:"環境",en:"Env"},
];

function getField(spec: DesignSpec, path: string): string {
  const parts = path.split(".");
  let v: unknown = spec;
  for (const p of parts) v = (v as Record<string,unknown>)?.[p];
  if (Array.isArray(v)) return (v as string[]).join(", ");
  return String(v ?? "");
}

function setField(spec: DesignSpec, path: string, value: string): DesignSpec {
  const parts = path.split(".");
  const result = JSON.parse(JSON.stringify(spec));
  let obj: Record<string,unknown> = result;
  for (let i=0;i<parts.length-1;i++) obj=obj[parts[i]] as Record<string,unknown>;
  const last = parts[parts.length-1];
  if (last==="keyFeatures") obj[last]=value.split(",").map((s:string)=>s.trim()).filter(Boolean);
  else obj[last]=value;
  return result;
}

const QA_STORAGE_KEY = "qa_session_v1";

function loadSession() {
  try {
    const raw = localStorage.getItem(QA_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveSession(data: Record<string, unknown>) {
  try {
    localStorage.setItem(QA_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[Session] Save failed:", String(e).slice(0, 80));
  }
}

function CreatePageInner() {
  const router = useRouter();
  const { lang:toggleLang, setLang, t } = useLang();

  // Restore previous session on mount
  const saved = loadSession();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pid, setPid] = useState<string|null>(saved?.pid || null);
  const [convLang, setConvLang] = useState<"zh"|"en"|null>(saved?.convLang || null);
  const [msgs, setMsgs] = useState<Array<{role:"user"|"ai";text:string}>>(saved?.msgs || []);

  // Spec state
  const [spec, setSpec] = useState<DesignSpec>(saved?.spec || EMPTY_SPEC);
  const [specReady, setSpecReady] = useState(saved?.specReady || false);
  const [showSpec, setShowSpec] = useState(false);
  const [progress, setProgress] = useState(0);

  // Q&A — multi-round with context
  const [questions, setQuestions] = useState<Array<{field:string;question:string;options:string[]}>>([]);
  const [askContext, setAskContext] = useState<AskContext>({round:0,askedFields:[],answeredFields:[],skippedFields:[],coverage:null});
  const [coverage, setCoverage] = useState<CoverageReport|null>(null);
  const [qaHistory, setQaHistory] = useState<Array<{q:string;a:string;skipped:boolean}>>([]);
  const [customAnswer, setCustomAnswer] = useState("");

  // Error + retry
  const [error, setError] = useState<string|null>(null);
  const [errorRetry, setErrorRetry] = useState<(()=>void)|null>(null);

  // Result
  const [result, setResult] = useState<{id?:string;content?:string;craftedPrompt:string;negativePrompt:string}|null>(null);
  const [copied, setCopied] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Sketch/Upload
  const [mode, setMode] = useState<"text"|"sketch"|"image"|"model">("text");
  const [sketchNotes, setSketchNotes] = useState("");
  const [sketchDataUrl, setSketchDataUrl] = useState<string|null>(null);
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [uploadedModels, setUploadedModels] = useState<any[]>([]);

  const cl = convLang || toggleLang;

  const questionRef = useRef<HTMLDivElement>(null);

  // Scroll to question when a new one appears
  useEffect(() => {
    if (questions.length > 0 && questionRef.current) {
      questionRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [questions]);

  // Auto-save session for recovery on refresh (M2: QA persistence)
  useEffect(() => {
    saveSession({ pid, convLang, msgs, spec, specReady, result });
  }, [pid, convLang, msgs, spec, specReady, result]);

  const updateProgress = (s: DesignSpec) => {
    const cov = getCoverage(s);
    setProgress(Math.round(cov.overall * 100));
  };

  // ══════════════ Extract ══════════════

  const handleExtract = async () => {
    const hasFiles = mode==="sketch" ? !!sketchDataUrl : mode==="image" ? uploadedImages.length > 0 : mode==="model" ? uploadedModels.length > 0 : false;
    if (!input.trim() && !hasFiles) return;
    setLoading(true); setError(null);
    setMsgs(prev=>[...prev,{role:"user",text:input || (cl==="zh"?"開始分析...":"Starting analysis...")}]);

    try {
      let id = pid;
      if (!id) { const r=await fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:input.slice(0,80)||"New Project",description:input})}); id=(await r.json()).id; setPid(id); }

      const dl = detectLang(input);
      if (!convLang) setConvLang(dl);

      // Build context-aware input text
      let text = input;
      if (mode==="sketch" && sketchDataUrl) {
        text = `[Sketch attached + Notes: ${sketchNotes || "none"}]\n${input || "Analyze this sketch"}`;
      } else if (mode==="sketch") {
        text = `[Sketch]: ${sketchNotes}\n${input}`;
      } else if (mode==="image") {
        text = `[Reference Images: ${uploadedImages.length} uploaded]\n${input || "Analyze these reference images and generate a matching 3D-printable prompt"}`;
      } else if (mode==="model") {
        text = `[Reference Models: ${uploadedModels.length} uploaded (${uploadedModels.map((m:any)=>m.fileName).join(", ")} )]\n${input || "Analyze this 3D model reference and generate a matching prompt"}`;
      }

      const res = await fetch("/api/prompt/extract", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:id,text})});
      const data = await res.json();

      if (data.spec) {
        setSpec(data.spec); setSpecReady(true);
        setMsgs(prev=>[...prev,{role:"ai",text:data.message}]);
        updateProgress(data.spec);

        // First round of questions
        const askLang = data.lang || convLang || dl || "en";
        const ctx: AskContext = {round:0,askedFields:[],answeredFields:[],skippedFields:[],coverage:null};
        const aRes = await fetch("/api/prompt/ask", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({spec:data.spec,lang:askLang,context:ctx})});
        const aData = await aRes.json();
        const qs = aData.questions || [];
        setQuestions(qs);
        setAskContext(aData.context || {...ctx,round:1});
        setCoverage(aData.context?.coverage || null);
        if (qs.length > 0) setMsgs(prev=>[...prev,{role:"ai",text:qs[0].message || (askLang==="zh"?"請選擇：":"Choose:")}]);
      }
    } catch (err: any) { setError(`Extract: ${err.message||String(err)}`); setErrorRetry(()=>handleExtract); }
    finally { setLoading(false); }
  };

  // ══════════════ Answer question ══════════════

  const handleAnswer = async (q: {field:string;question:string;options:string[]}, opt: string) => {
    setLoading(true); setError(null);
    setQaHistory(prev=>[...prev,{q:q.question,a:opt,skipped:false}]);
    setMsgs(prev=>[...prev,{role:"user",text:opt}]);

    // Map answer to spec fields. Try to detect multiple fields from free-text
    const specPath = getSpecPath(q.field);
    let newSpec = setField(spec, specPath, opt);

    // Smart parse: if answer looks like multi-field input, try to fill other fields too
    if (opt.includes(" ") || opt.match(/\d+x\d+/i)) {
      const parts = opt.split(/[,，\s]+/).filter((p: string) => p.length > 0);
      for (const part of parts) {
        if (part.match(/^\d+[xX×]\d+/)) newSpec = setField(newSpec, "dimensions.approximateSize", part);
        else if (part.match(/^(白色|灰色|黑色|藍色|紅色|黃色|綠色|透明|米色|奶油|銀色|white|grey|black|blue|red|yellow|green|transparent|beige|cream|silver)$/i)) newSpec = setField(newSpec, "visual.color", part);
        else if (part.match(/^(PLA|PETG|ABS|樹脂|resin|TPU|金屬|metal|木頭|wood|鋼|steel|鋁|aluminum|塑膠|plastic|玻璃|glass|矽膠|silicone|層壓板|laminate)$/i)) newSpec = setField(newSpec, "visual.material", part);
        else if (part.match(/^\d{2,4}$/)) newSpec = setField(newSpec, "dimensions.approximateSize", part + "mm");
      }
    }

    setSpec(newSpec);
    updateProgress(newSpec);
    const freshCov = getCoverage(newSpec);
    setCoverage(freshCov);
    const newAnswered = [...askContext.answeredFields, q.field];
    const newAsked = [...askContext.askedFields, q.field];

    const remaining = questions.filter(x => x.field !== q.field);
    setQuestions(remaining);

    try {
      // Recompute coverage with updated spec (fixes stale-coverage bug)
      const freshCoverage = getCoverage(newSpec);
      const newCtx: AskContext = {...askContext, answeredFields:newAnswered, askedFields:newAsked, coverage: freshCoverage};
      const coveredEnough = freshCoverage.shouldTerminate;
      const maxedOut = newCtx.round >= TERMINATION.MAX_ROUNDS;

      if (maxedOut || (remaining.length === 0 && coveredEnough)) {
        setQuestions([]);
        setAskContext(newCtx);
        setShowSpec(true); // Auto-expand spec for review
        const msg = maxedOut
          ? (cl==="zh" ? `已達最大輪數。請檢查下方資訊後生成提示詞。` : `Max rounds reached. Review and generate.`)
          : (cl==="zh" ? `✅ 資訊收集完成！請檢查並編輯下方規格，確認無誤後生成提示詞。` : `✅ Done! Review the spec below, then generate.`);
        setMsgs(prev=>[...prev,{role:"ai",text:msg}]);
      } else if (remaining.length === 0) {
        // Fetch next batch
        const aRes = await fetch("/api/prompt/ask", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({spec:newSpec,lang:convLang||"en",context:newCtx})});
        const aData = await aRes.json();
        const qs = aData.questions || [];
        setQuestions(qs);
        setAskContext(aData.context || newCtx);
        setCoverage(aData.context?.coverage || null);
        if (qs.length > 0) setMsgs(prev=>[...prev,{role:"ai",text:qs[0].message || (cl==="zh"?"請選擇：":"Choose:")}]);
      } else {
        setAskContext(newCtx);
      }
    } catch (err: any) { setError(`Answer: ${err.message||String(err)}`); setErrorRetry(()=>handleAnswer(q,opt)); }
    finally { setLoading(false); setCustomAnswer(""); }
  };

  // ══════════════ Skip question ══════════════

  const handleSkip = (q: {field:string;question:string;options:string[]}) => {
    setQaHistory(prev=>[...prev,{q:q.question,a:cl==="zh"?"不確定":"Unsure",skipped:true}]);
    setMsgs(prev=>[...prev,{role:"user",text:cl==="zh"?"⏭️ 不確定":"⏭️ Unsure"}]);

    const newSkipped = [...askContext.skippedFields, q.field];
    const newAsked = [...askContext.askedFields, q.field];
    const remaining = questions.filter(x => x.field !== q.field);
    setQuestions(remaining);

    const newCtx: AskContext = {...askContext, skippedFields:newSkipped, askedFields:newAsked};
    setAskContext(newCtx);

    const coveredEnough = newCtx.coverage?.shouldTerminate;

    if (remaining.length === 0 && !coveredEnough) {
      setLoading(true);
      fetch("/api/prompt/ask", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({spec,lang:convLang||"en",context:newCtx})})
        .then(r=>r.json()).then(aData=>{
          const qs = aData.questions || [];
          setQuestions(qs);
          setAskContext(aData.context || newCtx);
          setCoverage(aData.context?.coverage || null);
          if (qs.length>0) setMsgs(prev=>[...prev,{role:"ai",text:qs[0].message||(cl==="zh"?"請選擇：":"Choose:")}]);
        }).catch(err=>{setError(`Skip: ${err.message||String(err)}`); setLoading(false);})
        .finally(()=>setLoading(false));
    } else if (remaining.length === 0 && coveredEnough) {
      setShowSpec(true);
      setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"?"✅ 請檢查並編輯下方規格後生成。":"✅ Review spec below, then generate."}]);
    }
  };

  // ══════════════ Craft ══════════════

  const handleCraft = async () => {
    if (!pid) { setError("No project ID — try refreshing"); return; }
    setLoading(true); setError(null);
    // Show streaming preview immediately
    setResult({ id: "", craftedPrompt: "", negativePrompt: "" });

    try {
      const res = await fetch("/api/prompt/craft/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec, projectId: pid }) });
      if (!res.ok) throw new Error(`Stream ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream body");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Process complete SSE messages
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) {
              setResult({ id: data.id || "", craftedPrompt: data.positive, negativePrompt: data.negative || "" });
            } else if (data.token) {
              setResult(prev => prev ? { ...prev, craftedPrompt: data.full } : { id: "", craftedPrompt: data.full, negativePrompt: "" });
            }
          } catch (e) {
            console.warn("[Craft] SSE parse error:", String(e).slice(0, 40));
          }
        }
      }
    } catch (err: any) { setError(`Craft: ${err.message||String(err)}`); setErrorRetry(()=>handleCraft); }
    finally { setLoading(false); }
  };

  const handleIterate = async () => {
    if (!feedback.trim()||!pid) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/prompt/craft", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,spec,feedback})});
      const data = await res.json();
      setResult(data.promptVersion);
      setFeedback("");
    } catch (err: any) { setError(`Iterate: ${err.message||String(err)}`); setErrorRetry(()=>handleIterate); }
    finally { setLoading(false); }
  };

  const handleGenImages = async (multiView = false) => {
    if (!pid||!result||!result.id) return;
    setGenLoading(true); setError(null);
    try {
      const res = await fetch("/api/hunyuan/text-to-image", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,promptVersionId:result.id,prompt:result.craftedPrompt,negativePrompt:result.negativePrompt,numImages:1,multiView})});
      if (!res.ok) throw new Error(`T2I ${res.status}: ${(await res.json()).error || "Unknown"}`);
      // Stay on page — user can iterate or view images on project page
      setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"
        ? `✅ 圖片已生成！可繼續修改 prompt，或前往專案頁面查看。`
        : `✅ Images generated! Refine the prompt below, or view on the project page.`}]);
    } catch (err: any) { setError(`Gen Images: ${err.message||String(err)}`); setErrorRetry(()=>handleGenImages); }
    finally { setGenLoading(false); }
  };

  const MODES = [
    {key:"text" as const,icon:Sparkles,zh:"文字",en:"Text"},
    {key:"sketch" as const,icon:Pencil,zh:"畫畫",en:"Sketch"},
    {key:"image" as const,icon:ImagePlus,zh:"圖片",en:"Image"},
    {key:"model" as const,icon:Box,zh:"3D檔案",en:"3D File"},
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-rose-50">
      {/* Header — refined with subtle shadow */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-amber-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={()=>router.push("/")} className="text-gray-500 hover:text-amber-700">← {t("Back","返回")}</Button>
          <h1 className="text-lg font-semibold bg-gradient-to-r from-amber-600 to-rose-500 bg-clip-text text-transparent">
            {t("AI Design Studio","AI 設計工作室")}
          </h1>
          <div className="flex-1"/>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
            {t("AI Ready","AI 就緒")}
          </div>
          <Button variant="ghost" size="sm" onClick={()=>setLang(toggleLang==="zh"?"en":"zh")} className="text-xs text-gray-400 hover:text-gray-700">
            {toggleLang==="zh"?"EN":"中文"}
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Error banner — softer */}
        {error && (
          <div className="bg-red-50/80 backdrop-blur-sm border border-red-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0"/>
            <span className="text-sm text-red-600 flex-1">{error}</span>
            {errorRetry && <Button variant="outline" size="sm" onClick={()=>{setError(null);errorRetry();}} className="border-red-300 text-red-600 hover:bg-red-50">{t("Retry","重試")}</Button>}
            <Button variant="ghost" size="sm" onClick={()=>setError(null)} className="text-red-400 hover:text-red-600">✕</Button>
          </div>
        )}

        {/* Progress — pill-style with gradient */}
        {specReady && coverage && !result && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-amber-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500"/>
                {spec.subject.name||"..."}
              </span>
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                {t("Round","輪")} {askContext.round}/{TERMINATION.MAX_ROUNDS} · {Math.round(coverage.overall*100)}%
              </span>
            </div>
            {Object.entries(coverage.byCategory).map(([cat, data]) => (
              <div key={cat} className="flex items-center gap-3 text-xs">
                <span className="w-16 text-right text-gray-500">{cl==="zh"?data.label.zh:data.label.en}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      data.ratio>=1 ? "bg-gradient-to-r from-green-400 to-emerald-500" :
                      data.ratio>=0.5 ? "bg-gradient-to-r from-amber-400 to-orange-500" :
                      "bg-gradient-to-r from-red-300 to-rose-400"
                    }`}
                    style={{width:`${data.ratio*100}%`}}
                  />
                </div>
                <span className="w-8 text-gray-400 tabular-nums">{data.filled}/{data.total}</span>
              </div>
            ))}
          </div>
        )}

        {/* Legacy progress bar */}
        {specReady && !coverage && !result && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-amber-100 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-800">{spec.subject.name||"..."}</span>
              <span className="text-xs text-gray-400">{progress}% · {t("Round","輪")} {askContext.round}/{TERMINATION.MAX_ROUNDS}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-400 to-rose-500 h-2 rounded-full transition-all duration-700" style={{width:`${progress}%`}}/>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ═══ LEFT: Chat + Q&A ═══ */}
          <div className="lg:col-span-3 space-y-4">
            {/* Mode tabs — pill style */}
            <div className="flex gap-1 bg-white/80 backdrop-blur-sm rounded-2xl p-1.5 shadow-sm border border-amber-100">
              {MODES.map(m=>(
                <button key={m.key} onClick={()=>setMode(m.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                    mode===m.key
                      ? "bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-md"
                      : "text-gray-500 hover:text-gray-700 hover:bg-amber-50"
                  }`}
                >
                  <m.icon className="w-3.5 h-3.5"/>
                  <span className="hidden sm:inline">{toggleLang==="zh"?m.zh:m.en}</span>
                </button>
              ))}
            </div>

            {mode==="sketch"&&<><SketchPad onSave={(dataUrl)=>{setSketchDataUrl(dataUrl);setUploadedImages([{id:"sketch",fileName:"sketch.png",previewUrl:dataUrl}]);}}/><Textarea value={sketchNotes} onChange={e=>setSketchNotes(e.target.value)} placeholder={cl==="zh"?"備註（形狀、尺寸、材質...）":"Notes (shape, size, material...)"} rows={2} className="resize-none text-sm rounded-xl"/></>}
            {mode==="image"&&<ReferenceImageUploader projectId={pid} onUpload={(imgs)=>{setUploadedImages(imgs);if(imgs.length>0 && !input.trim()) setInput(cl==="zh"?"請根據這些參考圖生成一個...":"Generate a 3D-printable object based on these reference images...");}}/>}
            {mode==="model"&&<ReferenceModelUploader projectId={pid} onUpload={(models)=>{setUploadedModels(models);if(models.length>0 && !input.trim()) setInput(cl==="zh"?"請根據這個3D模型生成...":"Generate a matching object based on this 3D model reference...");}}/>}

            {/* File status badge */}
            {mode!=="text" && (sketchDataUrl||uploadedImages.length>0||uploadedModels.length>0) && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50/80 backdrop-blur-sm rounded-xl px-3 py-2 border border-emerald-100">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
                {mode==="sketch" && <span>{cl==="zh"?"✓ 草圖已匯出":"✓ Sketch exported"}{sketchNotes?` · ${sketchNotes.slice(0,40)}`  :""}</span>}
                {mode==="image" && <span>{uploadedImages.length} {cl==="zh"?"張參考圖":"reference image(s)"}</span>}
                {mode==="model" && <span>{uploadedModels.length} {cl==="zh"?"個模型":"model(s)"}: {uploadedModels.map((m:any)=>m.fileName).join(", ")}</span>}
              </div>
            )}

            {/* Chat messages */}
            <div className="space-y-3">
              {msgs.map((m,i)=>(
                <div key={`${m.role}-${i}-${m.text.slice(0,10)}`} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role==="user"
                      ? "bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-br-md shadow-md"
                      : "bg-white/90 backdrop-blur-sm border border-amber-100 text-gray-700 rounded-bl-md shadow-sm"
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}

              {/* Accumulated spec summary — warm tags */}
              {specReady && !result && (
                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-3 border border-amber-100 space-y-1.5">
                  <span className="text-xs font-semibold text-amber-700">{cl==="zh"?"📋 已收集：":"📋 Collected: "}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      spec.visual.material && {label:cl==="zh"?"材質":"material",val:spec.visual.material,color:"bg-amber-50 text-amber-700 border-amber-200"},
                      spec.visual.color && {label:cl==="zh"?"顏色":"color",val:spec.visual.color,color:"bg-rose-50 text-rose-700 border-rose-200"},
                      spec.dimensions.approximateSize && {label:cl==="zh"?"尺寸":"size",val:spec.dimensions.approximateSize,color:"bg-blue-50 text-blue-700 border-blue-200"},
                      spec.structure.mainShape && {label:cl==="zh"?"形狀":"shape",val:spec.structure.mainShape,color:"bg-purple-50 text-purple-700 border-purple-200"},
                      (spec.visual.texture||spec.visual.finish) && {label:cl==="zh"?"表面":"surface",val:[spec.visual.texture,spec.visual.finish].filter(Boolean).join(" "),color:"bg-emerald-50 text-emerald-700 border-emerald-200"},
                      spec.visual.edgeTreatment && {label:cl==="zh"?"邊緣":"edge",val:spec.visual.edgeTreatment,color:"bg-teal-50 text-teal-700 border-teal-200"},
                      spec.structure.details && {label:cl==="zh"?"細節":"detail",val:spec.structure.details.slice(0,40),color:"bg-indigo-50 text-indigo-700 border-indigo-200"},
                    ].filter(Boolean).map((t:any,i)=>(
                      <span key={i} className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border ${t.color}`}>
                        <span className="opacity-60">{t.label}</span>
                        <span className="font-medium">{t.val}</span>
                      </span>
                    ))}
                    {!spec.visual.material && !spec.visual.color && !spec.dimensions.approximateSize && !spec.structure.mainShape &&
                      <span className="text-xs text-gray-400">{cl==="zh"?"尚未收集任何資訊":"No info collected yet"}</span>
                    }
                  </div>
                </div>
              )}

              {/* Question card — soft glow */}
              {questions.length > 0 && !loading && !result && (
                <div ref={questionRef} className="space-y-4 bg-gradient-to-br from-amber-50/90 via-white to-rose-50/90 backdrop-blur-sm rounded-2xl p-5 border border-amber-200 shadow-lg shadow-amber-100/50">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center shadow-sm">
                      <Sparkles className="w-4 h-4 text-white"/>
                    </div>
                    <p className="text-base font-semibold text-gray-800 pt-1">{questions[0].question}</p>
                  </div>

                  {/* Text input */}
                  <div className="flex gap-2">
                    <Input value={customAnswer} onChange={e=>setCustomAnswer(e.target.value)}
                      placeholder={questions[0].options.filter(o=>!o.includes("跳過")&&!o.includes("skip")).length===0
                        ? (cl==="zh"?"請直接輸入...":"Type your answer...")
                        : (cl==="zh"?"或自行輸入...":"Or type your own...")}
                      className="h-11 text-sm flex-1 rounded-xl border-amber-200 focus:border-amber-400 focus:ring-amber-400"
                      autoFocus={questions[0].options.filter(o=>!o.includes("跳過")&&!o.includes("skip")).length===0}
                      onKeyDown={e=>{if(e.key==="Enter"&&customAnswer.trim()){e.preventDefault();handleAnswer(questions[0],customAnswer.trim());}}}/>
                    {customAnswer.trim() && (
                      <Button size="sm" onClick={()=>handleAnswer(questions[0],customAnswer.trim())} className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 shadow-sm">
                        <ArrowRight className="w-4 h-4"/>
                      </Button>
                    )}
                  </div>

                  {/* Option buttons — card style */}
                  {questions[0].options.filter(o=>!o.includes("跳過")&&!o.includes("skip")).length>0 && (
                    <div className="grid grid-cols-1 gap-2">
                      {questions[0].options.filter(o=>!o.includes("跳過")&&!o.includes("skip")).map((opt,idx)=>(
                        <button key={idx} onClick={()=>handleAnswer(questions[0],opt)}
                          className="group w-full text-left px-4 py-3 rounded-2xl border-2 border-amber-100 bg-white hover:border-amber-400 hover:bg-gradient-to-r hover:from-amber-50 hover:to-rose-50 hover:shadow-lg transition-all duration-200 flex items-center gap-3">
                          <span className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-white text-xs font-bold flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                            {idx+1}
                          </span>
                          <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{opt}</span>
                          <ArrowRight className="w-4 h-4 text-amber-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"/>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Skip button */}
                  <button onClick={()=>handleSkip(questions[0])}
                    className="w-full text-center text-xs py-2.5 rounded-xl border-2 border-dashed border-amber-200 text-amber-400 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50/50 transition-colors">
                    {cl==="zh"?"⏭️ 不確定，跳過":"⏭️ Unsure, skip"}
                  </button>
                </div>
              )}

              {loading && (
                <div className="flex items-center gap-3 text-sm text-amber-600 bg-white/80 backdrop-blur-sm rounded-2xl px-4 py-3 border border-amber-100">
                  <Loader2 className="w-4 h-4 animate-spin"/>
                  <span>{t("Thinking...","AI 思考中...")}</span>
                </div>
              )}
            </div>

            {/* Bottom input bar */}
            <div className="space-y-2">
              {!specReady ? (
                <>
                  {(mode==="text"||mode==="image"||mode==="model")&&(
                    <Textarea value={input} onChange={e=>setInput(e.target.value)}
                      placeholder={mode==="image"
                        ? (cl==="zh" ? "描述參考圖中的物品，或直接描述想要生成的..." : "Describe the object in the reference, or what to generate...")
                        : mode==="model"
                        ? (cl==="zh" ? "描述3D模型，或想要生成的變體..." : "Describe the 3D model, or desired variant...")
                        : (cl==="zh" ? "描述您想創建的物品，例如：白色醫療櫃，木材，直立矩形盒狀，200mm..." : "Describe what you want to create, e.g. a white medical cabinet, wood, vertical box shape...")}
                      rows={3} className="resize-none text-sm rounded-2xl border-amber-200 focus:border-amber-400"/>
                  )}
                  <Button onClick={handleExtract} disabled={loading||(!input.trim()&&!(sketchDataUrl||uploadedImages.length>0||uploadedModels.length>0))}
                    className="w-full h-12 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 shadow-lg shadow-amber-200 text-white font-semibold text-base transition-all duration-300 hover:shadow-xl hover:shadow-amber-300 hover:-translate-y-0.5">
                    {loading
                      ? <><Loader2 className="w-5 h-5 animate-spin mr-2"/> {t("Analyzing...","分析中...")}</>
                      : <><MessageSquare className="w-5 h-5 mr-2"/> {t("Start Creating","✨ 開始創作")}</>
                    }
                  </Button>
                </>
              ) : result ? (
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-1">
                    <Textarea value={feedback} onChange={e=>setFeedback(e.target.value)}
                      placeholder={cl==="zh"?"修改意見...":"Feedback..."} rows={1}
                      className="resize-none text-sm rounded-xl border-amber-200"
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleIterate();}}}/>
                    <Button size="sm" variant="outline" onClick={handleIterate} disabled={!feedback.trim()||loading}
                      className="rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50">
                      {loading?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>}
                    </Button>
                  </div>
                  <Button onClick={()=>handleGenImages(false)} disabled={genLoading||!result.craftedPrompt} variant="outline"
                    className="rounded-xl border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-700 shrink-0">
                    {genLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<ArrowRight className="w-4 h-4 mr-1"/>}1 View
                  </Button>
                  <Button onClick={()=>handleGenImages(true)} disabled={genLoading||!result.craftedPrompt}
                    className="rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white shadow-md shrink-0">
                    {genLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<Box className="w-4 h-4 mr-1"/>}4 Views
                  </Button>
                </div>
              ) : (
                questions.length === 0 && (
                  <Button onClick={handleCraft} disabled={loading}
                    className="w-full h-12 rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-violet-200 text-white font-semibold text-base transition-all duration-300 hover:shadow-xl hover:shadow-violet-300 hover:-translate-y-0.5">
                    {loading
                      ? <><Loader2 className="w-5 h-5 animate-spin mr-2"/> {t("Generating...","生成中...")}</>
                      : <><Wand2 className="w-5 h-5 mr-2"/> {t("Generate Prompt","✨ 生成提示詞")}</>
                    }
                  </Button>
                )
              )}
            </div>
          </div>

          {/* ═══ RIGHT: Spec + Result ═══ */}
          <div className="lg:col-span-2 space-y-4">
            {/* Spec panel */}
            {specReady && !result && (
              <Card className={`bg-white/80 backdrop-blur-sm border-amber-100 transition-all duration-500 ${questions.length===0 && spec.subject.name ? "ring-2 ring-amber-400 shadow-xl shadow-amber-200/50" : "shadow-sm"}`}>
                <CardContent className="p-4 space-y-3">
                <button onClick={()=>setShowSpec(!showSpec)} className="w-full flex items-center justify-between text-sm font-medium text-gray-700 hover:text-amber-700 transition-colors">
                  <span className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500"/>
                    {questions.length===0 && spec.subject.name
                      ? (cl==="zh"?"✏️ 請檢查並編輯規格":"✏️ Review & edit spec")
                      : t("Structured Spec","結構化規格")}
                  </span>
                  {showSpec?<ChevronUp className="w-4 h-4"/>:<ChevronDown className="w-4 h-4"/>}
                </button>
                {showSpec && (
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_FIELDS.map(f=>{
                      const val = getField(spec,f.path);
                      const filled = val && val!=="" && val!=="false" && val!=="0" && val!=="indoor";
                      return (
                        <div key={f.path} className="space-y-0.5">
                          <label className={`text-[10px] font-medium ${filled?"text-emerald-600":"text-amber-600"}`}>
                            {cl==="zh"?f.zh:f.en}{filled?" ✓":""}
                          </label>
                          <Input value={val} onChange={e=>{const ns=setField(spec,f.path,e.target.value);setSpec(ns);updateProgress(ns);}}
                            placeholder="..."
                            className={`h-8 text-xs rounded-xl transition-colors ${filled
                              ? "border-emerald-200 bg-emerald-50/50 focus:border-emerald-400"
                              : "border-amber-200 bg-amber-50/50 focus:border-amber-400"}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent></Card>
            )}

            {/* Result: SD Prompt — elegant cards */}
            {result && (
              <Card className="bg-white/80 backdrop-blur-sm border-amber-100 shadow-lg overflow-hidden">
                <CardContent className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-sm pb-3 border-b border-amber-100">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500"/>
                      <span className="bg-gradient-to-r from-amber-600 to-rose-500 bg-clip-text text-transparent font-bold">SD Prompt</span>
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={()=>{navigator.clipboard.writeText(result.craftedPrompt);setCopied(true);setTimeout(()=>setCopied(false),2000);}}
                      className="rounded-xl text-xs text-gray-400 hover:text-amber-600">
                      {copied?<><Check className="w-3.5 h-3.5 text-emerald-500"/> {t("Copied","已複製")}</>:<><Copy className="w-3.5 h-3.5"/> {t("Copy","複製")}</>}
                    </Button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xs font-semibold text-emerald-600 mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
                        Positive Prompt
                        {loading && <Loader2 className="w-3 h-3 animate-spin ml-1"/>}
                      </h4>
                      <p className="text-sm bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl p-4 leading-relaxed text-gray-700 border border-emerald-100 shadow-inner">
                        {result.craftedPrompt || (loading
                          ? <span className="text-emerald-400 italic">{t("Generating your prompt...","正在為您生成提示詞...")}</span>
                          : ""
                        )}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-rose-600 mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"/>
                        Negative Prompt
                      </h4>
                      <p className="text-sm bg-gradient-to-br from-rose-50 to-red-50 rounded-2xl p-4 leading-relaxed text-gray-600 border border-rose-100 shadow-inner">
                        {result.negativePrompt || (loading ? "..." : "")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
