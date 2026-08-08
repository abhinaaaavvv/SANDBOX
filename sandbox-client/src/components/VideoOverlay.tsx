"use client";

import React from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { Tv, X } from "lucide-react";

export const VideoOverlay: React.FC = () => {
  const { isVideoPlaying, activeVideo, stopVideo } = useSandboxStore();

  if (!isVideoPlaying || !activeVideo) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-md bg-[#0d0e14] border border-[#27272a] font-mono shadow-2xl animate-in slide-in-from-bottom duration-200">
      {/* Header */}
      <div className="bg-[#111218] px-3 py-2 flex items-center justify-between border-b border-[#18181b]">
        <div className="flex items-center gap-2 text-[#f4f4f5] text-xs font-bold uppercase tracking-wider">
          <Tv className="h-3.5 w-3.5 text-[#a1a1aa] animate-pulse" />
          <span>SYNCHRONIZED VIDEO BROADCAST</span>
        </div>
        <button
          onClick={stopVideo}
          className="text-[#71717a] hover:text-[#f4f4f5] p-1 transition-colors"
          title="Minimize / Close Video Overlay"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Video player */}
      <div className="relative aspect-video bg-black">
        <video
          src={activeVideo.url}
          autoPlay
          controls
          className="w-full h-full object-cover"
        />
      </div>

      {/* Video Details */}
      <div className="p-3 bg-[#0d0e14] border-t border-[#18181b] space-y-1">
        <div className="font-bold text-xs text-[#f4f4f5] uppercase">
          {activeVideo.title}
        </div>
        <p className="text-[11px] text-[#71717a] leading-tight">
          {activeVideo.description}
        </p>
      </div>
    </div>
  );
};
