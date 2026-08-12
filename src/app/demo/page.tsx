"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signInDemo } from "@/lib/auth";

export default function DemoPage() {
  const router = useRouter();

  const openDemo = (role: "admin" | "participant") => {
    signInDemo(role);
    router.replace(role === "admin" ? "/admin" : "/participant");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6">
        <div>
          <h1 className="text-2xl font-semibold">Demo dashboards</h1>
          <p className="text-sm text-muted-foreground">
            Open either console instantly — no live backend required.
          </p>
        </div>
        <div className="flex gap-3">
          <Button className="flex-1" onClick={() => openDemo("participant")}>
            Participant
          </Button>
          <Button className="flex-1" onClick={() => openDemo("admin")}>
            Admin
          </Button>
        </div>
      </div>
    </div>
  );
}
