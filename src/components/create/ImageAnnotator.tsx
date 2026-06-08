"use client";

import { useRef, useState, useCallback } from "react";
import { Pencil, Eraser, Undo, Send, X } from "lucide-react";

interface ImageAnnotatorProps {
  imageUrl: string;
  onAnalyze: (originalBase64: string, annotatedBase64: string, drawingDesc: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export function ImageAnnotator({ imageUrl, onAnalyze, onClose, loading }: ImageAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#FF0000");
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef<ImageData[]>([]);

  const COLORS = ["#FF0000", "#0066FF", "#00AA00", "#FF6600", "#9900FF", "#FFFF00"];

  // Initialize canvas when image loads
  const handleImageLoad = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const dpr = window.devicePixelRatio || 1;
    const maxDisplayW = 500;
    const scale = Math.min(1, maxDisplayW / w);
    // Use full resolution for drawing, scale only CSS display size
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w * scale}px`;
    canvas.style.height = `${h * scale}px`;
    // Draw image at native resolution (CSS size is scaled for display)
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0);
    }
  }, []);

  const getPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const saveStroke = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    strokes.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  };

  const handleStart = (e: React.MouseEvent) => {
    setDrawing(true);
    saveStroke();
    const pos = getPos(e);
    lastPoint.current = pos;
    setHasDrawn(true);
  };

  const handleMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    const last = lastPoint.current;
    if (!last) return;

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === "eraser" ? "#FFFFFF" : color;
    ctx.lineWidth = tool === "eraser" ? 20 : 8;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.85;
    ctx.stroke();

    lastPoint.current = pos;
  };

  const handleEnd = () => setDrawing(false);

  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const prev = strokes.current.pop();
    if (prev) {
      ctx.putImageData(prev, 0, 0);
    } else {
      // Redraw just the original image
      const img = imgRef.current;
      if (img) ctx.drawImage(img, 0, 0);
    }
    if (strokes.current.length === 0) setHasDrawn(false);
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    // Original generated image (without annotations)
    const origCanvas = document.createElement("canvas");
    origCanvas.width = canvas.width;
    origCanvas.height = canvas.height;
    const origCtx = origCanvas.getContext("2d");
    if (origCtx) origCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const originalBase64 = origCanvas.toDataURL("image/png");

    // Annotated image (original + user drawing)
    const annotatedBase64 = canvas.toDataURL("image/png");

    // Build a text description of what the user drew
    const colors = new Set(strokes.current.map(() => "#FF0000")); // simplified
    const drawingDesc = `User drew on the image with red pen (thick lines).`;

    onAnalyze(originalBase64, annotatedBase64, drawingDesc);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b bg-gray-50">
          <button onClick={() => setTool("pen")} className={`p-2 rounded-lg text-xs font-medium ${tool === "pen" ? "bg-red-100 text-red-700" : "bg-white text-gray-600 border hover:bg-gray-100"}`}>
            <Pencil className="w-4 h-4"/>
          </button>
          <button onClick={() => setTool("eraser")} className={`p-2 rounded-lg text-xs font-medium ${tool === "eraser" ? "bg-blue-100 text-blue-700" : "bg-white text-gray-600 border hover:bg-gray-100"}`}>
            <Eraser className="w-4 h-4"/>
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1"/>
          {COLORS.map(c => (
            <button key={c} onClick={() => { setTool("pen"); setColor(c); }}
              className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
              style={{ backgroundColor: c, borderColor: color === c && tool === "pen" ? "#333" : "transparent" }}/>
          ))}
          <div className="flex-1"/>
          <button onClick={handleUndo} disabled={!hasDrawn} className="p-2 rounded-lg text-xs bg-white text-gray-600 border hover:bg-gray-100 disabled:opacity-30">
            <Undo className="w-4 h-4"/>
          </button>
          <button onClick={onClose} className="p-2 rounded-lg text-xs bg-white text-gray-600 border hover:bg-gray-100">
            <X className="w-4 h-4"/>
          </button>
        </div>

        <div className="flex gap-0">
          {/* Drawing tips sidebar */}
          <div className="w-52 shrink-0 bg-gray-50 border-r p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 500 }}>
            <p className="text-[11px] font-semibold text-gray-700">How to draw changes</p>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Draw directly on the image what you want to <b>add</b> or <b>change</b>. The AI will see your drawing and add it to the object.
            </p>
            <div className="space-y-2 pt-1">
              {[
                { title: "Add a shape", desc: "Draw the shape where you want it — a handle, a button, a panel, a hole, a pattern" },
                { title: "Change a contour", desc: "Draw over an edge to make it curved, wavy, angled, or rounded" },
                { title: "Add a component", desc: "Draw a new part — a drawer, a leg, a hook, a lid, a knob" },
                { title: "Remove something", desc: "Scribble over the part you want gone" },
                { title: "Modify a surface", desc: "Draw a pattern or texture on a surface — dots, lines, grid, heart" },
              ].map((tip, i) => (
                <div key={i} className="text-[10px] leading-tight">
                  <p className="font-medium text-gray-700">{i+1}. {tip.title}</p>
                  <p className="text-gray-400 ml-3">{tip.desc}</p>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-gray-200">
              <p className="text-[10px] text-gray-400 italic">💡 Draw like you're sketching on a napkin — the AI understands visual intent.</p>
            </div>
          </div>

          {/* Canvas */}
          <div className="relative bg-gray-100 flex items-center justify-center p-4 flex-1" style={{ minHeight: 300 }}>
            <img ref={imgRef} src={imageUrl} alt="Generated" className="hidden" onLoad={handleImageLoad}/>
            <canvas ref={canvasRef}
              onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleEnd} onMouseLeave={handleEnd}
              className="cursor-crosshair rounded-lg shadow-lg bg-white"/>
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-sm text-gray-400 bg-white/80 px-4 py-2 rounded-full">
                  Draw on the image — see guide on the left
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Submit button */}
        <div className="p-3 border-t bg-gray-50 flex justify-end">
          <button onClick={handleSubmit} disabled={!hasDrawn || loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white font-medium text-sm hover:from-amber-600 hover:to-rose-600 disabled:opacity-50 shadow-md">
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Analyzing...</>
            ) : (
              <><Send className="w-4 h-4"/> Analyze & Update Prompt</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
