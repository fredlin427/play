"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/cn";
import {
  Pencil, Eraser, Minus, Square, Type, Trash2, Undo, Download, Palette,
} from "lucide-react";

type Tool = "pen" | "eraser" | "line" | "rect" | "text";

interface SketchPadProps {
  onSave?: (dataUrl: string) => void;
  className?: string;
}

interface DrawAction {
  tool: Tool;
  points: Array<{ x: number; y: number }>;
  color: string;
  lineWidth: number;
  text?: string;
}

const COLORS = ["#000000", "#333333", "#666666", "#0066CC", "#CC0000", "#009933", "#FF6600", "#9933CC"];
const DEFAULT_COLOR = "#000000";
const DEFAULT_LINE_WIDTH = 3;

export function SketchPad({ onSave, className }: SketchPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [lineWidth, setLineWidth] = useState(DEFAULT_LINE_WIDTH);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [textValue, setTextValue] = useState("");
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);

  // Initialize canvas size (only on mount and window resize — NOT on color/lineWidth change)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height || 400;

      // Save current canvas content before resize
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0);
      }

      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.width = w * dpr;
      canvas.height = h * dpr;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        // Restore previous canvas content
        if (tempCtx) {
          ctx.drawImage(tempCanvas, 0, 0, w, h);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []); // Only run on mount — color/lineWidth are set per-stroke, not needed here

  // Get canvas-relative coordinates
  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0]?.clientX || (e as React.TouchEvent).changedTouches[0]?.clientX || 0;
      clientY = e.touches[0]?.clientY || (e as React.TouchEvent).changedTouches[0]?.clientY || 0;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  // Save canvas snapshot for undo
  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, []);

  // Restore snapshot
  const restoreSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshotRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(snapshotRef.current, 0, 0);
  }, []);

  // Start drawing
  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPos(e);
    saveSnapshot();

    if (tool === "text") {
      setTextInput({ x: pos.x, y: pos.y, visible: true });
      setTextValue("");
      return;
    }

    setIsDrawing(true);
    lastPointRef.current = pos;
    startPointRef.current = pos;
    setCurrentAction({ tool, points: [pos], color, lineWidth });
  }, [tool, color, lineWidth, getPos, saveSnapshot]);

  // Draw
  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing || tool === "text") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    const last = lastPointRef.current;
    if (!last) return;

    // For pen/eraser: draw freehand
    if (tool === "pen" || tool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
      ctx.lineWidth = tool === "eraser" ? lineWidth * 3 : lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      setCurrentAction((prev) => {
        if (!prev) return prev;
        return { ...prev, points: [...prev.points, pos] };
      });
    } else {
      // For line/rect: restore snapshot and redraw preview
      restoreSnapshot();
      const start = startPointRef.current!;

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";

      if (tool === "line") {
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(pos.x, pos.y);
      } else if (tool === "rect") {
        ctx.strokeRect(start.x, start.y, pos.x - start.x, pos.y - start.y);
      }
      ctx.stroke();
    }

    lastPointRef.current = pos;
  }, [isDrawing, tool, color, lineWidth, getPos, restoreSnapshot]);

  // End drawing
  const handleEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;

    const pos = getPos(e);

    if (tool === "line" || tool === "rect") {
      restoreSnapshot();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const start = startPointRef.current;
      if (ctx && start) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        if (tool === "line") {
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(pos.x, pos.y);
        } else {
          ctx.strokeRect(start.x, start.y, pos.x - start.x, pos.y - start.y);
        }
        ctx.stroke();
      }
    }

    setIsDrawing(false);
    if (currentAction) {
      setActions((prev) => [...prev, { ...currentAction, points: [...currentAction.points, pos] }]);
    }
    setCurrentAction(null);
    lastPointRef.current = null;
    startPointRef.current = null;
  }, [isDrawing, currentAction, tool, color, lineWidth, getPos, restoreSnapshot]);

  // Add text to canvas
  const handleTextConfirm = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.font = `${lineWidth * 5}px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(textValue, textInput.x, textInput.y);

    setActions((prev) => [...prev, {
      tool: "text",
      points: [{ x: textInput.x, y: textInput.y }],
      color,
      lineWidth,
      text: textValue,
    }]);
    setTextInput({ x: 0, y: 0, visible: false });
    setTextValue("");
  }, [textValue, textInput, color, lineWidth]);

  // Undo
  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const newActions = actions.slice(0, -1);
    setActions(newActions);

    // Redraw everything from the beginning
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    for (const action of newActions) {
      ctx.beginPath();
      const col = action.tool === "eraser" ? "#ffffff" : action.color;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = action.tool === "eraser" ? action.lineWidth * 3 : action.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (action.tool === "text" && action.text) {
        ctx.font = `${action.lineWidth * 5}px sans-serif`;
        ctx.fillText(action.text, action.points[0].x, action.points[0].y);
      } else if (action.points.length >= 2) {
        if (action.tool === "rect") {
          const s = action.points[0];
          const e = action.points[action.points.length - 1];
          ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y);
        } else {
          ctx.moveTo(action.points[0].x, action.points[0].y);
          for (let i = 1; i < action.points.length; i++) {
            ctx.lineTo(action.points[i].x, action.points[i].y);
          }
          ctx.stroke();
        }
      }
    }
  }, [actions]);

  // Clear all
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setActions([]);
  }, []);

  // Export as PNG
  const handleExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    if (onSave) onSave(dataUrl);

    // Also trigger download
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `sketch_${Date.now()}.png`;
    a.click();
  }, [onSave]);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50 rounded-lg border">
        {([
          { key: "pen", icon: Pencil, label: "Pen" },
          { key: "eraser", icon: Eraser, label: "Eraser" },
          { key: "line", icon: Minus, label: "Line" },
          { key: "rect", icon: Square, label: "Rect" },
          { key: "text", icon: Type, label: "Text" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTool(t.key)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors",
              tool === t.key
                ? "bg-blue-600 text-white shadow"
                : "bg-white text-gray-700 hover:bg-gray-200 border"
            )}
            title={t.label}
          >
            <t.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Color picker */}
        <div className="flex items-center gap-0.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn(
                "w-5 h-5 rounded-full border-2 transition-transform",
                color === c ? "border-blue-600 scale-110" : "border-gray-300 hover:scale-105"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <div className="relative ml-1">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="absolute inset-0 opacity-0 w-6 h-6 cursor-pointer"
            />
            <Palette className="w-5 h-5 text-gray-500" />
          </div>
        </div>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Line width */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500 w-6">{lineWidth}px</span>
          <input
            type="range"
            min="1"
            max="10"
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="w-16 h-1 accent-blue-600"
          />
        </div>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Actions */}
        <button
          onClick={handleUndo}
          disabled={actions.length === 0}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs bg-white text-gray-700 hover:bg-gray-200 border disabled:opacity-40"
        >
          <Undo className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleClear}
          disabled={actions.length === 0}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs bg-white text-red-600 hover:bg-red-50 border disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1" />

        <button
          onClick={handleExport}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative border rounded-lg bg-white overflow-hidden" style={{ minHeight: 350 }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          className={cn(
            "touch-none",
            tool === "eraser" && "cursor-cell",
            tool === "text" && "cursor-text",
            tool === "pen" && "cursor-crosshair",
            (tool === "line" || tool === "rect") && "cursor-crosshair"
          )}
        />

        {/* Text input overlay */}
        {textInput.visible && (
          <div
            className="absolute z-10"
            style={{ left: textInput.x, top: textInput.y }}
          >
            <input
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTextConfirm();
                if (e.key === "Escape") setTextInput({ x: 0, y: 0, visible: false });
              }}
              onBlur={handleTextConfirm}
              className="border border-blue-400 rounded px-2 py-1 text-sm bg-white/90 outline-none min-w-[120px]"
              placeholder="Type text..."
              style={{ color, fontSize: lineWidth * 5 }}
            />
          </div>
        )}

        {/* Empty canvas hint */}
        {actions.length === 0 && !isDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-300 text-sm select-none">
            Draw here — use mouse or touch
          </div>
        )}
      </div>
    </div>
  );
}
