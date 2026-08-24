"use client";

import React from "react";
import { AuthGuard } from "@/components/shared/AuthGuard";
import { CompetitionContextGuard } from "@/components/shared/CompetitionContextGuard";

export default function ParticipantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard role="participant">
      <CompetitionContextGuard role="participant">
        {children}
      </CompetitionContextGuard>
    </AuthGuard>
  );
}
