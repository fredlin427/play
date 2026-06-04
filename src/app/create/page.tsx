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
import { ArrowRight, Sparkles, Pencil, ImagePlus, Box, Loader2, Copy, Check, MessageSquare, Send, RefreshCw, Lightbulb, ChevronRight, Wand2 } from "lucide-react";

// ═══════════════ Question templates (frontend handles flow) ═══════════════

type QuestionField = "style" | "material" | "view" | "dimensions" | "features";
interface QuestionTemplate { field: QuestionField; zh: { question: string; options: string[] }; en: { question: string; options: string[] } }

const QT: QuestionTemplate[] = [
  { field: "style", zh: { question: "偏好什麼風格？", options: ["簡約乾淨","藝術裝飾","科技未來感","自然有機","專業實用"] }, en: { question: "What style?", options: ["Minimal & clean","Artistic / decorative","Futuristic / tech","Natural / organic","Professional / utilitarian"] } },
  { field: "material", zh: { question: "什麼材質質感？", options: ["啞光塑膠","亮光樹脂","金屬質感","木紋質感","透明材質"] }, en: { question: "Material finish?", options: ["Matte plastic","Glossy resin","Metallic","Wood texture","Transparent"] } },
  { field: "view", zh: { question: "最佳展示角度？", options: ["正面視圖","3/4視角","等距視圖","俯視圖","多角度展示"] }, en: { question: "Viewing angle?", options: ["Front view","3/4 angle","Isometric","Top-down","Multiple angles"] } },
  { field: "dimensions", zh: { question: "大概尺寸？", options: ["小巧(<10cm)","中型(10-20cm)","大型(20-30cm)","超大(>30cm)","無特定要求"] }, en: { question: "Approximate size?", options: ["Small (<4in)","Medium (4-8in)","Large (8-12in)","XL (>12in)","No preference"] } },
  { field: "features", zh: { question: "特別要求？", options: ["可調節/可動","圓潤邊緣","堆疊/組合式","防滑設計","沒有特別要求"] }, en: { question: "Special features?", options: ["Adjustable / moving","Rounded edges","Stackable / modular","Anti-slip","No special features"] } },
];

