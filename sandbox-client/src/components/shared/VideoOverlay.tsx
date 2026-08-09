"use client";

import React from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { Tv, X } from "lucide-react";

export const VideoOverlay: React.FC = () => {
  const { isVideoPlaying, activeVideo, stopVideo } = useSandboxStore();

  if (!isVideoPlaying || !activeVideo) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 w-full max-w-md overflow-hidden rounded-lg border border-ring/70 bg-card ring-1 ring-white/10 animate-in fade-in-0 slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Tv className="size-3.5 animate-pulse text-muted-foreground" />
          <span>Synchronized Video Broadcast</span>
        </div>
        <button
          type="button"
          onClick={stopVideo}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Stop video broadcast"
          aria-label="Stop video broadcast"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Player — key remounts when a different video is broadcast so it starts cleanly */}
      <div className="relative aspect-video bg-black">
        <video
          key={activeVideo.id}
          src={activeVideo.url}
          autoPlay
          playsInline
          controls
          className="h-full w-full object-cover"
        />
      </div>

      {/* Details */}
      <div className="space-y-1 border-t border-border bg-card p-3">
        <div className="text-sm font-semibold text-foreground">{activeVideo.title}</div>
        <p className="text-xs leading-tight text-muted-foreground">{activeVideo.description}</p>
      </div>
    </div>
  );
};
