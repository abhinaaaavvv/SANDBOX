"use client";

/**
 * Competition Context
 *
 * Provides authoritative competition context to the React tree:
 * - Active competition
 * - Active competition run
 * - Team participation (for participants)
 * - Current round
 *
 * Resolution flow:
 * 1. Get authenticated user from Supabase Auth
 * 2. Resolve profile from profiles table
 * 3. If participant, resolve team membership
 * 4. Resolve active competition
 * 5. Resolve active competition run
 * 6. For participants, verify team is participating in the run
 * 7. Resolve current round
 *
 * All queries use RLS-authorized reads. No SECURITY DEFINER needed.
 *
 * Does NOT handle:
 * - Mock data fallback
 * - Financial state (cash, holdings, portfolio)
 * - Trading operations
 * - Realtime subscriptions
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupabaseClient = ReturnType<typeof createClient>;

export type UserRole = "participant" | "admin";

/** Competition definition. */
export interface Competition {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

/** Competition run within a competition. */
export interface CompetitionRun {
  id: string;
  competition_id: string;
  name: string;
  status: "pending" | "active" | "completed" | "cancelled";
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Round within a competition run. */
export interface Round {
  id: string;
  competition_run_id: string;
  round_number: 1 | 2 | 3;
  round_type: "portfolio" | "newspaper" | "video";
  status: "pending" | "active" | "completed";
  started_at: string | null;
  ends_at: string | null;
  market_status: "closed" | "open";
  trading_status: "paused" | "enabled";
  created_at: string;
  updated_at: string;
}

/** Team membership for the current user. */
export interface TeamMembership {
  team_id: string;
  role: "member" | "captain";
  team: {
    id: string;
    name: string;
  };
}

/** Competition context for participants. */
export interface ParticipantCompetitionContext {
  role: "participant";
  userId: string;
  profile: {
    id: string;
    display_name: string;
    role: "participant";
  };
  teamMembership: TeamMembership;
  competition: Competition;
  competitionRun: CompetitionRun;
  currentRound: Round | null;
  isLoading: false;
  error: null;
}

/** Competition context for admins. */
export interface AdminCompetitionContext {
  role: "admin";
  userId: string;
  profile: {
    id: string;
    display_name: string;
    role: "admin";
  };
  competition: Competition;
  competitionRun: CompetitionRun;
  currentRound: Round | null;
  isLoading: false;
  error: null;
}

/** Union type for competition context. */
export type CompetitionContext =
  | ParticipantCompetitionContext
  | AdminCompetitionContext;

/** Loading state while resolving context. */
export interface CompetitionContextLoading {
  isLoading: true;
  error: null;
}

/** Error state when context resolution fails. */
export interface CompetitionContextError {
  isLoading: false;
  error: CompetitionContextErrorType;
  errorDetail?: string;
}

export type CompetitionContextErrorType =
  | "NO_PROFILE"
  | "NO_ACTIVE_COMPETITION"
  | "NO_ACTIVE_RUN"
  | "NO_TEAM"
  | "MULTIPLE_TEAMS"
  | "TEAM_NOT_IN_RUN"
  | "NO_ACTIVE_ROUND"
  | "AUTH_ERROR";

/** Full context state including loading/error. */
export type CompetitionContextState =
  | CompetitionContext
  | CompetitionContextLoading
  | CompetitionContextError;

// ---------------------------------------------------------------------------
// Resolution functions
// ---------------------------------------------------------------------------

async function resolveProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; display_name: string; role: "participant" | "admin" } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    display_name: data.display_name,
    role: data.role as "participant" | "admin",
  };
}

async function resolveTeamMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<
  | { ok: true; membership: TeamMembership }
  | { ok: false; error: "NO_TEAM" | "MULTIPLE_TEAMS" | "AUTH_ERROR" }
> {
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id, role, teams!inner(id, name)")
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: "AUTH_ERROR" };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: "NO_TEAM" };
  }

  if (data.length > 1) {
    return { ok: false, error: "MULTIPLE_TEAMS" };
  }

  const row = data[0];
  const teams = row.teams as { id: string; name: string }[] | { id: string; name: string } | null;
  
  // Handle both array and single object responses
  let team: { id: string; name: string } | null = null;
  if (Array.isArray(teams)) {
    team = teams.length > 0 ? teams[0] : null;
  } else {
    team = teams;
  }

  if (!team) {
    return { ok: false, error: "NO_TEAM" };
  }

  return {
    ok: true,
    membership: {
      team_id: row.team_id,
      role: row.role as "member" | "captain",
      team: { id: team.id, name: team.name },
    },
  };
}

