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

interface Question { q: string; options: string[] }
type InputMode = "text" | "sketch" | "image" | "model";

const MODES: Array<{key:InputMode;icon:typeof Sparkles;en:string;zh:string}> = [
  {key:"text",icon:Sparkles,en:"Text",zh:"文字"},{key:"sketch",icon:Pencil,en:"Sketch",zh:"畫畫"},
  {key:"image",icon:ImagePlus,en:"Image",zh:"圖片"},{key:"model",icon:Box,en:"3D File",zh:"3D檔案"},
];

function CreatePageInner() {
  const router = useRouter();
  const { lang: toggleLang, setLang, t } = useLang();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<InputMode>("text");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pid, setPid] = useState<string|null>(null);

  // Conversation
  const [msgs, setMsgs] = useState<Array<{role:"user"|"ai";text:string}>>([]);
  const [convLang, setConvLang] = useState<"zh"|"en"|null>(null);

  // Q&A state
  const [round, setRound] = useState(0);
  const [objectName, setObjectName] = useState("");
  const [understood, setUnderstood] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [ready, setReady] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);

  // Result
  const [result, setResult] = useState<{id?:string;content?:string;craftedPrompt:string;negativePrompt:string}|null>(null);
  const [copied, setCopied] = useState(false);
  const [genLoading, setGenLoading] = useState(false);

  // Sketch/Upload
  const [sketchDataUrl, setSketchDataUrl] = useState<string|null>(null);
  const [sketchNotes, setSketchNotes] = useState("");

  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs,questions]);

  // ══════════════ API calls ══════════════

  const callAnalyze = async (text: string) => {
    setLoading(true);
    setMsgs(prev => [...prev, {role:"user",text}]);

    try {
      let id = pid;
      if (!id) { const r = await fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:text.slice(0,80),description:text})}); id=(await r.json()).id; setPid(id); }

      const dLang = detectLang(text);
      if (!convLang) setConvLang(dLang);
      const cl = dLang || convLang || "en";

      const body: Record<string,unknown> = {projectId:id, userMessage:text};
      if (sketchDataUrl&&mode==="sketch") body.sketchDescription = "User drew sketch. "+sketchNotes;

      const res = await fetch("/api/prompt/analyze", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data = await res.json();

      setMsgs(prev => [...prev, {role:"ai",text:data.message}]);
      setUnderstood(data.understood);
      setObjectName(data.object);
      setReady(data.ready);
      setQuestions(data.questions||[]);
      setRound(prev => prev+1);

      // Auto-craft if ready and already answered some questions
      if (data.ready && round >= 1 && id) {
        await callCraft(id, data.object, cl);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const callCraft = async (id: string, objName: string, cl: string) => {
    setLoading(true);
    try {
      const summary = answers.join("; ") || objName;
      const res = await fetch("/api/prompt/craft", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:id,objectName:objName,summary})});
      const data = await res.json();
      setResult(data.promptVersion);
      setMsgs(prev => [...prev, {role:"ai",text:data.assistantMessage}]);
      setQuestions([]); setReady(false);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // ══════════════ Handlers ══════════════

  const handleStart = async () => {
    const text = sketchNotes || input;
    if (!text.trim()) return;
    await callAnalyze(text.trim());
  };

  const handleOption = async (q: Question, opt: string) => {
    setQuestions([]);
    setAnswers(prev => [...prev, `${q.q}: ${opt}`]);
    await callAnalyze(opt);
  };

  const handleCustom = async () => {
    if (!customInput.trim()) return;
    const text = customInput.trim();
    setCustomInput("");
    setAnswers(prev => [...prev, text]);
    await callAnalyze(text);
  };

  const handleIterate = async () => {
    if (!customInput.trim() || !pid) return;
    const text = customInput.trim();
    setCustomInput("");
    setMsgs(prev => [...prev, {role:"user",text}]);
    setLoading(true);
    try {
      const res = await fetch("/api/prompt/craft", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,objectName,summary:answers.join("; ")+`; feedback: ${text}`})});
      const data = await res.json();
      setResult(data.promptVersion);
      setMsgs(prev => [...prev, {role:"ai",text:data.assistantMessage}]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleGenerate = async () => {
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

  // ══════════════ Helpers ══════════════
  const cl = convLang || toggleLang;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={()=>router.push("/")}>← {t("Back","返回")}</Button>
          <h1 className="text-lg font-semibold">{t("Design Consultation","設計諮詢")}</h1>
          <div className="flex-1"/>
          <Button variant="ghost" size="sm" onClick={()=>setLang(toggleLang==="zh"?"en":"zh")}>{toggleLang==="zh"?"EN":"中文"}</Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Progress */}
        {objectName && (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-gray-900">{objectName}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">{t("Round","第")} {round}/2</span>
            {answers.length > 0 && <span className="text-gray-400">·</span>}
            {answers.length > 0 && <span className="text-green-600 text-xs">{answers.length} {t("answered","已答")}</span>}
            {ready && <span className="text-blue-600 text-xs font-medium ml-auto">{t("Ready to craft!","可以生成！")}</span>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ═══ Main ═══ */}
          <div className="lg:col-span-2 space-y-4">
            {/* Mode tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {MODES.map(m=>(<button key={m.key} onClick={()=>setMode(m.key)} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${mode===m.key?"bg-white text-blue-700 shadow-sm":"text-gray-600 hover:text-gray-900"}`}><m.icon className="w-3.5 h-3.5"/><span className="hidden sm:inline">{toggleLang==="zh"?m.zh:m.en}</span></button>))}
            </div>
            {mode==="sketch"&&<><SketchPad onSave={setSketchDataUrl}/><Textarea value={sketchNotes} onChange={e=>setSketchNotes(e.target.value)} placeholder={t("Notes...","備註...")} rows={1} className="resize-none text-sm"/></>}
            {mode==="image"&&<ReferenceImageUploader projectId={pid} onUpload={()=>{}}/>}
            {mode==="model"&&<ReferenceModelUploader projectId={pid} onUpload={()=>{}}/>}

            {/* Chat */}
            <div className="space-y-3 max-h-[350px] overflow-y-auto">
              {msgs.map((m,i)=>(
                <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role==="user"?"bg-blue-600 text-white rounded-br-md":"bg-white border text-gray-800 rounded-bl-md shadow-sm"}`}>{m.text}</div>
                </div>
              ))}

              {/* Questions */}
              {questions.length > 0 && !loading && !result && (
                <div className="ml-1 pl-4 border-l-2 border-blue-300 space-y-3">
                  {questions.map((q,i)=>(
                    <div key={i} className="space-y-1.5">
                      <p className="text-sm font-semibold text-gray-800">{q.q}</p>
                      {q.options.map((opt,j)=>(
                        <button key={j} onClick={()=>handleOption(q,opt)}
                          className="w-full text-left text-sm px-4 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-all shadow-sm">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-2">{j+1}</span>{opt}
                        </button>
                      ))}
                    </div>
                  ))}
                  <button onClick={()=>setCustomInput(cl==="zh"?"自己輸入...":"Type my own...")}
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
              {!objectName ? (
                <>
                  {(mode==="text"||mode==="image"||mode==="model")&&(
                    <Textarea value={input} onChange={e=>setInput(e.target.value)}
                      placeholder={t("Describe what you want to create...","描述您想創建的物品...")} rows={3} className="resize-none text-sm"
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleStart();}}}/>
                  )}
                  <Button onClick={handleStart} disabled={loading||(!input.trim()&&!sketchNotes.trim())} className="w-full" size="lg">
                    {loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<MessageSquare className="w-4 h-4 mr-2"/>}
                    {t("Start Design Consultation","開始設計諮詢")}
                  </Button>
                </>
              ) : customInput ? (
                <div className="flex gap-2">
                  <Textarea autoFocus value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder={t("Your answer...","您的回答...")} rows={1} className="resize-none text-sm flex-1"
                    onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleCustom();}}}/>
                  <Button size="sm" onClick={handleCustom} disabled={!customInput.trim()}><Send className="w-3.5 h-3.5"/></Button>
                </div>
              ) : result ? (
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-1">
                    <Textarea value={customInput} onChange={e=>setCustomInput(e.target.value)} placeholder={t("Want changes?","想修改？")} rows={1} className="resize-none text-sm"
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleIterate();}}}/>
                    <Button size="sm" variant="outline" onClick={handleIterate} disabled={!customInput.trim()||loading}>
                      {loading?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>}
                    </Button>
                  </div>
                  <Button onClick={handleGenerate} disabled={genLoading} className="shrink-0">
                    {genLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<ArrowRight className="w-4 h-4 mr-1"/>}{t("Generate","生成")}
                  </Button>
                </div>
              ) : (
                <Button onClick={()=>pid&&callCraft(pid,objectName,cl)} disabled={loading} className="w-full" size="lg">
                  {loading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<Wand2 className="w-4 h-4 mr-2"/>}
                  {t("Craft My Prompt!","✨ 生成我的提示詞！")}
                </Button>
              )}
            </div>
          </div>

          {/* ═══ Right ═══ */}
          <div className="space-y-4">
            {understood && !result && (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="p-4">
                  <CardTitle className="text-sm mb-1 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-blue-600"/>{t("I understand:","理解：")}</CardTitle>
                  <p className="text-sm text-blue-800 font-medium">{understood}</p>
                </CardContent>
              </Card>
            )}

            {result && (
              <Card>
                <CardContent className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
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
            )}

            {!objectName && (
              <div className="flex flex-col items-center justify-center text-center py-16 text-gray-400">
                <MessageSquare className="w-14 h-14 mb-4 opacity-20"/>
                <p className="text-sm">{t("Describe your idea → AI asks questions → get your prompt!","描述想法→AI提問→獲得提示詞！")}</p>
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
