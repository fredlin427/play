"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LangProvider, useLang } from "@/lib/lang-context";
import { detectLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { SketchPad } from "@/components/create/SketchPad";
import { ReferenceImageUploader } from "@/components/create/ReferenceImageUploader";
import { ReferenceModelUploader } from "@/components/create/ReferenceModelUploader";
import { ArrowRight, Sparkles, Pencil, ImagePlus, Box, Loader2, Copy, Check, MessageSquare, Send, RefreshCw, Lightbulb, Wand2 } from "lucide-react";
import type { DesignSpec } from "@/lib/schemas";
import { EMPTY_SPEC } from "@/lib/schemas";

interface QnA { path: string; question: string; options: string[] }
type InputMode = "text" | "sketch" | "image" | "model";

const MODES: Array<{key:InputMode;icon:typeof Sparkles;en:string;zh:string}> = [
  {key:"text",icon:Sparkles,en:"Text",zh:"文字"},{key:"sketch",icon:Pencil,en:"Sketch",zh:"畫畫"},
  {key:"image",icon:ImagePlus,en:"Image",zh:"圖片"},{key:"model",icon:Box,en:"3D File",zh:"3D檔案"},
];

// Field label mapping for progress display
const FIELD_LABELS: Record<string,{zh:string;en:string}> = {
  "object.name":{zh:"物品名稱",en:"Object"},
  "object.type":{zh:"類型",en:"Type"},
  "visual.style":{zh:"風格",en:"Style"},
  "visual.material":{zh:"材質",en:"Material"},
  "visual.color":{zh:"顏色",en:"Color"},
  "visual.texture":{zh:"紋理",en:"Texture"},
  "visual.finish":{zh:"表面",en:"Finish"},
  "visual.edgeTreatment":{zh:"邊緣",en:"Edges"},
  "composition.viewAngle":{zh:"視角",en:"View"},
  "composition.background":{zh:"背景",en:"Bg"},
  "composition.lighting":{zh:"燈光",en:"Light"},
  "composition.renderStyle":{zh:"渲染",en:"Render"},
  "features.keyFeatures":{zh:"特徵",en:"Features"},
  "dimensions.approximateSize":{zh:"尺寸",en:"Size"},
  "useCase.primaryUse":{zh:"用途",en:"Use"},
  "useCase.environment":{zh:"環境",en:"Env"},
};

function CreatePageInner() {
  const router = useRouter();
  const { lang, setLang, t } = useLang();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<InputMode>("text");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState<string|null>(null);
  const [conversation, setConversation] = useState<Array<{role:"user"|"ai";text:string}>>([]);

  // ── Structured spec collection ──
  const [spec, setSpec] = useState<DesignSpec>(EMPTY_SPEC);
  const [questions, setQuestions] = useState<QnA[]>([]);
  const [totalFields, setTotalFields] = useState(16);
  const [filledFields, setFilledFields] = useState(0);
  const [readyToCraft, setReadyToCraft] = useState(false);
  const [customInput, setCustomInput] = useState("");

  // ── Result ──
  const [promptResult, setPromptResult] = useState<{id?:string;version?:number;content?:string;craftedPrompt:string;negativePrompt:string}|null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ── Sketch/Upload ──
  const [sketchDataUrl, setSketchDataUrl] = useState<string|null>(null);
  const [sketchNotes, setSketchNotes] = useState("");
  const [uploadedImageIds, setUploadedImageIds] = useState<string[]>([]);
  const [uploadedModelIds, setUploadedModelIds] = useState<string[]>([]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [conversation,questions]);

  // ══════════════ Analyze (fills spec progressively) ══════════════

  const doAnalyze = async (userText: string) => {
    setLoading(true);
    setConversation(prev => [...prev, {role:"user",text:userText}]);

    try {
      let pid = projectId;
      if (!pid) {
        const r = await fetch("/api/projects", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:userText.slice(0,80),description:userText})});
        pid = (await r.json()).id; setProjectId(pid);
      }

      const body: Record<string,unknown> = {projectId:pid, userMessage:userText, currentSpec:spec};
      if (sketchDataUrl&&mode==="sketch") body.sketchDescription = `User drew sketch. ${sketchNotes||""}`;
      if (uploadedImageIds.length>0&&mode==="image") body.referenceImageAnalyses = uploadedImageIds;
      if (uploadedModelIds.length>0&&mode==="model") body.referenceModelAnalyses = uploadedModelIds;

      const res = await fetch("/api/prompt/analyze", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data = await res.json();

      setConversation(prev => [...prev, {role:"ai",text:data.assistantMessage}]);
      setSpec(data.spec);
      setTotalFields(data.totalFields||16);
      setFilledFields(data.filledFields||0);

      if (data.readyToCraft) {
        setQuestions([]);
        setReadyToCraft(true);
      } else if (data.nextQuestions?.length > 0) {
        setQuestions(data.nextQuestions);
        setReadyToCraft(false);
      } else {
        // Fallback: ask 2 basic questions
        setQuestions([
          {path:"visual.style",question:t("What style?","什麼風格？"),options:t("Minimal,Industrial,Artistic,Organic,Futuristic,Other","簡約,工業風,藝術,有機,未來感,其他").split(",")},
          {path:"visual.material",question:t("What material?","什麼材質？"),options:t("Plastic,Resin,Metal,Wood,Ceramic,Other","塑膠,樹脂,金屬,木材,陶瓷,其他").split(",")},
        ]);
        setReadyToCraft(false);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // ══════════════ Craft ══════════════

  const doCraft = async (feedback?: string) => {
    if (!projectId) return;
    setLoading(true);
    if (feedback) setConversation(prev => [...prev, {role:"user",text:feedback}]);
    try {
      const res = await fetch("/api/prompt/craft", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,spec,feedback})});
      const data = await res.json();
      setPromptResult(data.promptVersion);
      setConversation(prev => [...prev, {role:"ai",text:data.assistantMessage}]);
      setReadyToCraft(false); setQuestions([]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // ══════════════ Handlers ══════════════

  const handleStart = async () => {
    const text = sketchNotes || description;
    if (!text.trim()) return;
    await doAnalyze(text.trim());
  };

  const handleOption = async (q: QnA, opt: string) => {
    setQuestions([]); setCustomInput("");
    await doAnalyze(`${q.question} → ${opt}`);
  };

  const handleGenerate = async () => {
    if (!projectId||!promptResult) return;
    setGenerating(true);
    try {
      const proj = await (await fetch(`/api/projects/${projectId}`)).json();
      const pv = proj.promptVersions?.[0];
      if (!pv) throw new Error("No version");
      await fetch("/api/hunyuan/text-to-image", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,promptVersionId:pv.id,prompt:promptResult.craftedPrompt,negativePrompt:promptResult.negativePrompt,numImages:4})});
      router.push(`/projects/${projectId}`);
    } catch (err) { console.error(err); }
    finally { setGenerating(false); }
  };

  // ══════════════ Render ══════════════

  const progress = totalFields > 0 ? Math.round((filledFields/totalFields)*100) : 0;
  const showLang = detectLang(spec.object?.name||description||"")==="zh"?"zh":lang;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={()=>router.push("/")}>← {t("Back","返回")}</Button>
          <h1 className="text-lg font-semibold">{t("Design Consultation","設計諮詢")}</h1>
          <div className="flex-1"/>
          <Button variant="ghost" size="sm" onClick={()=>setLang(lang==="zh"?"en":"zh")}>{lang==="zh"?"EN":"中文"}</Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Progress bar */}
        {spec.object?.name && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-900">{spec.object.name}</span>
              <span className="text-gray-500">{filledFields}/{totalFields} fields · {progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{width:`${progress}%`}}/>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ═══ Main ═══ */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {MODES.map(m=>(<button key={m.key} onClick={()=>setMode(m.key)} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${mode===m.key?"bg-white text-blue-700 shadow-sm":"text-gray-600 hover:text-gray-900"}`}><m.icon className="w-3.5 h-3.5"/><span className="hidden sm:inline">{lang==="zh"?m.zh:m.en}</span></button>))}
            </div>
            {mode==="sketch"&&<SketchPad onSave={setSketchDataUrl}/>}
            {mode==="image"&&<ReferenceImageUploader projectId={projectId} onUpload={imgs=>setUploadedImageIds(imgs.map(i=>i.id))}/>}
            {mode==="model"&&<ReferenceModelUploader projectId={projectId} onUpload={models=>setUploadedModelIds(models.map(m=>m.id))}/>}

            {/* Conversation */}
            <div className="space-y-3 max-h-[350px] overflow-y-auto">
              {conversation.map((m,i)=>(
                <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role==="user"?"bg-blue-600 text-white rounded-br-md":"bg-white border text-gray-800 rounded-bl-md shadow-sm"}`}>{m.text}</div>
                </div>
              ))}

              {/* LLM-generated questions */}
              {questions.length > 0 && !loading && !promptResult && (
                <div className="ml-1 pl-4 border-l-2 border-blue-300 space-y-4">
                  {questions.map(q=>(
                    <div key={q.path} className="space-y-1.5">
                      <p className="text-sm font-semibold text-gray-800">{q.question}</p>
                      {q.options.map((opt,idx)=>(
                        <button key={idx} onClick={()=>handleOption(q,opt)}
                          className="w-full text-left text-sm px-4 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-all shadow-sm">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-2">{idx+1}</span>{opt}
                        </button>
                      ))}
                    </div>
                  ))}
                  <button onClick={()=>setCustomInput(showLang==="zh"?"自訂回答...":"Custom answer...")}
                    className="w-full text-left text-sm px-4 py-2.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold mr-2">✎</span>{t("Or type...","或輸入...")}
                  </button>
                </div>
              )}

              {loading && <div className="flex items-center gap-2 text-sm text-blue-600"><Loader2 className="w-4 h-4 animate-spin"/>{t("Thinking...","思考中...")}</div>}
              <div ref={chatEndRef}/>
            </div>

            {/* Input */}
            <div className="space-y-2">
              {!spec.object?.name ? (
                <>
                  {mode==="sketch"&&<Textarea value={sketchNotes} onChange={e=>setSketchNotes(e.target.value)} placeholder={t("Notes...","備註...")} rows={2} className="resize-none text-sm"/>}
                  {(mode==="text"||mode==="image"||mode==="model")&&(
                    <Textarea value={description} onChange={e=>setDescription(e.target.value)}
                      placeholder={t("Describe what you want to create...","描述您想創建的物品...")} rows={3} className="resize-none text-sm"
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleStart();}}}/>
                  )}
                  <Button onClick={handleStart} disabled={loading||(!description.trim()&&!sketchNotes.trim())} className="w-full" size="lg">
                    {loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<MessageSquare className="w-4 h-4 mr-2"/>}
                    {t("Start Design Consultation","開始設計諮詢")}
                  </Button>
                </>
              ) : customInput ? (
                <div className="flex gap-2">
                  <Textarea autoFocus value={customInput} onChange={e=>setCustomInput(e.target.value)}
                    placeholder={t("Type your answer...","輸入回答...")} rows={1} className="resize-none text-sm flex-1"
                    onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doAnalyze(customInput);setCustomInput("");}}}/>
                  <Button size="sm" onClick={()=>{doAnalyze(customInput);setCustomInput("");}} disabled={!customInput.trim()}><Send className="w-3.5 h-3.5"/></Button>
                </div>
              ) : readyToCraft ? (
                <Button onClick={()=>doCraft()} disabled={loading} className="w-full" size="lg">
                  {loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<Wand2 className="w-4 h-4 mr-2"/>}
                  {t("Craft My Prompt!","✨ 生成我的提示詞！")}
                </Button>
              ) : promptResult ? (
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-1">
                    <Textarea value={customInput} onChange={e=>setCustomInput(e.target.value)}
                      placeholder={t("Want changes? Type feedback...","想修改？輸入意見...")} rows={1} className="resize-none text-sm"
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doCraft(customInput);setCustomInput("");}}}/>
                    <Button size="sm" variant="outline" onClick={()=>{doCraft(customInput);setCustomInput("");}} disabled={!customInput.trim()||loading}>
                      {loading?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>}
                    </Button>
                  </div>
                  <Button onClick={handleGenerate} disabled={generating} className="shrink-0">
                    {generating?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<ArrowRight className="w-4 h-4 mr-1"/>}{t("Generate","生成")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          {/* ═══ Right ═══ */}
          <div className="space-y-4">
            {/* Spec fields collected so far */}
            {spec.object?.name && !promptResult && (
              <Card>
                <CardContent className="p-4 space-y-1.5">
                  <CardTitle className="text-xs font-medium text-gray-500 uppercase mb-2">{t("Collected Specs","已收集規格")}</CardTitle>
                  {Object.entries(FIELD_LABELS).map(([path,labels])=>{
                    const val = path.split(".").reduce((obj:any,k)=>obj?.[k],spec);
                    const filled = val && (Array.isArray(val) ? val.length>0 : val !== "" && val !== false);
                    return (
                      <div key={path} className="flex items-center gap-2 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full ${filled?"bg-green-500":"bg-gray-300"}`}/>
                        <span className="text-gray-500 w-16 shrink-0">{showLang==="zh"?labels.zh:labels.en}</span>
                        <span className={`truncate ${filled?"text-gray-900 font-medium":"text-gray-300 italic"}`}>
                          {filled ? (Array.isArray(val)?(val as string[]).join(", "):String(val)) : "—"}
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Prompt result */}
            {promptResult && (
              <Card>
                <CardContent className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div className="flex items-center justify-between sticky top-0 bg-white pb-2 border-b">
                    <CardTitle className="text-sm"><Sparkles className="w-4 h-4 text-blue-600 inline mr-1"/>{t("Full Prompt Package","完整提示詞方案")}</CardTitle>
                    <Button variant="ghost" size="sm" onClick={()=>{navigator.clipboard.writeText(promptResult.content||promptResult.craftedPrompt);setCopied(true);setTimeout(()=>setCopied(false),2000);}}>
                      {copied?<Check className="w-3.5 h-3.5 text-green-600"/>:<Copy className="w-3.5 h-3.5"/>}
                    </Button>
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed"
                    dangerouslySetInnerHTML={{__html:(promptResult.content||promptResult.craftedPrompt)
                      .replace(/## ([^\n]+)/g,'<h3 class="text-base font-bold text-gray-900 mt-4 mb-2 border-b pb-1">$1</h3>')
                      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
                      .replace(/^- (.+)$/gm,'<li class="ml-4 text-gray-700">$1</li>')
                      .replace(/\n\n/g,'<br/><br/>')}}/>
                </CardContent>
              </Card>
            )}

            {!spec.object?.name && (
              <div className="flex flex-col items-center justify-center text-center py-16 text-gray-400">
                <MessageSquare className="w-14 h-14 mb-4 opacity-20"/>
                <p className="text-sm">{t("Describe your idea → answer questions → get your prompt!","描述想法→回答問題→獲得提示詞！")}</p>
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
