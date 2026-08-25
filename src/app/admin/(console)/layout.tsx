"use client";

import React from "react";
import { AuthGuard } from "@/components/shared/AuthGuard";
import { CompetitionContextGuard } from "@/components/shared/CompetitionContextGuard";
import { ConsoleProviders } from "@/components/shared/ConsoleProviders";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConsoleProviders>
      <AuthGuard role="admin">
        <CompetitionContextGuard role="admin">{children}</CompetitionContextGuard>
      </AuthGuard>
    </ConsoleProviders>
  );
}
