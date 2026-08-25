"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const LandingPage: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4 lg:px-10">
        <span className="font-bodoni text-xl font-semibold tracking-tight text-foreground select-none">
          SANDBOX
        </span>
        <span className="text-xs text-muted-foreground">Live Market Simulation</span>
      </header>

      {/*
        Centered hero: the content block sizes itself to fit its widest child
        (the SANDBOX wordmark), so centering the block optically centers the
        title. The separator and paragraph are capped just below the wordmark
        width at each breakpoint, so the wordmark always stays the widest
        element. Everything keeps a strong left edge (text-left).
      */}
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-fit text-left">
          <p className="mb-4 text-xs font-medium tracking-wide text-muted-foreground">
            Business Club Competition
          </p>
          <h1 className="font-bodoni mb-6 text-6xl font-medium tracking-tight text-foreground md:text-7xl lg:text-8xl">
            SANDBOX
          </h1>
          <Separator className="mb-6 max-w-[15rem] md:max-w-[18rem] lg:max-w-sm" />
          <p className="mb-10 max-w-[16rem] md:max-w-[20rem] lg:max-w-md text-base leading-relaxed text-muted-foreground">
            A live market simulation where teams trade, react, and compete across
            three timed rounds.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/participant/login">Participant Login</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/admin/login">Admin Sign In</Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-4 text-xs text-muted-foreground lg:px-10">
        <span>Round 01 — Portfolio Building</span>
        <span>Round 02 — Newspaper Trading</span>
        <span>Round 03 — Video Trading</span>
      </footer>
    </div>
  );
};
