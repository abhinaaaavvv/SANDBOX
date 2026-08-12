"use client";

import React, { useEffect, useRef } from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { Tv, X } from "lucide-react";

export const VideoOverlay: React.FC = () => {
  const { isVideoPlaying, activeVideo, videoPlaybackStartedAt, stopVideo } =
    useSandboxStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Seek to the elapsed playback offset so every tab starts near-simultaneously,
  // regardless of when the broadcast event arrived.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoPlaybackStartedAt || !activeVideo) return;

    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - new Date(videoPlaybackStartedAt).getTime()) / 1000)
    );
    const target = Math.min(elapsed, activeVideo.durationSeconds);

    const seek = () => {
      try {
        if (Math.abs(el.currentTime - target) > 1) el.currentTime = target;
      } catch {
        // Seek can throw before metadata is ready; ignore.
      }
    };

    if (el.readyState >= 1) seek();
    else {
      el.addEventListener("loadedmetadata", seek, { once: true });
      return () => el.removeEventListener("loadedmetadata", seek);
    }
  }, [activeVideo, videoPlaybackStartedAt]);

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

      {/*
        Player — key includes the broadcast start so the element remounts when a
        different video is played OR the same video is broadcast again, keeping
        the playback offset math correct.
      */}
      <div className="relative aspect-video bg-black">
        <video
          key={`${activeVideo.id}:${videoPlaybackStartedAt ?? "idle"}`}
          ref={videoRef}
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
