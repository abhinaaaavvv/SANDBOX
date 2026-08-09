"use client";

import React from "react";
import { AuthGuard } from "@/components/shared/AuthGuard";
import { AppHeader } from "@/components/shared/AppHeader";
import { VideoOverlay } from "@/components/shared/VideoOverlay";

export default function ParticipantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard role="participant">
      <div className="min-h-screen bg-background text-foreground">
        <AppHeader role="participant" />
        {children}
        <VideoOverlay />
      </div>
    </AuthGuard>
  );
}