async function resolveActiveCompetition(
  supabase: SupabaseClient
): Promise<Competition | null> {
  const { data, error } = await supabase
    .from("competitions")
    .select("id, name, description, status, created_at, updated_at")
    .eq("status", "active");

  if (error || !data) {
    return null;
  }

  if (data.length !== 1) {
    return null;
  }

  return data[0] as Competition;
}

async function resolveActiveRun(
  supabase: SupabaseClient,
  competitionId: string
): Promise<CompetitionRun | null> {
  const { data, error } = await supabase
    .from("competition_runs")
    .select("id, competition_id, name, status, started_at, ended_at, created_at, updated_at")
    .eq("competition_id", competitionId)
    .eq("status", "active");

  if (error || !data) {
    return null;
  }

  if (data.length !== 1) {
    return null;
  }

  return data[0] as CompetitionRun;
}

async function checkTeamParticipation(
  supabase: SupabaseClient,
  teamId: string,
  competitionRunId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("cash_ledger")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("competition_run_id", competitionRunId)
    .eq("entry_type", "initial_capital");

  if (error) {
    return false;
  }

  return (count ?? 0) > 0;
}

async function resolveCurrentRound(
  supabase: SupabaseClient,
  competitionRunId: string
): Promise<Round | null> {
  const { data: activeRound, error: activeError } = await supabase
    .from("rounds")
    .select(
      "id, competition_run_id, round_number, round_type, status, started_at, ends_at, market_status, trading_status, created_at, updated_at"
    )
    .eq("competition_run_id", competitionRunId)
    .eq("status", "active")
    .single();

  if (!activeError && activeRound) {
    return activeRound as Round;
  }

  const { data: completedRounds, error: completedError } = await supabase
    .from("rounds")
    .select(
      "id, competition_run_id, round_number, round_type, status, started_at, ends_at, market_status, trading_status, created_at, updated_at"
    )
    .eq("competition_run_id", competitionRunId)
    .eq("status", "completed")
    .order("round_number", { ascending: false })
    .limit(1);

  if (!completedError && completedRounds && completedRounds.length > 0) {
    return completedRounds[0] as Round;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main resolution function
// ---------------------------------------------------------------------------

export async function resolveCompetitionContext(
  supabase: SupabaseClient
): Promise<CompetitionContextState> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const isNoSession = authError?.message === "Auth session missing!";
    if (isNoSession) {
      return { isLoading: true, error: null };
    }
    console.error("[CompetitionContext] AUTH_ERROR:", authError?.message ?? "Not authenticated", authError);
    return {
      isLoading: false,
      error: "AUTH_ERROR",
      errorDetail: authError?.message ?? "Not authenticated",
    };
  }

  const profile = await resolveProfile(supabase, user.id);
  if (!profile) {
    return {
      isLoading: false,
      error: "NO_PROFILE",
      errorDetail: `No profile found for user ${user.id}`,
    };
  }

  let teamMembership: TeamMembership | null = null;
  if (profile.role === "participant") {
    const teamResult = await resolveTeamMembership(supabase, user.id);
    if (!teamResult.ok) {
      return {
        isLoading: false,
        error: teamResult.error,
        errorDetail:
          teamResult.error === "NO_TEAM"
            ? "User is not a member of any team"
            : teamResult.error === "MULTIPLE_TEAMS"
              ? "User is a member of multiple teams (ambiguous)"
              : "Failed to resolve team membership",
      };
    }
    teamMembership = teamResult.membership;
  }

  const competition = await resolveActiveCompetition(supabase);
  if (!competition) {
    return {
      isLoading: false,
      error: "NO_ACTIVE_COMPETITION",
      errorDetail: "No active competition found",
    };
  }

  const competitionRun = await resolveActiveRun(supabase, competition.id);
  if (!competitionRun) {
    return {
      isLoading: false,
      error: "NO_ACTIVE_RUN",
      errorDetail: "No active competition run found",
    };
  }

  if (profile.role === "participant" && teamMembership) {
    const isParticipating = await checkTeamParticipation(
      supabase,
      teamMembership.team_id,
      competitionRun.id
    );

    if (!isParticipating) {
      return {
        isLoading: false,
        error: "TEAM_NOT_IN_RUN",
        errorDetail: `Team ${teamMembership.team_id} is not participating in run ${competitionRun.id}`,
      };
    }
  }

  const currentRound = await resolveCurrentRound(supabase, competitionRun.id);

  if (profile.role === "admin") {
    return {
      role: "admin",
      userId: user.id,
      profile: {
        id: profile.id,
        display_name: profile.display_name,
        role: "admin",
      },
      competition,
      competitionRun,
      currentRound,
      isLoading: false,
      error: null,
    };
  }

  return {
    role: "participant",
    userId: user.id,
    profile: {
      id: profile.id,
      display_name: profile.display_name,
      role: "participant",
    },
    teamMembership: teamMembership!,
    competition,
    competitionRun,
    currentRound,
    isLoading: false,
    error: null,
  };
}

