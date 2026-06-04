"use client";

import { useState, useEffect, useRef } from "react";
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
import { ArrowRight, Sparkles, Pencil, ImagePlus, Box, Loader2, Copy, Check, RefreshCw, Wand2, Lightbulb, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import type { DesignSpec } from "@/lib/schemas";
import { EMPTY_SPEC } from "@/lib/schemas";

const CRITICAL_FIELDS = ["object.name","visual.material","visual.style","visual.color","dimensions.approximateSize","useCase.primaryUse","visual.texture"];
const ALL_FIELDS = [
  {path:"object.name",zh:"物品名",en:"Name"},
  {path:"visual.material",zh:"材質",en:"Material"},
  {path:"visual.style",zh:"風格",en:"Style"},
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
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  // Q&A
  const [questions, setQuestions] = useState<Array<{field:string;question:string;options:string[]}>>([]);
  const [askCount, setAskCount] = useState(0);
  const [askedFields, setAskedFields] = useState<string[]>([]);

  // Result
  const [result, setResult] = useState<{id?:string;content?:string;craftedPrompt:string;negativePrompt:string}|null>(null);
  const [copied, setCopied] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Sketch/Upload
  const [mode, setMode] = useState<"text"|"sketch"|"image"|"model">("text");
  const [sketchNotes, setSketchNotes] = useState("");

  const cl = convLang || toggleLang;

  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs,questions]);

  const updateProgress = (s: DesignSpec) => {
    const filled = CRITICAL_FIELDS.filter(f=>{const v=getField(s,f);return v&&v!==""&&v!=="false"&&v!=="0"&&v!=="indoor";}).length;
    setProgress(Math.round((filled/CRITICAL_FIELDS.length)*100));
  };

  // ══════════════ Extract ══════════════

  const handleExtract = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setMsgs(prev=>[...prev,{role:"user",text:input}]);

    try {
      let id = pid;
      if (!id) { const r=await fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:input.slice(0,80),description:input})}); id=(await r.json()).id; setPid(id); }

      const dl = detectLang(input);
      if (!convLang) setConvLang(dl);

      const text = mode==="sketch" ? `[Sketch]: ${sketchNotes}\n${input}` : input;
      const res = await fetch("/api/prompt/extract", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:id,text})});
      const data = await res.json();

      if (data.spec) {
        setSpec(data.spec);
        setSpecReady(true);
        setMsgs(prev=>[...prev,{role:"ai",text:data.message}]);
        updateProgress(data.spec);

        // Ask first questions
        const askLang = data.lang || convLang || dl || "en";
        const aRes = await fetch("/api/prompt/ask", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({spec:data.spec,lang:askLang,askedFields:[]})});
        const aData = await aRes.json();
        const qs = aData.questions || [];
        setQuestions(qs);
        if (qs.length > 0) setMsgs(prev=>[...prev,{role:"ai",text:qs[0].message || (askLang==="zh"?"請選擇：":"Choose:")}]);
        setAskCount(1);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // ══════════════ Answer question ══════════════

  const handleAnswer = async (q: {field:string;question:string;options:string[]}, opt: string) => {
    setLoading(true);
    setMsgs(prev=>[...prev,{role:"user",text:opt}]);

    const newSpec = setField(spec, q.field, opt);
    setSpec(newSpec);
    updateProgress(newSpec);
    const newAsked = [...askedFields, q.field];
    setAskedFields(newAsked);

    // Remove this question from the list
    const remaining = questions.filter(x => x.field !== q.field);
    setQuestions(remaining);

    try {
      if (askCount >= 3 || progress >= 80) {
        setQuestions([]);
        setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"?"好的，已收集足夠資訊！":"Got enough info!"}]);
      } else if (remaining.length === 0) {
        // Ask next batch
        const aRes = await fetch("/api/prompt/ask", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({spec:newSpec,lang:convLang||"en",askedFields:newAsked})});
        const aData = await aRes.json();
        const qs = aData.questions || [];
        setQuestions(qs);
        if (qs.length > 0) setMsgs(prev=>[...prev,{role:"ai",text:qs[0].message || (cl==="zh"?"請選擇：":"Choose:")}]);
        setAskCount(prev=>prev+1);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // ══════════════ Craft ══════════════

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
          <h1 className="text-lg font-semibold">{t("Design Consultation","設計諮詢")}</h1>
          <div className="flex-1"/>
          <Button variant="ghost" size="sm" onClick={()=>setLang(toggleLang==="zh"?"en":"zh")}>{toggleLang==="zh"?"EN":"中文"}</Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Progress bar */}
        {specReady && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{spec.object.name||"..."}</span>
              <span className="text-gray-500">{progress}% · {t("Round","輪")} {askCount}/3</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{width:`${progress}%`}}/>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ═══ LEFT: Chat + Q&A ═══ */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {MODES.map(m=>(<button key={m.key} onClick={()=>setMode(m.key)} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${mode===m.key?"bg-white text-blue-700 shadow-sm":"text-gray-600 hover:text-gray-900"}`}><m.icon className="w-3.5 h-3.5"/><span className="hidden sm:inline">{toggleLang==="zh"?m.zh:m.en}</span></button>))}
            </div>
            {mode==="sketch"&&<><SketchPad onSave={()=>{}}/><Textarea value={sketchNotes} onChange={e=>setSketchNotes(e.target.value)} placeholder={t("Notes...","備註...")} rows={2} className="resize-none text-sm"/></>}
            {mode==="image"&&<ReferenceImageUploader projectId={pid} onUpload={()=>{}}/>}
            {mode==="model"&&<ReferenceModelUploader projectId={pid} onUpload={()=>{}}/>}

            {/* Chat messages */}
            <div className="space-y-3 max-h-[350px] overflow-y-auto">
              {msgs.map((m,i)=>(
                <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role==="user"?"bg-blue-600 text-white rounded-br-md":"bg-white border text-gray-800 rounded-bl-md shadow-sm"}`}>{m.text}</div>
                </div>
              ))}

              {/* ⭐ Questions with clickable options */}
              {questions.length > 0 && !loading && !result && questions.map((q,qi)=>(
                <div key={qi} className="ml-1 pl-4 border-l-2 border-blue-300 space-y-2">
                  <p className="text-sm font-semibold text-gray-800">{q.question}</p>
                  {q.options.map((opt,idx)=>(
                    <button key={idx} onClick={()=>handleAnswer(q,opt)}
                      className="w-full text-left text-sm px-4 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-all shadow-sm">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-2">{idx+1}</span>{opt}
                    </button>
                  ))}
                </div>
              ))}

              {loading && <div className="flex items-center gap-2 text-sm text-blue-600"><Loader2 className="w-4 h-4 animate-spin"/>{t("Thinking...","思考中...")}</div>}
              <div ref={chatEndRef}/>
            </div>

            {/* Input / Craft button */}
            <div className="space-y-2">
              {!specReady ? (
                <>
                  {(mode==="text"||mode==="image"||mode==="model")&&(
                    <Textarea value={input} onChange={e=>setInput(e.target.value)}
                      placeholder={cl==="zh" ? "描述您想創建的物品..." : "Describe what you want to create..."}
                      rows={3} className="resize-none text-sm"/>
                  )}
                  <Button onClick={handleExtract} disabled={loading||!input.trim()} className="w-full" size="lg">
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
                  <Button onClick={handleGenImages} disabled={genLoading} className="shrink-0">
                    {genLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<ArrowRight className="w-4 h-4 mr-1"/>}2D
                  </Button>
                </div>
              ) : (
                questions.length === 0 && <Button onClick={handleCraft} disabled={loading} className="w-full" size="lg">{loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<Wand2 className="w-4 h-4 mr-2"/>}{t("Generate Prompt","✨ 生成提示詞")}</Button>
              )}
            </div>
          </div>

          {/* ═══ RIGHT: Spec + Result ═══ */}
          <div className="lg:col-span-2 space-y-4">
            {/* Spec panel */}
            {specReady && !result && (
              <Card><CardContent className="p-4 space-y-3">
                <button onClick={()=>setShowSpec(!showSpec)} className="w-full flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2"><Lightbulb className="w-4 h-4 text-blue-600"/>{t("Structured Spec","結構化規格")}</span>
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

            {/* Result */}
            {result && (
              <Card><CardContent className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between sticky top-0 bg-white pb-2 border-b">
                  <CardTitle className="text-sm"><Sparkles className="w-4 h-4 text-blue-600 inline mr-1"/>{t("Prompt","提示詞")}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={()=>{navigator.clipboard.writeText(result.content||result.craftedPrompt);setCopied(true);setTimeout(()=>setCopied(false),2000);}}>
                    {copied?<Check className="w-3.5 h-3.5 text-green-600"/>:<Copy className="w-3.5 h-3.5"/>}
                  </Button>
                </div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed"
                  dangerouslySetInnerHTML={{__html:(result.content||result.craftedPrompt).replace(/## ([^\n]+)/g,'<h3 class="text-base font-bold text-gray-900 mt-4 mb-2 border-b pb-1">$1</h3>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/^- (.+)$/gm,'<li class="ml-4 text-gray-700">$1</li>').replace(/\n\n/g,'<br/><br/>')}}/>
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
