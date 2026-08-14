"use client";

import React from "react";
import { useCompetitionContext } from "@/lib/competition-context";
import { Loader2, AlertTriangle, Users, Trophy, Clock } from "lucide-react";
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading competition context...
          </p>
        </div>
      </div>
    );
  }

  // Error states
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md space-y-4 text-center">
          <CompetitionErrorIcon error={error} />
          <h2 className="text-lg font-semibold text-foreground">
            <CompetitionErrorTitle error={error} />
          </h2>
          <p className="text-sm text-muted-foreground">
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
    case "NO_TEAM":
    case "MULTIPLE_TEAMS":
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
    case "NO_TEAM":
      return "No Team Assigned";
    case "MULTIPLE_TEAMS":
      return "Multiple Teams Detected";
    case "TEAM_NOT_IN_RUN":
      return "Team Not Participating";
    case "NO_ACTIVE_COMPETITION":
      return "No Active Competition";
    case "NO_ACTIVE_RUN":
      return "No Active Run";
    case "NO_ACTIVE_ROUND":
      return "No Active Round";
    case "NO_PROFILE":
      return "Profile Not Found";
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
    case "NO_TEAM":
      return role === "participant"
        ? "You are not assigned to any team. Please contact the administrator to be added to a team."
        : "This user is not assigned to any team.";
    case "MULTIPLE_TEAMS":
      return "You are assigned to multiple teams. Please contact the administrator to resolve this.";
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
