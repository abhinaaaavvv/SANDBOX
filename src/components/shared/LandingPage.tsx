"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const LandingPage: React.FC = () => {
  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Ghosted rupee mark — a printer's ornament behind the masthead */}
      <span
        aria-hidden
        className="font-bodoni pointer-events-none absolute -right-16 top-1/2 hidden select-none text-[26rem] font-medium italic leading-none text-foreground/4 md:block"
      >
        ₹
      </span>

      <header className="flex items-center justify-between border-b border-border px-6 py-4 lg:px-10">
        <span className="font-bodoni text-xl font-semibold tracking-tight text-foreground select-none">
          SANDBOX
        </span>
        <span className="font-bodoni text-sm italic text-muted-foreground">
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
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-fit text-left">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Business Club Competition
          </p>
          <h1 className="font-bodoni mb-5 text-7xl font-medium tracking-tight text-foreground md:text-8xl lg:text-9xl">
            SANDBOX
          </h1>
          <Separator className="mb-5 max-w-[15rem] md:max-w-[20rem] lg:max-w-md" />
          {/*<p className="font-bodoni mb-2 max-w-[17rem] text-xl font-medium italic leading-snug text-foreground/90 md:max-w-[22rem] lg:max-w-lg lg:text-2xl">
            Where teams trade, react, and compete.
          </p>*/}
          <p className="mb-10 max-w-[16rem] md:max-w-[20rem] lg:max-w-md text-sm leading-relaxed text-muted-foreground">
            A live market simulation across three timed rounds — build your
            portfolio, read the paper, call the moves.
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

      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 border-t border-border px-6 py-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground lg:px-10">
        <span>
          Round <span className="font-bodoni text-xs normal-case italic">01</span> — Portfolio Building
        </span>
        <span>
          Round <span className="font-bodoni text-xs normal-case italic">02</span> — Newspaper Trading
        </span>
        <span>
          Round <span className="font-bodoni text-xs normal-case italic">03</span> — Video Trading
        </span>
      </footer>
    </div>
  );
};