export async function refreshCompetitionContext(
  supabase: SupabaseClient
): Promise<CompetitionContextState> {
  return resolveCompetitionContext(supabase);
}

// ---------------------------------------------------------------------------
// React Context
// ---------------------------------------------------------------------------

interface CompetitionContextProviderValue {
  context: CompetitionContext | null;
  isLoading: boolean;
  error: CompetitionContextErrorType | null;
  errorDetail: string | null;
  refresh: () => Promise<void>;
  isRefreshing: boolean;
}

const CompetitionContext = createContext<CompetitionContextProviderValue | undefined>(
  undefined
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const CompetitionContextProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [state, setState] = useState<CompetitionContextState>({
    isLoading: true,
    error: null,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      const result = await resolveCompetitionContext(supabase);
      if (!cancelled) {
        setState(result);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED"
      ) {
        await resolve();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshCompetitionContext(supabase);
      setState(result);
    } finally {
      setIsRefreshing(false);
    }
  }, [supabase]);

  const context = useMemo(() => {
    if (state.isLoading || state.error) {
      return null;
    }
    return state;
  }, [state]);

  const isLoading = useMemo(() => state.isLoading, [state]);

  const error = useMemo(() => {
    if (state.isLoading) return null;
    return state.error;
  }, [state]);

  const errorDetail = useMemo(() => {
    if (state.isLoading || !state.error) return null;
    return "errorDetail" in state ? state.errorDetail ?? null : null;
  }, [state]);

  const value = useMemo<CompetitionContextProviderValue>(
    () => ({
      context,
      isLoading,
      error,
      errorDetail,
      refresh,
      isRefreshing,
    }),
    [context, isLoading, error, errorDetail, refresh, isRefreshing]
  );

  return (
    <CompetitionContext.Provider value={value}>
      {children}
    </CompetitionContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useCompetitionContext(): CompetitionContextProviderValue {
  const context = useContext(CompetitionContext);
  if (!context) {
    throw new Error(
      "useCompetitionContext must be used within a CompetitionContextProvider"
    );
  }
  return context;
}

export function useCurrentRound() {
  const { context, isLoading, error } = useCompetitionContext();
  return useMemo(
    () => ({
      currentRound: context?.currentRound ?? null,
      isLoading,
      error,
    }),
    [context?.currentRound, isLoading, error]
  );
}

export function useTeamInfo() {
  const { context, isLoading, error } = useCompetitionContext();
  return useMemo(() => {
    if (context?.role !== "participant") {
      return { team: null, isLoading, error };
    }
    return {
      team: context.teamMembership.team,
      isLoading,
      error,
    };
  }, [context, isLoading, error]);
}

export function useCompetitionInfo() {
  const { context, isLoading, error } = useCompetitionContext();
  return useMemo(
    () => ({
      competition: context?.competition ?? null,
      competitionRun: context?.competitionRun ?? null,
      isLoading,
      error,
    }),
    [context?.competition, context?.competitionRun, isLoading, error]
  );
}
