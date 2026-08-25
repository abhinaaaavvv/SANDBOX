"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const LandingPage: React.FC = () => {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Ghosted rupee mark — a printer's ornament in the lower corner */}
      <span
        aria-hidden
        className="ghost-glyph -bottom-16 -right-8 hidden text-[24rem] md:block"
      >
        ₹
      </span>

      <header className="animate-page-enter flex items-center justify-between border-b border-border px-6 py-4 lg:px-10">
        <span
          className="rise-in font-bodoni text-xl font-semibold tracking-tight text-foreground select-none"
          style={{ "--rise-delay": "0.5s" } as React.CSSProperties}
        >
          SANDBOX
        </span>
        <span
          className="rise-in font-bodoni text-sm italic text-muted-foreground"
          style={{ "--rise-delay": "0.56s" } as React.CSSProperties}
        >
          Live Market Simulation
        </span>
      </header>

      {/*
        Centered hero: the content block sizes itself to fit its widest child
        (the SANDBOX wordmark), so centering the block optically centers the
        title. The separator and paragraph are capped just below the wordmark
        width at each breakpoint, so the wordmark always stays the widest
        element. Everything keeps a strong left edge (text-left).
      */}
      <main className="animate-page-enter flex flex-1 items-center justify-center px-6">
        <div className="w-fit text-left">
          <p
            className="rise-in mb-4 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
            style={{ "--rise-delay": "0.05s" } as React.CSSProperties}
          >
            Business Club Competition
          </p>
          <h1
            className="rise-in font-bodoni mb-5 text-7xl font-medium tracking-tight text-foreground md:text-8xl lg:text-9xl"
            style={{ "--rise-delay": "0.12s" } as React.CSSProperties}
          >
            SANDBOX
          </h1>
          <div
            className="rise-in"
            style={{ "--rise-delay": "0.2s" } as React.CSSProperties}
          >
            <Separator className="mb-5 max-w-60 md:max-w-[20rem] lg:max-w-md" />
          </div>
          <p
            className="rise-in mb-10 max-w-[16rem] md:max-w-[20rem] lg:max-w-md text-sm leading-relaxed text-muted-foreground"
            style={{ "--rise-delay": "0.27s" } as React.CSSProperties}
          >
            A live market simulation across three timed rounds — build your
            portfolio, read the paper, call the moves.
          </p>
          <div
            className="rise-in flex flex-col gap-3 sm:flex-row"
            style={{ "--rise-delay": "0.34s" } as React.CSSProperties}
          >
            <Button size="lg" asChild>
              <Link href="/participant/login">Participant Login</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/admin/login">Admin Sign In</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};
