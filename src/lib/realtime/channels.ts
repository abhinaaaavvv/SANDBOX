/**
 * Channel naming conventions for SANDBOX Realtime.
 *
 * Two channel scopes:
 *
 * 1. Run-scoped: "run:<run_id>"
 *    - Round state changes
 *    - Market state changes
 *    - Price changes
 *    - Leaderboard changes
 *    - Visible to ALL authenticated participants in the run
 *
 * 2. Team-scoped: "team:<team_id>"
 *    - Portfolio changes (trades, dividends, cash adjustments)
 *    - Visible ONLY to the specific team
 */

/**
 * Build a run-scoped channel name.
 * Events on this channel are visible to all participants in the run.
 */
export function runChannel(runId: string): string {
  return `run:${runId}`;
}

/**
 * Build a team-scoped channel name.
 * Events on this channel are visible only to the specific team.
 */
export function teamChannel(teamId: string): string {
  return `team:${teamId}`;
}

/**
 * Extract the channel type from a channel name.
 */
export function channelType(channel: string): "run" | "team" | null {
  if (channel.startsWith("run:")) return "run";
  if (channel.startsWith("team:")) return "team";
  return null;
}

/**
 * Extract the identifier from a channel name.
 */
export function channelId(channel: string): string | null {
  const parts = channel.split(":");
  return parts.length >= 2 ? parts[1] : null;
}
