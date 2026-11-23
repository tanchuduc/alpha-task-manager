"use client";

import React, { useEffect } from "react";
import { X, Download, ZoomIn, ZoomOut, RotateCw } from "lucide-react";

interface MediaLightboxModalProps {
  imageUrl: string;
  imageName?: string | null;
  onClose: () => void;
}

export function MediaLightboxModal({
  imageUrl,
  imageName,
  onClose,
}: MediaLightboxModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top action bar */}
      <div
        className="absolute top-4 right-4 flex items-center gap-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={imageUrl}
          download={imageName || "image"}
          target="_blank"
          rel="noreferrer"
          title="Tải ảnh về máy"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onClose}
          title="Đóng (Esc)"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Image container */}
      <div
        className="relative max-w-4xl max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt={imageName || "Xem trước hình ảnh"}
          className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl select-none"
        />
        {imageName && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 backdrop-blur-md px-3.5 py-1 text-xs text-white max-w-md truncate">
            {imageName}
          </div>
        )}
      </div>
    </div>
  );
}
