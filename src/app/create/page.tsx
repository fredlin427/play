"use client";

import { useState, useRef } from "react";
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

function CreatePageInner() {
  const router = useRouter();
  const { lang:toggleLang, setLang, t } = useLang();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pid, setPid] = useState<string|null>(null);
  const [convLang, setConvLang] = useState<"zh"|"en"|null>(null);
  const [msgs, setMsgs] = useState<Array<{role:"user"|"ai";text:string}>>([]);

  // Spec state
  const [spec, setSpec] = useState<DesignSpec>(EMPTY_SPEC);
  const [specReady, setSpecReady] = useState(false);
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
    if (!pid) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/prompt/craft", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,spec})});
      const data = await res.json();
      setResult(data.promptVersion);
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
    if (!pid||!result) return;
    setGenLoading(true); setError(null);
    try {
      const proj = await (await fetch(`/api/projects/${pid}`)).json();
      const pv = proj.promptVersions?.[0];
      if (!pv) throw new Error("No version");
      await fetch("/api/hunyuan/text-to-image", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,promptVersionId:pv.id,prompt:result.craftedPrompt,negativePrompt:result.negativePrompt,numImages:1,multiView})});
      router.push(`/projects/${pid}`);
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={()=>router.push("/")}>← {t("Back","返回")}</Button>
          <h1 className="text-lg font-semibold">{t("Design Consultation","設計諮詢")}</h1>
          <div className="flex-1"/>
          <Button variant="ghost" size="sm" onClick={()=>setLang(toggleLang==="zh"?"en":"zh")}>{toggleLang==="zh"?"EN":"中文"}</Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0"/>
            <span className="text-sm text-red-700 flex-1">{error}</span>
            {errorRetry && <Button variant="outline" size="sm" onClick={()=>{setError(null);errorRetry();}}>{t("Retry","重試")}</Button>}
            <Button variant="ghost" size="sm" onClick={()=>setError(null)}>✕</Button>
          </div>
        )}

        {/* Category progress bars */}
        {specReady && coverage && !result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{spec.subject.name||"..."}</span>
              <span className="text-gray-500">{t("Round","輪")} {askContext.round}/5 · {Math.round(coverage.overall*100)}%</span>
            </div>
            {Object.entries(coverage.byCategory).map(([cat, data]) => (
              <div key={cat} className="flex items-center gap-2 text-xs">
                <span className="w-16 text-right text-gray-500">{cl==="zh"?data.label.zh:data.label.en}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div className={`h-2 rounded-full ${data.ratio>=1?"bg-green-500":data.ratio>=0.5?"bg-yellow-500":"bg-red-400"}`} style={{width:`${data.ratio*100}%`}}/>
                </div>
                <span className="w-8 text-gray-400">{data.filled}/{data.total}</span>
              </div>
            ))}
          </div>
        )}

        {/* Legacy progress bar (fallback when coverage not available) */}
        {specReady && !coverage && !result && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{spec.subject.name||"..."}</span>
              <span className="text-gray-500">{progress}% · {t("Round","輪")} {askContext.round}/5</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-blue-600 h-2.5 rounded-full" style={{width:`${progress}%`}}/>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ═══ LEFT: Chat + Q&A ═══ */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {MODES.map(m=>(<button key={m.key} onClick={()=>setMode(m.key)} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium ${mode===m.key?"bg-white text-blue-700 shadow-sm":"text-gray-600 hover:text-gray-900"}`}><m.icon className="w-3.5 h-3.5"/><span className="hidden sm:inline">{toggleLang==="zh"?m.zh:m.en}</span></button>))}
            </div>
            {mode==="sketch"&&<><SketchPad onSave={(dataUrl)=>{setSketchDataUrl(dataUrl);setUploadedImages([{id:"sketch",fileName:"sketch.png",previewUrl:dataUrl}]);}}/><Textarea value={sketchNotes} onChange={e=>setSketchNotes(e.target.value)} placeholder={cl==="zh"?"備註（形狀、尺寸、材質...）":"Notes (shape, size, material...)"} rows={2} className="resize-none text-sm"/></>}
            {mode==="image"&&<ReferenceImageUploader projectId={pid} onUpload={(imgs)=>{setUploadedImages(imgs);if(imgs.length>0 && !input.trim()) setInput(cl==="zh"?"請根據這些參考圖生成一個...":"Generate a 3D-printable object based on these reference images...");}}/>}
            {mode==="model"&&<ReferenceModelUploader projectId={pid} onUpload={(models)=>{setUploadedModels(models);if(models.length>0 && !input.trim()) setInput(cl==="zh"?"請根據這個3D模型生成...":"Generate a matching object based on this 3D model reference...");}}/>}

            {/* File status badge */}
            {mode!=="text" && (sketchDataUrl||uploadedImages.length>0||uploadedModels.length>0) && (
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                <ImagePlus className="w-3.5 h-3.5"/>
                {mode==="sketch" && <span>{cl==="zh"?"✓ 草圖已匯出":"✓ Sketch exported"}{sketchNotes?` · ${cl==="zh"?"備註":"notes"}: ${sketchNotes.slice(0,40)}`  :""}</span>}
                {mode==="image" && <span>{uploadedImages.length} {cl==="zh"?"張參考圖":"reference image(s)"}</span>}
                {mode==="model" && <span>{uploadedModels.length} {cl==="zh"?"個模型":"model(s)"}: {uploadedModels.map((m:any)=>m.fileName).join(", ")}</span>}
              </div>
            )}

            {/* Chat messages — natural flow, no scroll jail */}
            <div className="space-y-3">
              {msgs.map((m,i)=>(
                <div key={`${m.role}-${i}-${m.text.slice(0,10)}`} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role==="user"?"bg-blue-600 text-white rounded-br-md":"bg-white border text-gray-800 rounded-bl-md shadow-sm"}`}>{m.text}</div>
                </div>
              ))}

              {/* ⭐ Accumulated spec summary */}
              {specReady && !result && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 space-y-0.5">
                  <span className="font-medium text-gray-700">{cl==="zh"?"已收集：":"Collected: "}</span>
                  {[
                    spec.visual.material && `${cl==="zh"?"材質":"material"}:${spec.visual.material}`,
                    spec.visual.color && `${cl==="zh"?"顏色":"color"}:${spec.visual.color}`,
                    spec.dimensions.approximateSize && `${cl==="zh"?"尺寸":"size"}:${spec.dimensions.approximateSize}`,
                    spec.structure.mainShape && `${cl==="zh"?"形狀":"shape"}:${spec.structure.mainShape}`,
                    (spec.visual.texture||spec.visual.finish) && `${cl==="zh"?"表面":"surface"}:${[spec.visual.texture,spec.visual.finish].filter(Boolean).join(" ")}`,
                    spec.visual.edgeTreatment && `${cl==="zh"?"邊緣":"edge"}:${spec.visual.edgeTreatment}`,
                    spec.structure.details && `${cl==="zh"?"細節":"detail"}:${spec.structure.details.slice(0,40)}`,
                  ].filter(Boolean).map((t,i)=><span key={i} className="inline-block bg-white rounded px-1.5 py-0.5 mr-1 mb-1 border">{t}</span>)}
                  {!spec.visual.material && !spec.visual.color && !spec.dimensions.approximateSize && !spec.structure.mainShape && <span>{cl==="zh"?"尚未收集任何資訊":"No info collected yet"}</span>}
                  {(spec.visual.material||spec.visual.color||spec.dimensions.approximateSize) && spec.structure.mainShape && spec.visual.texture && (
                    <span className="text-green-600 ml-1">{cl==="zh"?"✓ 資訊充足":"✓ Good detail"}</span>
                  )}
                </div>
              )}

              {/* ⭐ Single question at a time */}
              {questions.length > 0 && !loading && !result && (
                <div ref={questionRef} className="space-y-3 bg-blue-50/50 rounded-xl p-4 border border-blue-200">
                  <p className="text-base font-semibold text-gray-900">{questions[0].question}</p>
                  {/* Text input — primary for dimensions/free-text, secondary for option questions */}
                  <div className="flex gap-2">
                    <Input value={customAnswer} onChange={e=>setCustomAnswer(e.target.value)}
                      placeholder={questions[0].options.filter(o=>!o.includes("跳過")&&!o.includes("skip")).length===0
                        ? (cl==="zh"?"請直接輸入...":"Type your answer...")
                        : (cl==="zh"?"或自行輸入...":"Or type your own...")}
                      className="h-10 text-sm flex-1"
                      autoFocus={questions[0].options.filter(o=>!o.includes("跳過")&&!o.includes("skip")).length===0}
                      onKeyDown={e=>{if(e.key==="Enter"&&customAnswer.trim()){e.preventDefault();handleAnswer(questions[0],customAnswer.trim());}}}/>
                    {customAnswer.trim() && (
                      <Button size="sm" onClick={()=>handleAnswer(questions[0],customAnswer.trim())}>✓</Button>
                    )}
                  </div>
                  {/* Options — only if there are meaningful choices beyond skip */}
                  {questions[0].options.filter(o=>!o.includes("跳過")&&!o.includes("skip")).length>0 && (
                    <div className="grid grid-cols-1 gap-2">
                      {questions[0].options.filter(o=>!o.includes("跳過")&&!o.includes("skip")).map((opt,idx)=>(
                        <button key={idx} onClick={()=>handleAnswer(questions[0],opt)}
                          className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 hover:shadow-md flex items-center gap-3">
                          <span className="shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{idx+1}</span>
                          <span className="text-sm font-medium">{opt}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={()=>handleSkip(questions[0])}
                    className="w-full text-center text-xs py-2 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50">
                    {cl==="zh"?"⏭️ 不確定，跳過":"⏭️ Unsure, skip"}
                  </button>
                </div>
              )}

              {loading && <div className="flex items-center gap-2 text-sm text-blue-600"><Loader2 className="w-4 h-4 animate-spin"/>{t("Thinking...","思考中...")}</div>}
            </div>

            {/* Input / Craft button */}
            <div className="space-y-2">
              {!specReady ? (
                <>
                  {(mode==="text"||mode==="image"||mode==="model")&&(
                    <Textarea value={input} onChange={e=>setInput(e.target.value)}
                      placeholder={mode==="image"
                        ? (cl==="zh" ? "描述參考圖中的物品，或直接描述想要生成的..." : "Describe the object in the reference, or what to generate...")
                        : mode==="model"
                        ? (cl==="zh" ? "描述3D模型，或想要生成的變體..." : "Describe the 3D model, or desired variant...")
                        : (cl==="zh" ? "描述您想創建的物品..." : "Describe what you want to create...")}
                      rows={3} className="resize-none text-sm"/>
                  )}
                  <Button onClick={handleExtract} disabled={loading||(!input.trim()&&!(sketchDataUrl||uploadedImages.length>0||uploadedModels.length>0))} className="w-full" size="lg">
                    {loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<MessageSquare className="w-4 h-4 mr-2"/>}
                    {t("Start","開始")}
                  </Button>
                </>
              ) : result ? (
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-1">
                    <Textarea value={feedback} onChange={e=>setFeedback(e.target.value)}
                      placeholder={cl==="zh"?"修改意見...":"Feedback..."} rows={1} className="resize-none text-sm"
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleIterate();}}}/>
                    <Button size="sm" variant="outline" onClick={handleIterate} disabled={!feedback.trim()||loading}>
                      {loading?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>}
                    </Button>
                  </div>
                  <Button onClick={()=>handleGenImages(false)} disabled={genLoading} variant="outline" className="shrink-0">
                    {genLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<ArrowRight className="w-4 h-4 mr-1"/>}1 View
                  </Button>
                  <Button onClick={()=>handleGenImages(true)} disabled={genLoading} className="shrink-0">
                    {genLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<Box className="w-4 h-4 mr-1"/>}4 Views
                  </Button>
                </div>
              ) : (
                questions.length === 0 && <Button onClick={handleCraft} disabled={loading} className="w-full" size="lg">{loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<Wand2 className="w-4 h-4 mr-2"/>}{t("Generate Prompt","✨ 生成提示詞")}</Button>
              )}
            </div>
          </div>

          {/* ═══ RIGHT: Spec + Result ═══ */}
          <div className="lg:col-span-2 space-y-4">
            {/* Spec panel — auto-expands for review after Q&A */}
            {specReady && !result && (
              <Card className={questions.length===0 && spec.subject.name ? "ring-2 ring-blue-400 shadow-lg" : ""}>
                <CardContent className="p-4 space-y-3">
                <button onClick={()=>setShowSpec(!showSpec)} className="w-full flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-blue-600"/>
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
                          <label className={`text-[10px] font-medium ${filled?"text-green-600":"text-amber-600"}`}>{cl==="zh"?f.zh:f.en}</label>
                          <Input value={val} onChange={e=>{const ns=setField(spec,f.path,e.target.value);setSpec(ns);updateProgress(ns);}} placeholder="..." className={`h-7 text-xs ${filled?"border-green-200":"border-amber-200 bg-amber-50"}`}/>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent></Card>
            )}

            {/* Result: SD Prompt */}
            {result && (
              <Card><CardContent className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between sticky top-0 bg-white pb-2 border-b">
                  <CardTitle className="text-sm"><Sparkles className="w-4 h-4 text-blue-600 inline mr-1"/>SD Prompt</CardTitle>
                  <Button variant="ghost" size="sm" onClick={()=>{navigator.clipboard.writeText(result.craftedPrompt);setCopied(true);setTimeout(()=>setCopied(false),2000);}}>
                    {copied?<Check className="w-3.5 h-3.5 text-green-600"/>:<Copy className="w-3.5 h-3.5"/>}
                  </Button>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-semibold text-green-700 mb-1">Positive Prompt (發給 SD)</h4>
                    <p className="text-sm bg-green-50 rounded-lg p-3 leading-relaxed break-all font-mono text-xs">{result.craftedPrompt}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-red-700 mb-1">Negative Prompt</h4>
                    <p className="text-sm bg-red-50 rounded-lg p-3 leading-relaxed break-all font-mono text-xs">{result.negativePrompt}</p>
                  </div>
                </div>
              </CardContent></Card>
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
