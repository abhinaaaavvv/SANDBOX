"use client";

import React from "react";
import { AuthGuard } from "@/components/shared/AuthGuard";
import { CompetitionContextGuard } from "@/components/shared/CompetitionContextGuard";
import { ConsoleProviders } from "@/components/shared/ConsoleProviders";

export default function ParticipantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConsoleProviders>
      <AuthGuard role="participant">
        <CompetitionContextGuard role="participant">
          {children}
        </CompetitionContextGuard>
      </AuthGuard>
    </ConsoleProviders>
  );
}
