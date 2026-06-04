"use client";

import { useEffect, useState } from "react";
import { Check, X, Loader2, AlertTriangle } from "lucide-react";
import type { BlenderJobRecord } from "@/lib/project-state";

interface BlenderStatusCardProps {
  jobId: string | null;
  onComplete: (stlUrl: string, checks: Array<{ name: string; passed: boolean; message: string }>) => void;
}

export function BlenderStatusCard({ jobId, onComplete }: BlenderStatusCardProps) {
  const [status, setStatus] = useState<string>("idle");
  const [progress, setProgress] = useState(0);
  const [checks, setChecks] = useState<Array<{ name: string; passed: boolean; message: string }>>([]);
  const [stlUrl, setStlUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/blender/status/${jobId}`);
        const data = await res.json();
        setStatus(data.status);
        setProgress(data.progress || 0);
        setChecks(data.checks || []);
        if (data.outputStlUrl) setStlUrl(data.outputStlUrl);
        if (data.status === "completed" && data.outputStlUrl) {
          clearInterval(poll);
          onComplete(data.outputStlUrl, data.checks || []);
        }
        if (data.status === "failed") clearInterval(poll);
      } catch {
        // retry next interval
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [jobId, onComplete]);

  if (!jobId) return null;

  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        {status === "running" && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
        {status === "completed" && <Check className="w-4 h-4 text-green-600" />}
        {status === "failed" && <X className="w-4 h-4 text-red-600" />}
        <span className="font-medium text-sm">
          {status === "pending" && "Waiting..."}
          {status === "running" && `Processing... ${Math.round(progress * 100)}%`}
          {status === "completed" && "Processing complete"}
          {status === "failed" && "Processing failed"}
        </span>
      </div>

      {status === "running" && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {checks.length > 0 && (
        <div className="space-y-1">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {c.passed ? (
                <Check className="w-3 h-3 text-green-600 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-red-600 mt-0.5 shrink-0" />
              )}
              <span>{c.message}</span>
            </div>
          ))}
        </div>
      )}

      {stlUrl && status === "completed" && (
        <a
          href={stlUrl}
          download
          className="inline-block bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700"
        >
          Download STL
        </a>
      )}
    </div>
  );
}
