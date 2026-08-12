"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DEMO_ACCOUNTS } from "@/lib/demo-session";
import { signIn, signInDemo, getSession, type AuthRole } from "@/lib/auth";
import { ArrowLeft, ShieldAlert } from "lucide-react";

interface LoginFormProps {
  mode: AuthRole;
}

const CONSOLE_PATHS: Record<AuthRole, string> = {
  participant: "/participant",
  admin: "/admin",
};

export const LoginForm: React.FC<LoginFormProps> = ({ mode }) => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const title = mode === "admin" ? "Admin Sign In" : "Participant Login";

  // Already-authenticated users skip straight to their console.
  useEffect(() => {
    if (getSession(mode)) {
      router.replace(CONSOLE_PATHS[mode]);
    }
  }, [mode, router]);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return; // guard against rapid double-submits
    setError(null);
    setIsSubmitting(true);

    const result = await signIn(email, password);
    if (!result.ok) {
      setIsSubmitting(false);
      setError(result.error ?? "Unable to sign in.");
      return;
    }

    // Route to the console matching the account's real role (a participant
    // signing in from the admin portal lands on /participant, and vice versa).
    router.replace(result.role === "admin" ? "/admin" : "/participant");
  };

  const openDemo = () => {
    // One-click demo entry that matches this page's own role only.
    const result = signInDemo(mode);
    router.replace(result.role === "admin" ? "/admin" : "/participant");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4 lg:px-10">
        <Link href="/" className="font-garamond text-xl font-semibold tracking-tight text-foreground select-none">
          SANDBOX
        </Link>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
            {mode === "admin" ? "Administrator Access" : "Team Access"}
          </p>
          <h1 className="mb-8 text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${mode}-email`}>Email</Label>
              <Input
                id={`${mode}-email`}
                type="email"
                autoComplete="email"
                placeholder="team@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${mode}-password`}>Password</Label>
              <Input
                id={`${mode}-password`}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-down/25 bg-down/10 px-3 py-2.5 text-sm text-down">
                <ShieldAlert className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2 w-full">
              {isSubmitting ? "Signing In…" : "Sign In"}
            </Button>
          </form>

          <Separator className="my-6" />
          <div className="space-y-2 text-center text-xs text-muted-foreground">
            <p>Access is provisioned by the competition administrator.</p>
            <p className="font-medium text-foreground">
              {mode === "admin" ? "Demo admin account:" : "Demo team account:"}
            </p>
            <p>
              {DEMO_ACCOUNTS[mode].email} / {DEMO_ACCOUNTS[mode].password}
            </p>
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={openDemo}
              >
                Open {mode === "admin" ? "Admin" : "Participant"} Demo
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
