"use client";

import React from "react";
import { AuthGuard } from "@/components/shared/AuthGuard";
import { AppHeader } from "@/components/shared/AppHeader";
import { CompetitionContextGuard } from "@/components/shared/CompetitionContextGuard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard role="admin">
      <CompetitionContextGuard role="admin">
        <div className="min-h-screen bg-background text-foreground">
          <AppHeader role="admin" />
          {children}
        </div>
      </CompetitionContextGuard>
    </AuthGuard>
  );
}
