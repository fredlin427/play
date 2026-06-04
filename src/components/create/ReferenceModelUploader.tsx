"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/cn";
import { Box, X, Upload, Loader2, FileArchive } from "lucide-react";

interface UploadedModel {
  id: string;
  fileUrl: string;
  fileFormat: string;
  fileSize: number;
  fileName: string;
}

interface ReferenceModelUploaderProps {
  projectId: string | null;
  onUpload: (models: UploadedModel[]) => void;
}

const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = [".stl", ".obj", ".step", ".stp"];

export function ReferenceModelUploader({ projectId, onUpload }: ReferenceModelUploaderProps) {
  const [models, setModels] = useState<UploadedModel[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (files: FileList) => {
    if (!projectId) {
      setError("Create project first before uploading");
      return;
    }

    setError("");
    const newModels: UploadedModel[] = [];

    for (const file of Array.from(files)) {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setError(`"${file.name}" is not supported (STL, OBJ, STEP only)`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        setError(`"${file.name}" exceeds 50MB limit`);
        continue;
      }

      newModels.push({
        id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        fileUrl: "",
        fileFormat: ext.replace(".", ""),
        fileSize: file.size,
        fileName: file.name,
      });
    }

    if (newModels.length === 0) return;
    setModels((prev) => [...prev, ...newModels]);

    // Upload
    setUploading(true);
    const uploaded: UploadedModel[] = [];

    for (const file of Array.from(files)) {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext) || file.size > MAX_SIZE) continue;

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", projectId);

        const res = await fetch("/api/upload/model", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          uploaded.push({
            id: data.id,
            fileUrl: data.fileUrl,
            fileFormat: data.fileFormat,
            fileSize: data.fileSize,
            fileName: file.name,
          });
        }
      } catch (err) {
        console.error("Upload failed:", err);
        setError(`Failed to upload "${file.name}"`);
      }
    }

    setUploading(false);
    if (uploaded.length > 0) {
      setModels((prev) => {
        const updated = [...prev];
        for (const um of uploaded) {
          const tempIdx = updated.findIndex(
            (m) => m.fileName === um.fileName && m.fileUrl === ""
          );
          if (tempIdx >= 0) updated[tempIdx] = um;
        }
        return updated;
      });
      onUpload(uploaded);
    }
  }, [projectId, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  }, [processFiles]);

  const removeModel = (id: string) => {
    setModels((prev) => prev.filter((m) => m.id !== id));
  };

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / 1024).toFixed(0)}KB`;
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
          isDragging
            ? "border-purple-400 bg-purple-50"
            : "border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100"
        )}
      >
        <Box className={cn(
          "w-8 h-8 mx-auto mb-2",
          isDragging ? "text-purple-500" : "text-gray-400"
        )} />
        <p className="text-sm text-gray-600 mb-1">
          {uploading ? "Uploading..." : "Drop 3D reference files here"}
        </p>
        <p className="text-xs text-gray-400">
          STL, OBJ, STEP — max 50MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".stl,.obj,.step,.stp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-purple-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Uploading models...
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
      )}

      {/* Model list */}
      {models.length > 0 && (
        <div className="space-y-1.5">
          {models.map((m) => (
            <div key={m.id} className="flex items-center gap-3 bg-white border rounded-lg px-3 py-2">
              <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center shrink-0">
                <FileArchive className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.fileName}</p>
                <p className="text-xs text-gray-500">
                  {m.fileFormat.toUpperCase()} • {formatSize(m.fileSize)}
                  {m.fileUrl === "" && " (uploading...)"}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeModel(m.id); }}
                className="text-gray-400 hover:text-red-600 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!projectId && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
          Create the project first, then upload reference models.
        </p>
      )}
    </div>
  );
}