function CreatePageInner() {
  const router = useRouter();
  const { lang, setLang, t } = useLang();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Array<{ role: "user"|"ai"; text: string }>>([]);

  // Analysis
  const [understood, setUnderstood] = useState("");
  const [objectName, setObjectName] = useState("");
  const [fieldsComplete, setFieldsComplete] = useState<Record<string,boolean>>({});
  const [askedFields, setAskedFields] = useState<Set<string>>(new Set());
  const [pendingField, setPendingField] = useState<QuestionTemplate|null>(null);
  const [collectedAnswers, setCollectedAnswers] = useState<Record<string,string>>({});
  const [customInput, setCustomInput] = useState("");
  const [readyToCraft, setReadyToCraft] = useState(false);

  // Result
  const [promptResult, setPromptResult] = useState<{id?:string;version?:number;craftedPrompt:string;negativePrompt:string;styleNotes:string}|null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Mode + uploads
  type InputMode = "text" | "sketch" | "image" | "model";
  const [mode, setMode] = useState<InputMode>("text");
  const MODES: Array<{key:InputMode;icon:typeof Sparkles;en:string;zh:string}> = [
    {key:"text",icon:Sparkles,en:"Text",zh:"文字"},{key:"sketch",icon:Pencil,en:"Sketch",zh:"畫畫"},
    {key:"image",icon:ImagePlus,en:"Image",zh:"圖片"},{key:"model",icon:Box,en:"3D File",zh:"3D檔案"},
  ];

  // Sketch
  const [sketchDataUrl, setSketchDataUrl] = useState<string|null>(null);
  const [sketchNotes, setSketchNotes] = useState("");
  const [uploadedImageIds, setUploadedImageIds] = useState<string[]>([]);
  const [uploadedModelIds, setUploadedModelIds] = useState<string[]>([]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [conversation,pendingField]);

  // ══════════════ Analyze ══════════════
  const doAnalyze = async (userText: string, answers?: Record<string,string>) => {
    setLoading(true);
    setConversation(prev => [...prev, { role:"user", text:userText }]);
    const all = answers || collectedAnswers;

    try {
      let pid = projectId;
      if (!pid) {
        const r = await fetch("/api/projects", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({title:userText.slice(0,80),description:userText}) });
        pid = (await r.json()).id;
        setProjectId(pid);
      }

      const res = await fetch("/api/prompt/analyze", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({projectId:pid, userMessage:userText, collectedAnswers:all, lang:detectLang(userText)}),
      });
      const data = await res.json();
      const fc = data.fieldsComplete||{};

      setConversation(prev => [...prev, { role:"ai", text:data.assistantMessage }]);
      setUnderstood(data.understood);
      setObjectName(data.object);
      setFieldsComplete(fc);
      if (answers) setCollectedAnswers(answers);

      // Find next unanswered question
      const next = QT.find(q => !fc[q.field] && !askedFields.has(q.field));
      if (next && Object.values(fc).filter(Boolean).length < 5) {
        setPendingField(next);
        setAskedFields(prev => new Set([...prev, next.field]));
        setReadyToCraft(false);
      } else {
        setPendingField(null);
        setReadyToCraft(true);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // ══════════════ Craft ══════════════
  const doCraft = async (feedback?: string) => {
    if (!projectId) return;
    setLoading(true);
    if (feedback) setConversation(prev => [...prev, { role:"user", text:feedback }]);
    try {
      const res = await fetch("/api/prompt/craft", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({projectId, collectedAnswers, feedback, lang:detectLang(feedback||understood||"")}),
      });
      const data = await res.json();
      setPromptResult(data.promptVersion);
      setConversation(prev => [...prev, { role:"ai", text:data.assistantMessage }]);
      setReadyToCraft(false);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // ══════════════ Handlers ══════════════
  const handleStart = async () => {
    const text = sketchNotes || description;
    if (!text.trim()) return;
    await doAnalyze(text.trim());
  };

  const handleOption = async (q: QuestionTemplate, opt: string) => {
    const newAnswers = { ...collectedAnswers, [q.field]: opt };
    const key = `${q.field}: ${opt}`;
    setPendingField(null);
    setCustomInput("");
    await doAnalyze(key, newAnswers);
  };

  const handleGenerate = async () => {
    if (!projectId||!promptResult) return;
    setGenerating(true);
    try {
      const proj = await (await fetch(`/api/projects/${projectId}`)).json();
      const pv = proj.promptVersions?.[0];
      if (!pv) throw new Error("No version");
      await fetch("/api/hunyuan/text-to-image", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({projectId, promptVersionId:pv.id, prompt:promptResult.craftedPrompt, negativePrompt:promptResult.negativePrompt, numImages:4}) });
      router.push(`/projects/${projectId}`);
    } catch (err) { console.error(err); }
    finally { setGenerating(false); }
  };

  // ══════════════ Render ══════════════
  const q = pendingField;
  const qText = q ? (lang==="zh"?q.zh:q.en) : null;
  const progress = Object.values(fieldsComplete).filter(Boolean).length;

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

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Progress */}
        {objectName && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="font-medium text-gray-700">{objectName}</span>
            <ChevronRight className="w-3 h-3"/>
            <div className="flex gap-1">
              {QT.map(qq => (
                <span key={qq.field} className={`w-2.5 h-2.5 rounded-full transition-colors ${fieldsComplete[qq.field]?"bg-green-500":"bg-gray-300"}`} title={qq.field}/>
              ))}
            </div>
            <span className="text-xs ml-1">{progress}/5</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ═══ Main ═══ */}
          <div className="lg:col-span-2 space-y-4">
            {/* Mode tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {MODES.map(m=>(<button key={m.key} onClick={()=>setMode(m.key)} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${mode===m.key?"bg-white text-blue-700 shadow-sm":"text-gray-600 hover:text-gray-900"}`}><m.icon className="w-3.5 h-3.5"/><span className="hidden sm:inline">{lang==="zh"?m.zh:m.en}</span></button>))}
            </div>

            {/* Mode-specific content */}
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

              {/* Question with options */}
              {qText && !loading && !promptResult && (
                <div className="ml-1 pl-4 border-l-2 border-blue-300 space-y-2 animate-in fade-in">
                  <p className="text-sm font-semibold text-gray-800">{qText.question}</p>
                  {qText.options.map((opt,idx)=>(
                    <button key={idx} onClick={()=>handleOption(q!,opt)}
                      className="w-full text-left text-sm px-4 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-all shadow-sm">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-2">{idx+1}</span>{opt}
                    </button>
                  ))}
                  <button onClick={()=>setCustomInput(lang==="zh"?"自訂回答...":"Custom answer...")}
                    className="w-full text-left text-sm px-4 py-2.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold mr-2">✎</span>{t("Or type your own...","或自己輸入...")}
                  </button>
                </div>
              )}

              {loading && <div className="flex items-center gap-2 text-sm text-blue-600"><Loader2 className="w-4 h-4 animate-spin"/>{t("Thinking...","思考中...")}</div>}
              <div ref={chatEndRef}/>
            </div>

            {/* Input */}
            <div className="space-y-2">
              {!objectName ? (
                <>
                  {mode==="sketch"&&<Textarea value={sketchNotes} onChange={e=>setSketchNotes(e.target.value)} placeholder={t("Notes about your sketch...","草圖備註...")} rows={2} className="resize-none text-sm"/>}
                  {(mode==="text"||mode==="image"||mode==="model")&&(
                    <Textarea value={description} onChange={e=>setDescription(e.target.value)}
                      placeholder={t("In a few words, what do you want to create?\n\nE.g.: a 3-section adjustable phone stand, a dragon candle holder...","簡單描述您想創建什麼？\n\n例如：3節可調節手機支架、龍形蠟燭台...")}
                      rows={3} className="resize-none text-sm"
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
                    placeholder={t("Type your answer...","輸入您的回答...")} rows={1} className="resize-none text-sm flex-1"
                    onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doAnalyze(customInput);setCustomInput("");}}}/>
                  <Button size="sm" onClick={()=>{doAnalyze(customInput);setCustomInput("");}} disabled={!customInput.trim()}><Send className="w-3.5 h-3.5"/></Button>
                </div>
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
              ) : readyToCraft ? (
                <Button onClick={()=>doCraft()} disabled={loading} className="w-full" size="lg">
                  {loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<Wand2 className="w-4 h-4 mr-2"/>}
                  {t("Craft My Prompt!","✨ 生成我的提示詞！")}
                </Button>
              ) : null}
            </div>
          </div>

          {/* ═══ Right panel ═══ */}
          <div className="space-y-4">
            {understood && !promptResult && (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="p-4">
                  <CardTitle className="text-sm mb-1 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-blue-600"/>{t("I understand:","理解：")}</CardTitle>
                  <p className="text-sm text-blue-800 font-medium">{understood}</p>
                </CardContent>
              </Card>
            )}

            {promptResult && (
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm"><Sparkles className="w-4 h-4 text-blue-600 inline mr-1"/>{t("Your Prompt","您的提示詞")}</CardTitle>
                    <Button variant="ghost" size="sm" onClick={()=>{navigator.clipboard.writeText(promptResult.craftedPrompt);setCopied(true);setTimeout(()=>setCopied(false),2000);}}>
                      {copied?<Check className="w-3.5 h-3.5 text-green-600"/>:<Copy className="w-3.5 h-3.5"/>}
                    </Button>
                  </div>
                  <div className="bg-gray-50 rounded-md p-4 text-sm font-mono whitespace-pre-wrap leading-relaxed border">{promptResult.craftedPrompt}</div>
                  {promptResult.negativePrompt&&<div><span className="text-xs font-medium text-gray-500 uppercase">{t("Negative","負向")}</span><div className="bg-gray-50 rounded-md p-2.5 text-xs font-mono mt-1 text-gray-600">{promptResult.negativePrompt}</div></div>}
                  {promptResult.styleNotes&&<div className="text-xs bg-blue-50 rounded px-3 py-2 text-blue-800">{promptResult.styleNotes}</div>}
                </CardContent>
              </Card>
            )}

            {!understood && (
              <div className="flex flex-col items-center justify-center text-center py-16 text-gray-400">
                <MessageSquare className="w-14 h-14 mb-4 opacity-20"/>
                <p className="text-sm">{t("Describe your idea → click answers → get your prompt!","描述想法→點擊選項→獲得提示詞！")}</p>
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
