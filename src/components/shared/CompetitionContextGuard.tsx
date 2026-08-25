"use client";

import React from "react";
import { useCompetitionContext } from "@/lib/competition-context";
import { AlertTriangle, Users, Trophy, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompetitionContextGuardProps {
  /** The role being guarded. */
  role: "participant" | "admin";
  /** Child elements to render when context is valid. */
  children: React.ReactNode;
}

/**
 * Guards the console routes by checking competition context state.
 *
 * For participants:
 * - Requires valid competition context (competition, run, team, round)
 * - Shows appropriate error states for missing context
 *
 * For admins:
 * - Only requires authentication (no team needed)
 * - Shows competition context errors if they occur
 */
export const CompetitionContextGuard: React.FC<CompetitionContextGuardProps> = ({
  role,
  children,
}) => {
  const { isLoading, error, errorDetail, refresh, isRefreshing } =
    useCompetitionContext();

  // Hold the branded interstitial on screen for a beat — context often
  // resolves faster than the eye can register the loading state.
  const [minLoaderElapsed, setMinLoaderElapsed] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setMinLoaderElapsed(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  // Loading state
  if (isLoading || !minLoaderElapsed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-7 px-6">
        <span className="font-bodoni animate-page-enter text-4xl font-semibold tracking-tight text-foreground select-none">
          SANDBOX
        </span>
        <div className="h-px w-44 overflow-hidden rounded-full bg-border">
          <div className="loader-bar h-full w-1/4 rounded-full bg-foreground/70" />
        </div>
        <p className="font-bodoni text-sm italic text-muted-foreground">
          Opening the floor…
        </p>
      </div>
    );
  }

  // Error states
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md space-y-4 text-center">
          <CompetitionErrorIcon error={error} />
          <h2 className="font-bodoni text-2xl font-semibold tracking-wide text-foreground">
            <CompetitionErrorTitle error={error} />
          </h2>
          <p className="font-bodoni text-sm italic text-muted-foreground">
            <CompetitionErrorMessage error={error} role={role} />
          </p>
          {errorDetail && (
            <p className="text-xs text-muted-foreground/70">{errorDetail}</p>
          )}
          <Button
            onClick={refresh}
            disabled={isRefreshing}
            variant="outline"
            className="mt-4"
          >
            {isRefreshing ? "Refreshing..." : "Retry"}
          </Button>
        </div>
      </div>
    );
  }

  // Context is valid — render children
  return <>{children}</>;
};

// ---------------------------------------------------------------------------
// Error UI components
// ---------------------------------------------------------------------------

function CompetitionErrorIcon({ error }: { error: string }) {
  switch (error) {
    case "TEAM_NOT_IN_RUN":
      return <Users className="size-12 text-muted-foreground" />;
    case "NO_ACTIVE_COMPETITION":
    case "NO_ACTIVE_RUN":
      return <Trophy className="size-12 text-muted-foreground" />;
    case "NO_ACTIVE_ROUND":
      return <Clock className="size-12 text-muted-foreground" />;
    default:
      return <AlertTriangle className="size-12 text-muted-foreground" />;
  }
}

function CompetitionErrorTitle({ error }: { error: string }) {
  switch (error) {
    case "TEAM_NOT_IN_RUN":
      return "Team Not Participating";
    case "NO_ACTIVE_COMPETITION":
      return "No Active Competition";
    case "NO_ACTIVE_RUN":
      return "No Active Run";
    case "NO_ACTIVE_ROUND":
      return "No Active Round";
    case "NO_PROFILE":
      return "Team Not Found";
    case "AUTH_ERROR":
      return "Authentication Error";
    default:
      return "Context Error";
  }
}

function CompetitionErrorMessage({
  error,
  role,
}: {
  error: string;
  role: "participant" | "admin";
}) {
  switch (error) {
    case "TEAM_NOT_IN_RUN":
      return role === "participant"
        ? "Your team is not participating in the current competition run. Please contact the administrator."
        : "The team is not participating in the current competition run.";
    case "NO_ACTIVE_COMPETITION":
      return role === "participant"
        ? "There is no active competition at this time. Please wait for the administrator to start a competition."
        : "There is no active competition. Create or activate a competition to proceed.";
    case "NO_ACTIVE_RUN":
      return role === "participant"
        ? "There is no active competition run. Please wait for the administrator to start a run."
        : "There is no active competition run. Start a run to proceed.";
    case "NO_ACTIVE_ROUND":
      return role === "participant"
        ? "No round is currently active. Please wait for the administrator to start a round."
        : "No round is currently active. Start a round to proceed.";
    case "NO_PROFILE":
      return "Your user profile could not be found. Please contact the administrator.";
    case "AUTH_ERROR":
      return "An authentication error occurred. Please try signing in again.";
    default:
      return "An unexpected error occurred. Please try again.";
  }
}
