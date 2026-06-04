"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/cn";
import { ImagePlus, X, Upload, FileImage, Loader2 } from "lucide-react";

interface UploadedImage {
  id: string;
  imageUrl: string;
  fileSize: number;
  previewUrl: string;
  fileName: string;
}

interface ReferenceImageUploaderProps {
  projectId: string | null;
  onUpload: (images: UploadedImage[]) => void;
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

export function ReferenceImageUploader({ projectId, onUpload }: ReferenceImageUploaderProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
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
    const newImages: UploadedImage[] = [];

    for (const file of Array.from(files)) {
      if (!ALLOWED.includes(file.type)) {
        setError(`"${file.name}" is not a supported image type (PNG, JPEG, WebP)`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        setError(`"${file.name}" exceeds 10MB limit`);
        continue;
      }

      // Create preview
      const previewUrl = URL.createObjectURL(file);
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      newImages.push({
        id: tempId,
        imageUrl: previewUrl,
        fileSize: file.size,
        previewUrl,
        fileName: file.name,
      });
    }

    if (newImages.length === 0) return;

    setImages((prev) => [...prev, ...newImages]);

    // Upload each file
    setUploading(true);
    const uploaded: UploadedImage[] = [];
    let uploadIndex = images.length;

    for (const file of Array.from(files)) {
      if (!ALLOWED.includes(file.type) || file.size > MAX_SIZE) continue;

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", projectId);

        const res = await fetch("/api/upload/image", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          const previewUrl = URL.createObjectURL(file);
          uploaded.push({
            id: data.id,
            imageUrl: data.imageUrl,
            fileSize: data.fileSize,
            previewUrl,
            fileName: file.name,
          });

          // Replace temp entry with real one
          setImages((prev) => {
            const updated = [...prev];
            const tempIdx = updated.findIndex((img) => img.id === newImages[uploadIndex]?.id);
            if (tempIdx >= 0) {
              updated[tempIdx] = {
                ...uploaded[uploaded.length - 1],
              };
            }
            return updated;
          });
          uploadIndex++;
        }
      } catch (err) {
        console.error("Upload failed:", err);
        setError(`Failed to upload "${file.name}"`);
      }
    }

    setUploading(false);
    if (uploaded.length > 0) {
      onUpload(uploaded);
    }
  }, [projectId, images.length, onUpload]);

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

  const removeImage = (id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(img.previewUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
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
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100"
        )}
      >
        <Upload className={cn(
          "w-8 h-8 mx-auto mb-2",
          isDragging ? "text-blue-500" : "text-gray-400"
        )} />
        <p className="text-sm text-gray-600 mb-1">
          {uploading ? "Uploading..." : "Drop reference images here"}
        </p>
        <p className="text-xs text-gray-400">
          PNG, JPEG, WebP — max 10MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Uploading images...
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
      )}

      {/* Preview grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group rounded-lg overflow-hidden border bg-gray-100">
              <img
                src={img.previewUrl}
                alt={img.fileName}
                className="w-full aspect-square object-cover"
              />
              <button
                onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">
                {img.fileName} ({(img.fileSize / 1024).toFixed(0)}KB)
              </div>
            </div>
          ))}
        </div>
      )}

      {!projectId && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
          Create the project first, then upload reference images.
        </p>
      )}
    </div>
  );
}
