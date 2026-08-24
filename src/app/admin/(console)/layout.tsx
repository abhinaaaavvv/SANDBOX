"use client";

import React from "react";
import { AuthGuard } from "@/components/shared/AuthGuard";
import { CompetitionContextGuard } from "@/components/shared/CompetitionContextGuard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard role="admin">
      <CompetitionContextGuard role="admin">{children}</CompetitionContextGuard>
    </AuthGuard>
  );
}
