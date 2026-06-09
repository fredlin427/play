"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LangProvider, useLang } from "@/lib/lang-context";
import { detectLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { SketchPad } from "@/components/create/SketchPad";
import { ImageAnnotator } from "@/components/create/ImageAnnotator";
import { ReferenceImageUploader } from "@/components/create/ReferenceImageUploader";
import { ReferenceModelUploader } from "@/components/create/ReferenceModelUploader";
import { ArrowRight, Sparkles, Pencil, ImagePlus, Box, Loader2, Copy, Check, RefreshCw, Wand2, Lightbulb, ChevronDown, ChevronUp, MessageSquare, AlertCircle, Plus } from "lucide-react";
import type { DesignSpec } from "@/lib/schemas";
import { EMPTY_SPEC } from "@/lib/schemas";
import type { AskContext } from "@/lib/agents/prompt-helper";
import type { CoverageReport } from "@/lib/agents/coverage";
import { getMaxRounds } from "@/lib/agents/question-banks";
import { getSpecPath } from "@/lib/agents/prompt-template";
import { getCoverage } from "@/lib/agents/coverage";
import { applyPromptImprovements } from "@/lib/agents/prompt-craft";
import { readSSEStream } from "@/lib/stream-utils";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { ALL_FIELDS, getField, setField, isRedundantOpt, isFieldFilled } from "@/lib/spec-utils";
import { useSession, clearSession } from "@/hooks/use-session";
import { MATERIAL_GUIDE } from "@/lib/agents/material-guide";

/** Shared helper: triggers AI material recommendation and returns question card data */
async function fetchMaterialRecommendation(spec: DesignSpec, lang: string) {
  const res = await fetch("/api/prompt/recommend-material", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spec, lang }),
  });
  return res.json();
}

