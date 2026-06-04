"use client";

import { cn } from "@/lib/cn";
import { Check, X } from "lucide-react";
import type { GeneratedImageRecord } from "@/lib/project-state";

interface ImageGalleryProps {
  images: GeneratedImageRecord[];
  approvedImageId: string | null;
  onApprove: (imageId: string) => void;
  onReject: (imageId: string) => void;
}

export function ImageGallery({ images, approvedImageId, onApprove, onReject }: ImageGalleryProps) {
  if (images.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No images generated yet. Craft a prompt and click "Generate Images".
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {images.map((img) => (
        <div
          key={img.id}
          className={cn(
            "relative rounded-lg border-2 overflow-hidden transition-all",
            img.isApproved
              ? "border-green-500 ring-2 ring-green-200"
              : "border-gray-200 hover:border-blue-300"
          )}
        >
          <img
            src={img.thumbnailUrl || img.imageUrl}
            alt="Generated"
            className="w-full aspect-square object-cover"
            loading="lazy"
          />
          {img.isApproved && (
            <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
              <Check className="w-4 h-4" />
            </div>
          )}
          {!img.isApproved && !approvedImageId && (
            <div className="absolute bottom-2 left-2 right-2 flex gap-2">
              <button
                onClick={() => onApprove(img.id)}
                className="flex-1 bg-green-600 text-white text-xs py-1.5 rounded hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => onReject(img.id)}
                className="bg-gray-600 text-white text-xs px-3 py-1.5 rounded hover:bg-gray-700"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