function CreatePageInner() {
  const router = useRouter();
  const { lang:toggleLang, setLang, t } = useLang();

  const [hydrated, setHydrated] = useState(false);
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
  const [starred, setStarred] = useState(false);
  const [starLoading, setStarLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<Array<{id:string;imageUrl:string;viewLabel?:string}>>([]);
  const [genProgress, setGenProgress] = useState<{current:number;total:number}|null>(null);
  const [imgWidth, setImgWidth] = useState(512);
  const [imgHeight, setImgHeight] = useState(512);
  const [imgSteps, setImgSteps] = useState(8);
  const [editingField, setEditingField] = useState<string | null>(null);
  // Prompt version history: { id, positive, negative, label, time }
  const [promptVersions, setPromptVersions] = useState<Array<{id:string;positive:string;negative:string;label:string;time:number}>>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [visionFeedback, setVisionFeedback] = useState<any>(null);
  const [annotatorOpen, setAnnotatorOpen] = useState(false);
  const [annotatorImage, setAnnotatorImage] = useState("");
  const [annotatorLoading, setAnnotatorLoading] = useState(false);
  const [sketchContext, setSketchContext] = useState<{description:string;notes:string}|null>(null);

  // Sketch/Upload
  const [mode, setMode] = useState<"text"|"sketch"|"image"|"model">("text");
  const [sketchNotes, setSketchNotes] = useState("");
  const [sketchDataUrl, setSketchDataUrl] = useState<string|null>(null);
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [uploadedModels, setUploadedModels] = useState<any[]>([]);

  const cl = convLang || toggleLang;
  const searchParams = useSearchParams();
  const [_hydrated, sessionData, saveSession] = useSession();

  // Record a prompt version for history
  const recordVersion = (positive: string, negative: string, label: string) => {
    if (!positive) return;
    setPromptVersions(prev => [...prev, { id: Date.now().toString(36), positive, negative, label, time: Date.now() }]);
  };

  const questionRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  // Scroll to question when a new one appears
  useEffect(() => {
    if (questions.length > 0 && questionRef.current) {
      questionRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [questions]);

  // Hydrate from localStorage on mount (client-only — avoids SSR mismatch)
  useEffect(() => {
    if (sessionData) {
      if (sessionData.pid) setPid(sessionData.pid as string);
      if (sessionData.convLang) setConvLang(sessionData.convLang as "zh"|"en");
      if ((sessionData.msgs as unknown[] | undefined)?.length) setMsgs(sessionData.msgs as Array<{role:"user"|"ai";text:string}>);
      if (sessionData.spec) setSpec(sessionData.spec as DesignSpec);
      if (sessionData.specReady) setSpecReady(sessionData.specReady as boolean);
    }
    setHydrated(true);
  }, []); // Only on mount — sessionData is stable after first read

  // Load existing project from URL ?project=id (reopen from dashboard)
  useEffect(() => {
    const projectId = searchParams.get("project");
    if (!projectId || !hydrated) return;
    fetch(`/api/projects/${projectId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) return;
        setPid(data.id);
        if (data.title) setInput(data.title);
        const latestPrompt = data.promptVersions?.[0];
        if (latestPrompt?.craftedPrompt) {
          setResult({ id: latestPrompt.id, craftedPrompt: latestPrompt.craftedPrompt, negativePrompt: latestPrompt.negativePrompt || "" });
          setSpecReady(true);
        }
        if (data.messages?.length) {
          setMsgs(data.messages.map((m: any) => ({ role: m.role, text: m.content })));
        }
      }).catch(() => {});
  }, [hydrated, searchParams]);

  // Auto-save session for recovery on refresh
  useEffect(() => {
    if (!hydrated) return; // Don't save before hydration is complete
    saveSession({ pid, convLang, msgs, spec, specReady, result });
  }, [pid, convLang, msgs, spec, specReady, result, hydrated, saveSession]);

  const updateProgress = (s: DesignSpec) => {
    const cov = getCoverage(s);
    setProgress(Math.round(cov.overall * 100));
  };

  // ══════════════ Reset ══════════════

  const handleReset = () => {
    clearSession();
    setInput(""); setLoading(false); setPid(null);
    // Keep language preference on reset
    setMsgs([]); setSpec(EMPTY_SPEC); setSpecReady(false); setShowSpec(false);
    setProgress(0); setQuestions([]);
    setAskContext({round:0,askedFields:[],answeredFields:[],skippedFields:[],coverage:null});
    setCoverage(null); setQaHistory([]); setCustomAnswer("");
    setError(null); setErrorRetry(null);
    setResult(null); setCopied(false); setGenLoading(false); setGenProgress(null);
    setGeneratedImages([]); setFeedback(""); setAnalyzeLoading(false); setVisionFeedback(null);
  };

  // ══════════════ Extract ══════════════

  const handleExtract = async () => {
    const hasFiles = mode==="sketch" ? true : mode==="image" ? uploadedImages.length > 0 : mode==="model" ? uploadedModels.length > 0 : false;
    const hasContent = mode==="sketch" ? true : (!!input.trim() || hasFiles);
    if (!hasContent) return;
    setLoading(true); setError(null);

    // Auto-export sketch canvas if not already exported
    let sketchUrl = sketchDataUrl;
    if (mode === "sketch" && !sketchUrl) {
      const canvas = document.querySelector("canvas");
      if (canvas) {
        sketchUrl = canvas.toDataURL("image/png");
        setSketchDataUrl(sketchUrl);
      }
    }
    setMsgs(prev=>[...prev,{role:"user",text:input || (cl==="zh"?"開始分析...":"Starting analysis...")}]);

    try {
      let id = pid;
      if (!id) { const r=await fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:input.slice(0,80)||"New Project",description:input})}); id=(await r.json()).id; setPid(id); }

      const dl = detectLang(input);
      if (!convLang) setConvLang(dl);

      // Build context-aware input text
      let text = input;
      if (mode==="sketch") {
        // Step 1: Vision model analyzes the sketch
        let sketchDesc = "";
        let sketchQuestions: Array<{question:string;options:string[]}> = [];
        if (sketchUrl) {
          try {
            const base64 = sketchUrl.split(",")[1];
            const visRes = await fetch("/api/prompt/analyze-sketch", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageBase64: base64, notes: sketchNotes }),
            });
            const visData = await visRes.json();
            sketchDesc = visData.description || "";
            sketchQuestions = visData.questions || [];
          } catch (e) {
            console.warn("[Sketch] Vision analysis failed:", String(e).slice(0, 80));
          }
        }

        if (!sketchDesc) {
          sketchDesc = sketchNotes || "Hand-drawn sketch";
        }

        // User notes always override vision model guesses for object identity
        if (sketchNotes && sketchDesc && sketchDesc !== sketchNotes) {
          sketchDesc = sketchNotes + " (sketch analysis: " + sketchDesc.slice(0, 80) + ")";
        }

        // Step 2: Show analysis result to user
        const zh = (convLang || cl) === "zh";
        setMsgs(prev=>[...prev, {role:"ai",text:zh
          ? `🔍 我分析了你的草圖：${sketchDesc.slice(0,150)}...`
          : `🔍 I analyzed your sketch: ${sketchDesc.slice(0,150)}...`}]);

        // Step 3: If vision model has questions and no notes provided, ask them before extract
        if (sketchQuestions.length > 0 && !sketchNotes) {
          const mappedQs = sketchQuestions.map((q, i) => ({
            field: i === 0 ? "material" : i === 1 ? "dimensions" : i === 2 ? "shape" : "details",
            question: q.question,
            options: [...q.options, zh ? "不確定" : "Unsure"],
            message: zh ? "請確認以下細節：" : "Please confirm these details:",
          }));
          setQuestions(mappedQs);
          setAskContext({round:0, askedFields:[], answeredFields:[], skippedFields:[], coverage:getCoverage(spec)});
          setMsgs(prev=>[...prev, {role:"ai",text:mappedQs[0].message || (zh?"請確認：":"Confirm:")}]);

          // Store sketch context for later extract after user answers questions
          setSketchContext({ description: sketchDesc, notes: sketchNotes });
          setLoading(false);
          return; // Wait for user to answer before extract
        }

        // No questions — proceed directly to extract
        text = `[Sketch analysis: ${sketchDesc}] [User notes: ${sketchNotes || ""}]\n${input || "Generate a 3D-printable object based on this description"}`;

      } else if (mode==="image") {
        // ── Image mode: vision-analyze the first reference image ──
        let imgDesc = "";
        let imgQuestions: Array<{question:string;options:string[]}> = [];
        if (uploadedImages.length > 0 && uploadedImages[0]?.previewUrl) {
          try {
            // Get base64 from the preview URL by fetching the image
            const imgUrl = uploadedImages[0].previewUrl;
            const imgRes = await fetch(imgUrl);
            const blob = await imgRes.blob();
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve((reader.result as string).split(",")[1]);
              reader.readAsDataURL(blob);
            });
            const visRes = await fetch("/api/prompt/analyze-sketch", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageBase64: base64, notes: input }),
            });
            const visData = await visRes.json();
            imgDesc = visData.description || "";
            imgQuestions = visData.questions || [];
          } catch (e) {
            console.warn("[Image] Vision analysis failed:", String(e).slice(0, 80));
          }
        }

        if (imgDesc) {
          const zh = (convLang || cl) === "zh";
          setMsgs(prev=>[...prev, {role:"ai",text:zh
            ? `分析了你的參考圖：${imgDesc.slice(0,150)}...`
            : `Analyzed your reference image: ${imgDesc.slice(0,150)}...`}]);

          if (imgQuestions.length > 0) {
            const mappedQs = imgQuestions.map((q, i) => ({
              field: i === 0 ? "material" : i === 1 ? "dimensions" : i === 2 ? "shape" : "details",
              question: q.question,
              options: [...q.options, zh ? "不確定" : "Unsure"],
              message: zh ? "請確認以下細節：" : "Please confirm:",
            }));
            setQuestions(mappedQs);
            setAskContext({round:0, askedFields:[], answeredFields:[], skippedFields:[], coverage:getCoverage(spec)});
            setMsgs(prev=>[...prev, {role:"ai",text:mappedQs[0].message || (zh?"請確認：":"Confirm:")}]);
            setSketchContext({ description: imgDesc, notes: input }); // reuse sketchContext for the extract-after-confirm flow
            setLoading(false);
            return;
          }
          text = `[Reference image analysis: ${imgDesc}]\n${input || "Generate a 3D-printable object matching this reference"}`;
        } else {
          text = `[Reference Images: ${uploadedImages.length} uploaded]\n${input || "Analyze these reference images and generate a matching 3D-printable prompt"}`;
        }

      } else if (mode==="model") {
        // ── Model mode: use file metadata to generate targeted questions ──
        const modelFiles = uploadedModels.map((m: any) => m.fileName || "").filter(Boolean);
        const modelInfo = modelFiles.length > 0
          ? `Uploaded 3D models: ${modelFiles.join(", ")}. `
          : "";
        const zh = (convLang || cl) === "zh";

        // Generate a few smart questions based on the model files
        setMsgs(prev=>[...prev, {role:"ai",text:zh
          ? `收到 ${uploadedModels.length} 個 3D 模型檔案：${modelFiles.join(", ") || "未知"}。請確認以下細節：`
          : `Received ${uploadedModels.length} 3D model file(s): ${modelFiles.join(", ") || "unknown"}. Please confirm:`}]);

        setQuestions([
          {
            field: "dimensions",
            question: zh ? "這個模型的大約尺寸？(長x寬x高 mm)" : "Approximate dimensions? (LxWxH mm)",
            options: zh ? ["100x100x100mm", "200x150x100mm", "400x300x200mm", "與原檔案相同", "不確定"]
              : ["100x100x100mm", "200x150x100mm", "400x300x200mm", "Same as source file", "Unsure"],
          },
          {
            field: "material",
            question: zh ? "要用什麼材質打印？" : "What material to print with?",
            options: zh ? ["PLA", "PETG", "ABS", "Resin", "與原模型材質無關", "不確定"]
              : ["PLA", "PETG", "ABS", "Resin", "Material doesn't matter", "Unsure"],
          },
        ]);
        setAskContext({round:0, askedFields:[], answeredFields:[], skippedFields:[], coverage:getCoverage(spec)});
        setSketchContext({ description: modelInfo + (input || "3D model reference"), notes: input }); // reuse for extract-after-confirm
        setLoading(false);
        return;
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

    // Map answer to spec fields
    const specPath = getSpecPath(q.field);
    // If field is "components" or "details" and there's already content, append instead of overwrite
    let answerValue = opt;
    if ((q.field === "details" || q.field === "components") && spec.structure.details) {
      answerValue = spec.structure.details + "; " + opt;
    }
    let newSpec = setField(spec, specPath, answerValue);

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
      const maxedOut = newCtx.round >= getMaxRounds(spec.meta?.assetType || "unknown");

      // If we're in the sketch pre-extract phase, trigger extract now
      if (remaining.length === 0 && sketchContext) {
        setQuestions([]);
        setSketchContext(null);

        // Build a pre-filled spec from sketch confirmation answers
        const answerParts: string[] = [];
        let preFilledSpec = { ...spec };
        const fieldMap = ["material", "dimensions", "shape", "details"];
        qaHistory.slice(-4).forEach((h, i) => {
          if (h.a && h.a !== "不確定" && h.a !== "Unsure" && !h.skipped) {
            answerParts.push(h.a);
            const field = fieldMap[i] || "details";
            const specPath = getSpecPath(field);
            preFilledSpec = setField(preFilledSpec, specPath, h.a);
          }
        });
        setSpec(preFilledSpec);
        updateProgress(preFilledSpec);

        // Build enriched text with all context
        const enrichedText = `[Sketch analysis: ${sketchContext.description}] [User confirmed: ${answerParts.join(", ")}] [Notes: ${sketchContext.notes || ""}]\nGenerate a 3D-printable object based on this.`;
        setLoading(true);
        setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"?"正在根據你的確認生成規格...":"Generating spec based on your confirmations..."}]);
        try {
          const res = await fetch("/api/prompt/extract", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,text:enrichedText})});
          const data = await res.json();
          if (data.spec) {
            // Merge extract result with pre-filled answers (pre-filled takes priority)
            const mergedSpec = { ...data.spec };
            if (preFilledSpec.visual?.material) mergedSpec.visual = { ...mergedSpec.visual, material: preFilledSpec.visual.material };
            if (preFilledSpec.dimensions?.approximateSize) mergedSpec.dimensions = { ...mergedSpec.dimensions, approximateSize: preFilledSpec.dimensions.approximateSize };
            if (preFilledSpec.structure?.mainShape) mergedSpec.structure = { ...mergedSpec.structure, mainShape: preFilledSpec.structure.mainShape };
            if (preFilledSpec.structure?.details && preFilledSpec.structure.details !== mergedSpec.structure?.details) {
              mergedSpec.structure = { ...mergedSpec.structure, details: (mergedSpec.structure?.details || "") + "; " + preFilledSpec.structure.details };
            }
            setSpec(mergedSpec); setSpecReady(true);
            setMsgs(prev=>[...prev,{role:"ai",text:data.message}]);
            updateProgress(mergedSpec);
            // Continue with normal Q&A — skip fields already answered
            const answeredFields = fieldMap.filter(f => {
              const p = getSpecPath(f);
              return getField(preFilledSpec, p) && getField(preFilledSpec, p) !== "";
            });
            const askLang = data.lang || convLang || "en";
            const ctx: AskContext = {round:0,askedFields:[...answeredFields],answeredFields:[...answeredFields],skippedFields:[],coverage:null};
            const aRes = await fetch("/api/prompt/ask", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({spec:mergedSpec,lang:askLang,context:ctx})});
            const aData = await aRes.json();
            const qs = aData.questions || [];
            setQuestions(qs);
            setAskContext(aData.context || {...ctx,round:1});
            setCoverage(aData.context?.coverage || null);
            if (qs.length > 0) setMsgs(prev=>[...prev,{role:"ai",text:qs[0].message || (askLang==="zh"?"請選擇：":"Choose:")}]);
          }
        } catch (err: any) { setError(`Extract: ${err.message||String(err)}`); }
        finally { setLoading(false); }
        return;
      }

      // Don't terminate if fewer than 6 questions asked total (hard minimum)
      const hardMinimumMet = (qaHistory.length + 1) >= 6;

      // Terminate when: max rounds OR (all answered + enough questions + coverage done)
      // NOTE: coveredEnough may be false if material is missing (it's in REQUIRED tier).
      // That's OK — material is handled below as the FINAL step.
      if (maxedOut || (remaining.length === 0 && hardMinimumMet)) {
        setQuestions([]);
        setAskContext(newCtx);
        setShowSpec(true);

        // Material ALWAYS last — trigger AI recommendation as final step
        // whenever Q&A ends and material hasn't been picked yet
        const materialMissing = !newSpec.visual.material || newSpec.visual.material === "不確定" || newSpec.visual.material === "Unsure";
        if (materialMissing) {
          setLoading(true);
          try {
            const recData = await fetchMaterialRecommendation(newSpec, cl);
            if (recData.material) {
              setSpec(setField(newSpec, "visual.material", recData.material));
              updateProgress(newSpec);
              setQuestions([{ field:"material",
                question: cl==="zh" ? `最後一步：AI 推薦材質為 ${recData.material} — ${recData.reason}` : `Final step: AI recommends ${recData.material} — ${recData.reason}`,
                options: [recData.material, ...(recData.alternatives||[]), cl==="zh"?"不確定":"Unsure"],
              }]);
              setMsgs(prev=>[...prev, {role:"ai",text:cl==="zh"
                ? `**推薦材質：${recData.material}** — ${recData.reason}\n\n這是最後一步，選擇後即可生成提示詞。`
                : `**Recommended: ${recData.material}** — ${recData.reason}\n\nFinal step — choose to proceed.`}]);
              setLoading(false);
              return;
            }
          } catch { /* continue */ }
          finally { setLoading(false); }
        }

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
        if (qs.length > 0) setMsgs(prev=>[...prev,{role:"ai",text:qs[0].message || (toggleLang==="zh"?"請選擇：":"Choose:")}]);
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

    // Recompute coverage and check if non-material fields are all complete
    const freshCov = getCoverage(spec);
    const nonMatUnfilled = (freshCov?.unfilled || []).filter((f: string) => f !== "visual.material");
    const allDone = freshCov?.shouldTerminate || nonMatUnfilled.length === 0;

    if (remaining.length === 0 && !allDone) {
      setLoading(true);
      fetch("/api/prompt/ask", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({spec,lang:convLang||"en",context:newCtx})})
        .then(r=>r.json()).then(aData=>{
          const qs = aData.questions || [];
          setQuestions(qs);
          setAskContext(aData.context || newCtx);
          setCoverage(aData.context?.coverage || null);
          if (qs.length>0) setMsgs(prev=>[...prev,{role:"ai",text:qs[0].message||(toggleLang==="zh"?"請選擇：":"Choose:")}]);
        }).catch(err=>{setError(`Skip: ${err.message||String(err)}`); setLoading(false);})
        .finally(()=>setLoading(false));
    } else if (remaining.length === 0 && allDone) {
      // All done — trigger material recommendation if needed
      const materialMissing = !spec.visual.material || spec.visual.material === "不確定" || spec.visual.material === "Unsure";
      if (materialMissing) {
        setLoading(true);
        setShowSpec(true);
        fetchMaterialRecommendation(spec, cl).then(recData=>{
          if (recData.material) {
            setSpec(setField(spec, "visual.material", recData.material));
            setQuestions([{ field:"material",
              question: cl==="zh" ? `最後一步：AI 推薦材質為 ${recData.material} — ${recData.reason}` : `Final step: AI recommends ${recData.material} — ${recData.reason}`,
              options: [recData.material, ...(recData.alternatives||[]), cl==="zh"?"不確定":"Unsure"],
            }]);
            setMsgs(prev=>[...prev, {role:"ai",text:cl==="zh"
              ? `**推薦材質：${recData.material}** — ${recData.reason}`
              : `**Recommended: ${recData.material}** — ${recData.reason}`}]);
          }
        }).catch(()=>{}).finally(()=>setLoading(false));
      } else {
        setShowSpec(true);
        setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"?"✅ 請檢查並編輯下方規格後生成。":"✅ Review spec below, then generate."}]);
      }
    }
  };

  // ══════════════ Craft ══════════════

  const handleCraft = async () => {
    if (!pid) { setError("No project ID — try refreshing"); return; }
    setLoading(true); setError(null);
    // Show streaming preview immediately
    setResult({ id: "", craftedPrompt: "", negativePrompt: "" });

    // Debug: verify dimensions are in the spec before sending
    // Include supplementary notes in the spec details
    const craftSpec = feedback.trim()
      ? { ...spec, structure: { ...spec.structure, details: spec.structure.details ? spec.structure.details + "; Supplementary: " + feedback.trim() : "Supplementary: " + feedback.trim() } }
      : spec;

    console.log("[Craft] Sending spec:", JSON.stringify({
      name: craftSpec.subject?.name,
      material: craftSpec.visual?.material,
      color: craftSpec.visual?.color,
      shape: craftSpec.structure?.mainShape,
      dims: craftSpec.dimensions?.approximateSize,
      edge: craftSpec.visual?.edgeTreatment,
      surf: [craftSpec.visual?.texture, craftSpec.visual?.finish].filter(Boolean).join(" "),
      comp: craftSpec.structure?.details,
      style: craftSpec.meta?.style,
    }));

    try {
      const res = await fetch("/api/prompt/craft/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: craftSpec, projectId: pid }) });
      if (!res.ok) throw new Error(`Stream ${res.status}`);

      await readSSEStream(res, (data) => {
        if (data.done) {
          setResult({ id: data.id as string || "", craftedPrompt: data.positive as string, negativePrompt: (data.negative as string) || "" });
          setStarred(false);
          recordVersion(data.positive as string, (data.negative as string) || "", cl==="zh"?"初始版本":"Initial");
        } else if (data.token) {
          setResult(prev => prev ? { ...prev, craftedPrompt: data.full as string } : { id: "", craftedPrompt: data.full as string, negativePrompt: "" });
        }
      });
    } catch (err: any) { setError(`Craft: ${err.message||String(err)}`); setErrorRetry(()=>handleCraft); }
    finally { setLoading(false); }
  };

  const handleIterate = async () => {
    if (!feedback.trim()||!pid||!result?.craftedPrompt) return;
    setLoading(true); setError(null);
    // Send existing prompt + feedback for MODIFICATION (not regeneration from scratch)
    // This preserves all elements from the original prompt
    const iterSpec = { ...spec, structure: { ...spec.structure, details: spec.structure.details ? spec.structure.details + "; User feedback: " + feedback.trim() : "User feedback: " + feedback.trim() } };
    // Use streaming craft for real-time feedback
    setResult({ id: "", craftedPrompt: "", negativePrompt: "" });
    try {
      const res = await fetch("/api/prompt/craft/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: iterSpec, projectId: pid, existingPrompt: result.craftedPrompt, feedback: feedback.trim() }) });
      if (!res.ok) throw new Error(`Stream ${res.status}`);

      await readSSEStream(res, (data) => {
        if (data.done) {
          setResult({ id: (data.id as string) || "", craftedPrompt: data.positive as string, negativePrompt: (data.negative as string) || "" });
          setStarred(false);
          recordVersion(data.positive as string, (data.negative as string) || "", cl==="zh"?"文字修改":"Text edit");
        } else if (data.token) {
          setResult(prev => prev ? { ...prev, craftedPrompt: data.full as string } : { id: "", craftedPrompt: data.full as string, negativePrompt: "" });
        }
      });
      setFeedback("");
      setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"?"✨ 已根據意見更新提示詞":"✨ Prompt updated based on your feedback"}]);
    } catch (err: any) { setError(`Iterate: ${err.message||String(err)}`); setErrorRetry(()=>handleIterate); }
    finally { setLoading(false); }
  };

  // ── Star prompt as quality example ──
  const handleStar = async () => {
    if (!result?.id || starLoading) return;
    setStarLoading(true);
    try {
      const res = await fetch("/api/prompt/star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptVersionId: result.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStarred(data.starred);
    } catch (err: any) {
      console.warn("[Star] Failed:", err.message);
    } finally {
      setStarLoading(false);
    }
  };

  // ── Vision Analysis ──
  const handleAnalyze = async () => {
    if (!result?.craftedPrompt || generatedImages.length === 0) return;
    setAnalyzeLoading(true); setVisionFeedback(null);
    try {
      const res = await fetch("/api/prompt/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePath: generatedImages[0].imageUrl,
          positivePrompt: result.craftedPrompt,
          negativePrompt: result.negativePrompt,
        }),
      });
      const data = await res.json();
      if (data.feedback) {
        setVisionFeedback(data.feedback);
        setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"
          ? `🔍 AI 分析完成：${data.feedback.summary}`
          : `🔍 Analysis complete: ${data.feedback.summary}`}]);
      } else if (!data.available) {
        setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"
          ? `⚠️ Vision 模型未啟用。設定 VISION_ENABLED=true 並安裝 llava`
          : `⚠️ Vision model not available. Set VISION_ENABLED=true and install llava.`}]);
      } else {
        setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"
          ? `⚠️ 無法分析圖片（可能圖片太大或格式不支援），請重新生成後再試`
          : `⚠️ Cannot analyze image (may be too large or unsupported format). Try regenerating.`}]);
      }
    } catch (err: any) { setError(`Analyze: ${err.message||String(err)}`); }
    finally { setAnalyzeLoading(false); }
  };

  // ── Apply vision feedback & regenerate ──
  const handleApplyAndRegen = async () => {
    if (!visionFeedback?.promptImprovements?.length || !result?.craftedPrompt) return;
    const improvedPrompt = applyPromptImprovements(result.craftedPrompt, visionFeedback.promptImprovements);
    if (!improvedPrompt || improvedPrompt === result.craftedPrompt) return;

    // Ensure we have a valid promptVersionId — save to DB if needed
    let versionId = result.id;
    if (!versionId && pid) {
      try {
        const saveRes = await fetch("/api/prompt/craft", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,spec})});
        const saveData = await saveRes.json();
        versionId = saveData.promptVersion?.id || "";
      } catch { /* proceed without id — API will error if required */ }
    }
    if (!versionId) { setError("Cannot regenerate: no saved prompt version. Please generate the prompt again."); return; }

    // Update result with improved prompt
    const newResult = { ...result, craftedPrompt: improvedPrompt, id: versionId };
    setResult(newResult);
    recordVersion(improvedPrompt, result.negativePrompt, cl==="zh"?"AI 分析修正":"AI analysis fix");
    setVisionFeedback(null);
    setFeedback("");

    setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"
      ? `🔧 已套用 ${visionFeedback.promptImprovements.length} 個改進，重新生成中...`
      : `🔧 Applied ${visionFeedback.promptImprovements.length} improvements, regenerating...`}]);

    setGenLoading(true); setError(null); setGeneratedImages([]);
    try {
      const res = await fetch("/api/hunyuan/text-to-image", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,promptVersionId:versionId,prompt:improvedPrompt,negativePrompt:result.negativePrompt,numImages:1,width:imgWidth,height:imgHeight,numInferenceSteps:imgSteps})});
      if (!res.ok) throw new Error(`T2I ${res.status}: ${(await res.json()).error || "Unknown"}`);
      const data = await res.json();
      setGeneratedImages(data.images || []);
      setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"
        ? `✅ 已用改善後的提示詞重新生成！`
        : `✅ Regenerated with improved prompt!`}]);
    } catch (err: any) { setError(`Regen: ${err.message||String(err)}`); }
    finally { setGenLoading(false); }
  };

  // ── Client-side image resize (avoids huge payloads that break fetch) ──
  const resizeImageForUpload = (dataUrl: string, maxPx = 512): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75)); // JPEG for smaller payload
      };
      img.onerror = () => resolve(dataUrl); // fallback to original
      img.src = dataUrl;
    });
  };

  // ── Image Annotation → Analyze → Regenerate ──
  const handleAnnotationAnalyze = async (originalBase64: string, annotatedBase64: string) => {
    if (!result?.craftedPrompt) return;
    setAnnotatorLoading(true); setAnnotatorOpen(false);
    setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"?"🔍 正在分析你畫的標記...":"🔍 Analyzing your drawing..."}]);

    try {
      // Resize images client-side to avoid "Failed to fetch" from oversized payloads
      const [origResized, annResized] = await Promise.all([
        resizeImageForUpload(originalBase64),
        resizeImageForUpload(annotatedBase64),
      ]);
      const annBase64 = annResized.split(",")[1] || annResized;
      const origBase64 = origResized.split(",")[1] || origResized;
      const res = await fetch("/api/prompt/analyze-annotation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalBase64: origBase64, annotatedBase64: annBase64, positivePrompt: result.craftedPrompt, negativePrompt: result.negativePrompt }),
      });
      const data = await res.json();

      if (data.improvedPositive && data.improvedPositive !== result.craftedPrompt) {
        setResult(prev => prev ? { ...prev, craftedPrompt: data.improvedPositive, negativePrompt: data.improvedNegative || prev.negativePrompt } : null);
        recordVersion(data.improvedPositive, data.improvedNegative || result.negativePrompt, cl==="zh"?"畫筆標記":"Drawing edit");
        setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"
          ? `✏️ 已根據你的標記更新提示詞：${(data.changes||[]).join("; ") || "已套用變更"}`
          : `✏️ Updated prompt based on your annotations: ${(data.changes||[]).join("; ") || "changes applied"}`}]);

        // Auto-regenerate if we have a valid id
        if (result.id && pid) {
          setGenLoading(true); setGeneratedImages([]);
          try {
            const genRes = await fetch("/api/hunyuan/text-to-image", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId: pid, promptVersionId: result.id, prompt: data.improvedPositive, negativePrompt: data.improvedNegative || result.negativePrompt, numImages: 1, width: imgWidth, height: imgHeight, numInferenceSteps: imgSteps }),
            });
            if (genRes.ok) {
              const genData = await genRes.json();
              setGeneratedImages(genData.images || []);
              setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"?"✅ 已重新生成！":"✅ Regenerated!"}]);
            }
          } catch { /* generation failed, prompt still updated */ }
          finally { setGenLoading(false); }
        }
      } else {
        setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"?"⚠️ 無法從標記中識別明確的修改":"⚠️ Could not identify clear changes from annotations"}]);
      }
    } catch (err: any) { setError(`Annotation: ${err.message||String(err)}`); }
    finally { setAnnotatorLoading(false); }
  };

  const handleGenImages = async (count = 4) => {
    if (!pid||!result||!result.craftedPrompt) return;
    if (!result.id) { setError("Prompt not saved yet — please regenerate the prompt first"); return; }
    setGenLoading(true); setError(null); setGeneratedImages([]); setVisionFeedback(null);
    setGenProgress({current:0,total:count});
    abortRef.current = false;

    try {
      const allImages: Array<{id:string;imageUrl:string;viewLabel?:string}> = [];
      for (let i = 0; i < count; i++) {
        if (abortRef.current) {
          setGenProgress({current:i, total:count});
          break;
        }
        setGenProgress({current: i, total: count});
        const res = await fetch("/api/hunyuan/text-to-image", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:pid,promptVersionId:result.id,prompt:result.craftedPrompt,negativePrompt:result.negativePrompt,numImages:1,width:imgWidth,height:imgHeight,numInferenceSteps:imgSteps})});
        if (!res.ok) throw new Error(`T2I ${res.status}: ${(await res.json()).error || "Unknown"}`);
        const data = await res.json();
        if (data.images?.length) {
          allImages.push(...data.images);
          setGeneratedImages([...allImages]);
        }
      }
      if (abortRef.current) {
        setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"
          ? `⏹️ 已終止生成。${allImages.length} 張圖片已保存。`
          : `⏹️ Generation stopped. ${allImages.length} image(s) saved.`}]);
      } else {
        setGenProgress({current:count,total:count});
        setMsgs(prev=>[...prev,{role:"ai",text:cl==="zh"
          ? `✅ ${allImages.length} 張圖片已生成！選一張最喜歡的，或用畫筆標記修改。`
          : `✅ ${allImages.length} images generated! Pick your favorite, or draw to edit.`}]);
      }
    } catch (err: any) { setError(`Gen Images: ${err.message||String(err)}`); setErrorRetry(()=>handleGenImages); }
    finally { setGenLoading(false); setTimeout(()=>setGenProgress(null),1000); }
  };

  const MODES = [
    {key:"text" as const,icon:Sparkles,zh:"文字",en:"Text"},
    {key:"sketch" as const,icon:Pencil,zh:"畫畫",en:"Sketch"},
    {key:"image" as const,icon:ImagePlus,zh:"圖片",en:"Image"},
    {key:"model" as const,icon:Box,zh:"3D檔案",en:"3D File"},
  ];

  if (!hydrated) return <div className="min-h-screen" style={{ background: '#FDF8F3' }} />;

  return (
    <div className="min-h-screen" style={{ background: '#FDF8F3' }}>
      {/* Header — refined with subtle shadow */}
      <header className="bg-[#FDF8F3]/80 backdrop-blur-sm border-b border-[#E8D5C4] sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={()=>router.push("/")} className="text-[#8B7355] hover:text-[#8B5E3C]">← {t("Back","返回")}</Button>
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-[#B8A898] hover:text-[#C4823B]">
            <Plus className="w-4 h-4 mr-1"/>{t("New","新專案")}
          </Button>
          <h1 className="text-lg font-semibold bg-gradient-to-r from-[#A0522D] to-[#B86945] bg-clip-text text-transparent">
            {t("AI Design Platform","AI 設計平台")}
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{color:'#B8A898',background:'rgba(196,130,59,0.06)'}}>MDSSC</span>
          </h1>
          <div className="flex-1"/>
          <div className="flex items-center gap-2 text-xs text-[#B8A898]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
            {t("AI Ready","AI 就緒")}
          </div>
          <Button variant="ghost" size="sm" onClick={()=>setLang(toggleLang==="zh"?"en":"zh")} className="text-xs text-[#B8A898] hover:text-[#5C4A3A]">
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
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-[#E8D5C4] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#2C2416] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#C4823B]"/>
                {spec.subject.name||"..."}
              </span>
              <span className="text-xs text-[#B8A898] bg-[#EDE4D5] rounded-full px-3 py-1">
                {t("Round","輪")} {askContext.round}/{getMaxRounds(spec.meta?.assetType||"unknown")} · {Math.round(coverage.overall*100)}%
              </span>
            </div>
            {Object.entries(coverage.byCategory).map(([cat, data]) => (
              <div key={cat} className="flex items-center gap-3 text-xs">
                <span className="w-16 text-right text-[#8B7355]">{cl==="zh"?data.label.zh:data.label.en}</span>
                <div className="flex-1 bg-[#EDE4D5] rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      data.ratio>=1 ? "bg-gradient-to-r from-green-400 to-emerald-500" :
                      data.ratio>=0.5 ? "bg-gradient-to-r from-amber-400 to-orange-500" :
                      "bg-gradient-to-r from-red-300 to-rose-400"
                    }`}
                    style={{width:`${data.ratio*100}%`}}
                  />
                </div>
                <span className="w-8 text-[#B8A898] tabular-nums">{data.filled}/{data.total}</span>
              </div>
            ))}
          </div>
        )}

        {/* Legacy progress bar */}
        {specReady && !coverage && !result && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-[#E8D5C4] space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-[#2C2416]">{spec.subject.name||"..."}</span>
              <span className="text-xs text-[#B8A898]">{progress}% · {t("Round","輪")} {askContext.round}/{getMaxRounds(spec.meta?.assetType||"unknown")}</span>
            </div>
            <div className="w-full bg-[#EDE4D5] rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-[#C4823B] to-[#B86945] h-2 rounded-full transition-all duration-700" style={{width:`${progress}%`}}/>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ═══ LEFT: Chat + Q&A ═══ */}
          <div className="lg:col-span-3 space-y-4">
            {/* Mode tabs — pill style */}
            <div className="flex gap-1 bg-white/80 backdrop-blur-sm rounded-2xl p-1.5 shadow-sm border border-[#E8D5C4]">
              {MODES.map(m=>(
                <button key={m.key} onClick={()=>setMode(m.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                    mode===m.key
                      ? "bg-gradient-to-r from-[#C4823B] to-[#A0522D] text-white shadow-md"
                      : "text-[#8B7355] hover:text-[#5C4A3A] hover:bg-[#FBF4EC]"
                  }`}
                >
                  <m.icon className="w-3.5 h-3.5"/>
                  <span>{toggleLang==="zh"?m.zh:m.en}</span>
                </button>
              ))}
            </div>

            {mode==="sketch"&&<><SketchPad onSave={(dataUrl)=>{setSketchDataUrl(dataUrl);setUploadedImages([{id:"sketch",fileName:"sketch.png",previewUrl:dataUrl}]);}}/><Textarea value={sketchNotes} onChange={e=>setSketchNotes(e.target.value)} placeholder={toggleLang==="zh"?"備註（形狀、尺寸、材質...）":"Notes (shape, size, material...)"} rows={2} className="resize-none text-sm rounded-xl"/></>}
            {mode==="image"&&<ReferenceImageUploader projectId={pid} onUpload={(imgs)=>{setUploadedImages(imgs);if(imgs.length>0 && !input.trim()) setInput(cl==="zh"?"請根據這些參考圖生成一個...":"Generate a 3D-printable object based on these reference images...");}} onProjectCreated={(newPid)=>{if(!pid) setPid(newPid);}}/>}
            {mode==="model"&&<ReferenceModelUploader projectId={pid} onUpload={(models)=>{setUploadedModels(models);if(models.length>0 && !input.trim()) setInput(cl==="zh"?"請根據這個3D模型生成...":"Generate a matching object based on this 3D model reference...");}} onProjectCreated={(newPid)=>{if(!pid) setPid(newPid);}}/>}

            {/* File status badge */}
            {mode!=="text" && (sketchDataUrl||uploadedImages.length>0||uploadedModels.length>0) && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50/80 backdrop-blur-sm rounded-xl px-3 py-2 border border-emerald-100">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
                {mode==="sketch" && <span>{toggleLang==="zh"?"✓ 草圖已匯出":"✓ Sketch exported"}{sketchNotes?` · ${sketchNotes.slice(0,40)}`  :""}</span>}
                {mode==="image" && <span>{uploadedImages.length} {toggleLang==="zh"?"張參考圖":"reference image(s)"}</span>}
                {mode==="model" && <span>{uploadedModels.length} {toggleLang==="zh"?"個模型":"model(s)"}: {uploadedModels.map((m:any)=>m.fileName).join(", ")}</span>}
              </div>
            )}

            {/* Chat messages */}
            <div className="space-y-3">
              {msgs.map((m,i)=>(
                <div key={`${m.role}-${i}-${m.text.slice(0,10)}`} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role==="user"
                      ? "bg-gradient-to-br from-[#C4823B] to-[#A0522D] text-white rounded-br-md shadow-md"
                      : "bg-white/90 backdrop-blur-sm border border-[#E8D5C4] text-[#5C4A3A] rounded-bl-md shadow-sm"
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}

              {/* Field checklist — shows all fields to fill */}
              {specReady && !result && questions.length > 0 && (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-3 border border-[#E8D5C4] space-y-1.5">
                  <p className="text-[10px] font-semibold text-[#8B7355] uppercase tracking-wide">
                    {toggleLang==="zh" ? "需填寫欄位" : "Fields to complete"} ({ALL_FIELDS.filter(f => {
                      const v = getField(spec, f.path);
                      return v && v !== "" && v !== "false" && v !== "0" && v !== "indoor" && v !== "front or 3/4";
                    }).length}/{ALL_FIELDS.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {ALL_FIELDS.map(f => {
                      const v = getField(spec, f.path);
                      const filled = v && v !== "" && v !== "false" && v !== "0" && v !== "indoor" && v !== "front or 3/4";
                      const isEditing = editingField === f.path;
                      return isEditing ? (
                        <input key={f.path} autoFocus
                          defaultValue={v}
                          className="text-[10px] px-2 py-0.5 rounded-full border border-[#C4823B] bg-[#FBF4EC] text-[#8B5E3C] w-24 outline-none"
                          onBlur={() => setEditingField(null)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const ns = setField(spec, f.path, (e.target as HTMLInputElement).value);
                              setSpec(ns); updateProgress(ns); setEditingField(null);
                            }
                            if (e.key === "Escape") setEditingField(null);
                          }}
                        />
                      ) : (
                        <button key={f.path} onClick={() => { if (filled) setEditingField(f.path); }}
                          title={filled ? `${cl==="zh"?f.zh:f.en}: ${v}` : (cl==="zh"?f.zh:f.en)}
                          className={`text-[10px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
                            filled
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-400"
                              : "bg-[#F5F0E8] text-[#B8A898] border-gray-200"
                          }`}>
                          {filled ? "✓" : "○"} {toggleLang==="zh" ? f.zh : f.en}{filled ? ` ${v.slice(0,8)}${v.length>8?"…":""}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Accumulated spec summary — warm tags */}
              {specReady && !result && questions.length === 0 && (
                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-3 border border-[#E8D5C4] space-y-1.5">
                  <span className="text-xs font-semibold text-[#8B5E3C]">{toggleLang==="zh"?"📋 已收集：":"📋 Collected: "}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      spec.visual.material && {label:cl==="zh"?"材質":"material",val:spec.visual.material,color:"bg-[#FBF4EC] text-[#8B5E3C] border-[#E8D5C4]"},
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
                      <span className="text-xs text-[#B8A898]">{toggleLang==="zh"?"尚未收集任何資訊":"No info collected yet"}</span>
                    }
                  </div>
                </div>
              )}

              {/* Question cards — batch mode (multiple questions per round) */}
              {questions.length > 0 && !loading && !result && (
                <div ref={questionRef} className="space-y-4">
                  {questions.map((q, qi) => (
                    <div key={`${q.field}-${qi}`} className="bg-gradient-to-br bg-[#FDF8F3]/90 backdrop-blur-sm rounded-2xl p-5 border border-[#E8D5C4] shadow-lg shadow-[#C4823B]/10 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#C4823B] to-[#B86945] flex items-center justify-center shadow-sm">
                          <span className="text-white text-xs font-bold">{qi+1}</span>
                        </div>
                        <p className="text-base font-semibold text-[#2C2416] pt-1">{q.question}</p>
                      </div>

                      {/* Text input */}
                      <div className="flex gap-2">
                        <Input value={customAnswer} onChange={e=>setCustomAnswer(e.target.value)}
                          placeholder={q.options.filter(o=>!isRedundantOpt(o)).length===0
                            ? (toggleLang==="zh"?"請直接輸入...":"Type your answer...")
                            : (toggleLang==="zh"?"或自行輸入...":"Or type your own...")}
                          className="h-10 text-sm flex-1 rounded-xl border-[#E8D5C4] focus:border-[#C4823B] focus:ring-[#C4823B]"
                          autoFocus={qi===0 && q.options.filter(o=>!isRedundantOpt(o)).length===0}
                          onKeyDown={e=>{if(e.key==="Enter"&&customAnswer.trim()){e.preventDefault();handleAnswer(q,customAnswer.trim());}}}/>
                        {customAnswer.trim() && (
                          <Button size="sm" onClick={()=>handleAnswer(q,customAnswer.trim())} className="rounded-xl bg-gradient-to-r from-[#C4823B] to-[#A0522D] hover:from-[#A0522D] hover:to-[#8B4513] shadow-sm">
                            <ArrowRight className="w-4 h-4"/>
                          </Button>
                        )}
                      </div>

                      {/* Option buttons */}
                      {q.options.filter(o=>!isRedundantOpt(o)).length>0 && (
                        <div className="grid grid-cols-1 gap-1.5">
                          {q.options.filter(o=>!isRedundantOpt(o)).map((opt,idx)=>(
                            <button key={idx} onClick={()=>handleAnswer(q,opt)}
                              className="group w-full text-left px-3 py-2.5 rounded-xl border-2 border-[#E8D5C4] bg-white hover:border-[#C4823B] hover:bg-gradient-to-r hover:from-amber-50 hover:to-rose-50 hover:shadow-md transition-all duration-200 flex items-center gap-2">
                              <span className="shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br from-[#C4823B] to-[#A0522D] text-white text-[10px] font-bold flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                                {idx+1}
                              </span>
                              <span className="text-sm font-medium text-[#5C4A3A] group-hover:text-[#2C2416] flex-1">{opt}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity"/>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Skip */}
                      <button onClick={()=>handleSkip(q)}
                        className="w-full text-center text-xs py-2 rounded-xl border border-dashed border-[#E8D5C4] text-[#B8956A] hover:border-[#C4823B] hover:text-[#C4823B] hover:bg-[#FBF4EC]/50 transition-colors">
                        {toggleLang==="zh"?"⏭️ 不確定，跳過":"⏭️ Unsure, skip"}
                      </button>

                      {/* Material guide */}
                      {q.field === "material" && (
                        <div className="space-y-2 pt-2 border-t border-[#E8D5C4]">
                          <p className="text-[10px] font-medium text-[#B8A898] uppercase tracking-wide">{t("Material Guide","材質指南")}</p>
                          {MATERIAL_GUIDE.slice(0, 6).map(m => {
                            const isZh = cl === "zh";
                            const heatLabels = ["<60C", "~80C", "~100C", "~120C", ">150C"];
                            const strengthLabels = [t("Very Low","極低"), t("Low","低"), t("Medium","中"), t("High","高"), t("Very High","極高")];
                            const diffLabels = [t("Easiest","最易"), t("Easy","易"), t("Moderate","中等"), t("Hard","難"), t("Expert","專家")];
                            const safetyLabels: Record<string, string> = {
                              "food-safe": t("Food-safe","食品級"),
                              "low-odor": t("Low odor","低氣味"),
                              "ventilation": t("Needs ventilation","需通風"),
                              "toxic-resin": t("Toxic - wear PPE","有毒 - 需防護"),
                              "abrasive": t("Wears nozzle","磨損噴嘴"),
                            };
                            return (
                              <button key={m.name}
                                onClick={() => handleAnswer(q, m.name)}
                                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#FBF4EC] transition-colors border border-[#E8D5C4] hover:border-[#D4B896] bg-white group">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-semibold text-[#2C2416] group-hover:text-[#8B5E3C]">
                                    {isZh ? m.label.zh : m.label.en}
                                  </span>
                                </div>
                                <p className="text-[10px] text-[#8B7355] leading-relaxed line-clamp-2">
                                  {isZh ? m.bestFor.zh : m.bestFor.en}
                                </p>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[9px] text-[#B8A898]">
                                  <span>{t("Strength","強度")}: {strengthLabels[m.strength-1]}</span>
                                  <span>{t("Flex","彈性")}: {m.flexibility >= 4 ? t("Flexible","彈性") : m.flexibility >= 3 ? t("Slight Flex","微彈") : t("Rigid","剛性")}</span>
                                  <span>{t("Heat","耐熱")}: {heatLabels[m.heatResistance-1]}</span>
                                  <span>{t("Difficulty","難度")}: {diffLabels[m.printDifficulty-1]}</span>
                                  <span>{safetyLabels[m.safety] || m.safety}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Generation progress */}
              {genProgress && (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-[#E8D5C4] shadow-lg shadow-[#C4823B]/10 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#C4823B] to-[#B86945] flex items-center justify-center shadow-sm">
                      <Loader2 className="w-4 h-4 text-white animate-spin"/>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[#2C2416]">
                        {t("Generating Images","正在生成圖片")}
                      </p>
                      <p className="text-xs text-[#B8A898]">
                        {genProgress.current}/{genProgress.total}{genProgress.current > 0 ? ` · ${t("keep waiting","持續等待中")}` : ""}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { abortRef.current = true; }}
                      className="rounded-xl border-red-300 text-red-500 hover:bg-red-50 text-xs shrink-0">
                      ⏹ {t("Stop","終止")}
                    </Button>
                  </div>
                  <div className="w-full bg-[#F5E6D3] rounded-full h-2.5 overflow-hidden">
                    <div className="bg-gradient-to-r from-[#C4823B] to-[#B86945] h-2.5 rounded-full transition-all duration-1000 ease-out"
                      style={{width:`${Math.max(5,(genProgress.current/genProgress.total)*100)}%`}}/>
                  </div>
                </div>
              )}

              {loading && !genProgress && (
                <div className="flex items-center gap-3 text-sm text-[#C4823B] bg-white/80 backdrop-blur-sm rounded-2xl px-4 py-3 border border-[#E8D5C4]">
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
                        ? (toggleLang==="zh" ? "描述參考圖中的物品，或直接描述想要生成的..." : "Describe the object in the reference, or what to generate...")
                        : mode==="model"
                        ? (toggleLang==="zh" ? "描述3D模型，或想要生成的變體..." : "Describe the 3D model, or desired variant...")
                        : (toggleLang==="zh" ? "描述您想創建的物品，例如：白色醫療櫃，木材，直立矩形盒狀，200mm..." : "Describe what you want to create, e.g. a white medical cabinet, wood, vertical box shape...")}
                      rows={3} className="resize-none text-sm rounded-2xl border-[#E8D5C4] focus:border-[#C4823B]"/>
                  )}
                  <Button onClick={handleExtract} disabled={loading||(mode==="text"&&!input.trim()&&!(uploadedImages.length>0||uploadedModels.length>0))||(mode==="image"&&uploadedImages.length===0&&!input.trim())||(mode==="model"&&uploadedModels.length===0&&!input.trim())}
                    className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#C4823B] to-[#B86945] hover:from-[#A0522D] hover:to-[#A04A30] shadow-lg shadow-[#C4823B]/20 text-white font-semibold text-base transition-all duration-300 hover:shadow-xl hover:shadow-[#C4823B]/30 hover:-translate-y-0.5">
                    {loading
                      ? <><Loader2 className="w-5 h-5 animate-spin mr-2"/> {t("Analyzing...","分析中...")}</>
                      : <><MessageSquare className="w-5 h-5 mr-2"/> {t("Start Creating","✨ 開始創作")}</>
                    }
                  </Button>
                </>
              ) : result ? (
                <div className="space-y-2">
                  {/* Quality sliders */}
                  <div className="flex gap-2 text-[10px] text-[#8B7355]">
                    <div className="flex-1 space-y-0.5">
                      <div className="flex justify-between"><span>{t("Resolution","解析度")}</span><span>{imgWidth}px</span></div>
                      <input type="range" min={512} max={1024} step={256} value={imgWidth} onChange={e=>{const v=parseInt(e.target.value);setImgWidth(v);setImgHeight(v);}}
                        className="w-full h-1 accent-[#C4823B]"/>
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex justify-between"><span>{t("Steps","步數")}</span><span>{imgSteps}</span></div>
                      <input type="range" min={8} max={30} step={1} value={imgSteps} onChange={e=>setImgSteps(parseInt(e.target.value))}
                        className="w-full h-1 accent-[#C4823B]"/>
                    </div>
                  </div>
                  <div className="flex gap-2">
                  <div className="flex-1 flex gap-1">
                    <Textarea value={feedback} onChange={e=>setFeedback(e.target.value)}
                      placeholder={toggleLang==="zh"?"修改意見...":"Feedback..."} rows={1}
                      className="resize-none text-sm rounded-xl border-[#E8D5C4]"
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleIterate();}}}/>
                    <Button size="sm" variant="outline" onClick={handleIterate} disabled={!feedback.trim()||loading}
                      className="rounded-xl border-[#D4B896] text-[#8B5E3C] hover:bg-[#FBF4EC]">
                      {loading?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>}
                    </Button>
                  </div>
                  <Button onClick={()=>handleGenImages(1)} disabled={genLoading||!result.craftedPrompt||!result.id} variant="outline"
                    className="rounded-xl border-gray-200 text-[#6B5D4F] hover:border-[#D4B896] hover:text-[#8B5E3C] shrink-0">
                    {genLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<ArrowRight className="w-4 h-4 mr-1"/>}1 Pic
                  </Button>
                  <Button onClick={()=>handleGenImages(4)} disabled={genLoading||!result.craftedPrompt||!result.id}
                    className="rounded-xl bg-gradient-to-r from-[#C4823B] to-[#B86945] hover:from-[#A0522D] hover:to-[#A04A30] text-white shadow-md shrink-0">
                    {genLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<Box className="w-4 h-4 mr-1"/>}4 Pics
                  </Button>
                </div></div>
              ) : (
                // Show supplementary notes + generate when Q&A is done
                // (no questions left, OR only the final material recommendation question)
                (questions.length === 0 || (questions.length === 1 && questions[0]?.field === "material")) && (
                  <div className="space-y-2">
                    <Textarea
                      value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      placeholder={cl === "zh"
                        ? "補充說明（選填）：任何想補充的細節、特殊要求、靈感參考..."
                        : "Supplementary notes (optional): any extra details, special requirements, inspiration..."}
                      rows={2}
                      className="resize-none text-sm rounded-xl border-[#E8D5C4] focus:border-[#C4823B]"
                    />
                    <Button onClick={handleCraft} disabled={loading}
                      className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#C4823B] to-[#A0522D] hover:from-[#A0522D] hover:to-[#8B4513] shadow-lg shadow-[#C4823B]/20 text-white font-semibold text-base transition-all duration-300 hover:shadow-xl hover:shadow-[#C4823B]/30 hover:-translate-y-0.5">
                      {loading
                        ? <><Loader2 className="w-5 h-5 animate-spin mr-2"/> {t("Generating...","生成中...")}</>
                        : <><Wand2 className="w-5 h-5 mr-2"/> {t("Generate Prompt","✨ 生成提示詞")}</>
                      }
                    </Button>
                  </div>
                )
              )}
            </div>
          </div>

          {/* ═══ RIGHT: Spec + Result ═══ */}
          <div className="lg:col-span-2 space-y-4">
            {/* Spec panel */}
            {specReady && !result && (
              <Card className={`bg-white/80 backdrop-blur-sm border-[#E8D5C4] transition-all duration-500 ${questions.length===0 && spec.subject.name ? "ring-2 ring-amber-400 shadow-xl shadow-[#C4823B]/20/50" : "shadow-sm"}`}>
                <CardContent className="p-4 space-y-3">
                <button onClick={()=>setShowSpec(!showSpec)} className="w-full flex items-center justify-between text-sm font-medium text-[#5C4A3A] hover:text-[#8B5E3C] transition-colors">
                  <span className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-[#C4823B]"/>
                    {questions.length===0 && spec.subject.name
                      ? (toggleLang==="zh"?"✏️ 請檢查並編輯規格":"✏️ Review & edit spec")
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
                          <label className={`text-[10px] font-medium ${filled?"text-emerald-600":"text-[#C4823B]"}`}>
                            {cl==="zh"?f.zh:f.en}{filled?" ✓":""}
                          </label>
                          <Input value={val} onChange={e=>{const ns=setField(spec,f.path,e.target.value);setSpec(ns);updateProgress(ns);}}
                            placeholder="..."
                            className={`h-8 text-xs rounded-xl transition-colors ${filled
                              ? "border-emerald-200 bg-emerald-50/50 focus:border-emerald-400"
                              : "border-[#E8D5C4] bg-[#FBF4EC]/50 focus:border-[#C4823B]"}`}
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
              <Card className="bg-white/80 backdrop-blur-sm border-[#E8D5C4] shadow-lg overflow-hidden">
                <CardContent className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-sm pb-3 border-b border-[#E8D5C4]">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#C4823B]"/>
                      <span className="bg-gradient-to-r from-[#A0522D] to-[#B86945] bg-clip-text text-transparent font-bold">SD Prompt</span>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {promptVersions.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => setShowVersions(!showVersions)}
                          className="rounded-xl text-xs text-[#B8A898] hover:text-[#C4823B]">
                          {t(`Versions (${promptVersions.length})`,`版本 (${promptVersions.length})`)}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={handleStar} disabled={starLoading}
                        className={`rounded-xl text-xs ${starred ? "text-[#F59E0B] hover:text-[#D97706]" : "text-[#B8A898] hover:text-[#F59E0B]"}`}
                        title={starred ? (cl==="zh"?"已標記為精選":"Starred as example") : (cl==="zh"?"標記為精選，供下次生成參考":"Star as quality example for future generations")}>
                        {starred ? <><Sparkles className="w-3.5 h-3.5 fill-[#F59E0B]"/> {t("Starred","已標記")}</> : <><Sparkles className="w-3.5 h-3.5"/> {t("Star","標記")}</>}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={()=>{navigator.clipboard.writeText(result.craftedPrompt);setCopied(true);setTimeout(()=>setCopied(false),2000);}}
                        className="rounded-xl text-xs text-[#B8A898] hover:text-[#C4823B]">
                        {copied?<><Check className="w-3.5 h-3.5 text-emerald-500"/> {t("Copied","已複製")}</>:<><Copy className="w-3.5 h-3.5"/> {t("Copy","複製")}</>}
                      </Button>
                    </div>
                  </div>

                  {/* Version history panel */}
                  {showVersions && promptVersions.length > 1 && (
                    <div className="space-y-2 pb-3 border-b border-[#E8D5C4]">
                      <p className="text-[10px] font-medium" style={{color:'#8B7355'}}>{t("Version History","版本歷史")}</p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {[...promptVersions].reverse().map((v, i) => {
                          const isCurrent = v.positive === result.craftedPrompt;
                          const prev = [...promptVersions].reverse()[i + 1];
                          // Simple diff: compare lengths and first difference
                          let diff = "";
                          if (prev && prev.positive !== v.positive) {
                            const added = v.positive.length - prev.positive.length;
                            diff = added > 0 ? `+${Math.abs(added)} chars` : added < 0 ? `${added} chars` : "modified";
                          }
                          return (
                            <div key={v.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-all ${
                              isCurrent ? "bg-[#FBF4EC] border border-[#E8D5C4]" : "hover:bg-[#FBF4EC] cursor-pointer"
                            }`}
                              style={{ color: isCurrent ? '#C4823B' : '#8B7355' }}
                              onClick={() => {
                                if (!isCurrent) {
                                  setResult(prev => prev ? { ...prev, craftedPrompt: v.positive, negativePrompt: v.negative } : null);
                                }
                              }}>
                              <span className="w-2 h-2 rounded-full shrink-0" style={{background: isCurrent ? '#C4823B' : '#D4B896'}} />
                              <span className="flex-1 font-medium truncate">{v.label}</span>
                              <span className="text-[10px]" style={{color:'#B8A898'}}>{new Date(v.time).toLocaleTimeString()}</span>
                              {diff && <span className="text-[10px] shrink-0" style={{color: diff.startsWith('+') ? '#7B9E6D' : '#c86450'}}>{diff}</span>}
                              {!isCurrent && (
                                <button className="text-[10px] px-2 py-0.5 rounded-lg shrink-0 transition-colors"
                                  style={{background:'rgba(196,130,59,0.1)', color:'#C4823B'}}
                                  onClick={(e) => { e.stopPropagation();
                                    setResult(prev => prev ? { ...prev, craftedPrompt: v.positive, negativePrompt: v.negative } : null);
                                  }}>
                                  {t("Restore","還原")}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Generated image previews */}
                  {generatedImages.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-[#8B7355] flex items-center gap-1.5">
                        <ImagePlus className="w-3.5 h-3.5"/>
                        {t("Generated Images","生成圖片")} ({generatedImages.length})
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {generatedImages.map((img, i) => (
                          <div key={img.id} className="relative group rounded-xl overflow-hidden border border-[#E8D5C4] bg-[#FBF4EC] aspect-square">
                            <img src={img.imageUrl} alt={img.viewLabel || `Image ${i+1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}/>
                            <button
                              onClick={() => { setAnnotatorImage(img.imageUrl); setAnnotatorOpen(true); }}
                              className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <span className="bg-white/90 text-[#5C4A3A] text-[10px] px-2 py-1 rounded-full font-medium">
                                <Pencil className="w-3 h-3 inline mr-1"/>{t("Draw to edit","畫畫修改")}
                              </span>
                            </button>
                            {img.viewLabel && (
                              <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-black/50 text-white py-0.5">
                                {img.viewLabel}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vision analysis button + results */}
                  {generatedImages.length > 0 && (
                    <div className="space-y-2">
                      <Button variant="outline" size="sm" onClick={handleAnalyze} disabled={analyzeLoading}
                        className="w-full rounded-xl border-[#D4B896] text-[#8B5E3C] hover:bg-[#FBF4EC] text-xs">
                        {analyzeLoading
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1"/> {t("Analyzing...","分析中...")}</>
                          : <><Lightbulb className="w-3.5 h-3.5 mr-1"/> {t("AI Analyze Image","🔍 AI 分析圖片")}</>
                        }
                      </Button>
                      {visionFeedback && (
                        <div className="bg-[#FBF4EC]/80 rounded-2xl p-3 border border-[#E8D5C4] space-y-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              visionFeedback.quality==="good" ? "bg-emerald-100 text-emerald-700" :
                              visionFeedback.quality==="acceptable" ? "bg-[#F5E6D3] text-[#8B5E3C]" :
                              "bg-red-100 text-red-700"
                            }`}>
                              {visionFeedback.quality?.toUpperCase()}
                            </span>
                            <span className="text-[#8B7355]">{visionFeedback.summary}</span>
                          </div>
                          {visionFeedback.issues?.length > 0 && (
                            <div className="space-y-1">
                              {visionFeedback.issues.map((iss:any,i:number)=>(
                                <div key={i} className="flex items-start gap-1.5">
                                  <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${
                                    iss.severity==="critical"?"bg-red-500":iss.severity==="major"?"bg-[#FBF4EC]0":"bg-gray-400"
                                  }`}/>
                                  <span className="text-[#6B5D4F]">{iss.description}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {visionFeedback.promptImprovements?.length > 0 && (
                            <div className="space-y-2">
                              <span className="font-medium text-emerald-700">{t("Suggested Fixes","建議修正")}:</span>
                              {visionFeedback.promptImprovements.map((imp:string,i:number)=>(
                                <button key={i} onClick={()=>setFeedback(prev=>prev?prev+"; "+imp:imp)}
                                  className="block w-full text-left text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg px-2 py-1 transition-colors">
                                  + {imp}
                                </button>
                              ))}
                              <Button size="sm" onClick={handleApplyAndRegen} disabled={genLoading}
                                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-xs shadow-sm">
                                {genLoading
                                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1"/> {t("Regenerating...","重新生成中...")}</>
                                  : <><Wand2 className="w-3.5 h-3.5 mr-1"/> {t("Apply All & Regenerate","✨ 一鍵套用並重新生成")}</>
                                }
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xs font-semibold text-emerald-600 mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
                        Positive Prompt
                        {loading && <Loader2 className="w-3 h-3 animate-spin ml-1"/>}
                      </h4>
                      <p className="text-sm bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl p-4 leading-relaxed text-[#5C4A3A] border border-emerald-100 shadow-inner">
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
                      <p className="text-sm bg-gradient-to-br from-rose-50 to-red-50 rounded-2xl p-4 leading-relaxed text-[#6B5D4F] border border-rose-100 shadow-inner">
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

      {/* Image Annotator Modal */}
      {annotatorOpen && annotatorImage && (
        <ImageAnnotator
          imageUrl={annotatorImage}
          onAnalyze={handleAnnotationAnalyze}
          onClose={() => setAnnotatorOpen(false)}
          loading={annotatorLoading}
        />
      )}
    </div>
  );
}

export default function CreatePage() {
  return <LangProvider><ErrorBoundary><Suspense fallback={<div className="min-h-screen" style={{background:"#FDF8F3"}} />}><CreatePageInner/></Suspense></ErrorBoundary></LangProvider>;
}
