import { getDemoSnapshot, getDemoWeekMatchups } from "@/lib/demo/league";
import { isEspnConfigured } from "@/lib/espn/client";
import { getEspnSnapshot, getEspnWeekMatchups, type LeagueSnapshot } from "@/lib/espn/league";
import { priceMatchup } from "@/lib/odds/pricing";
import type { LinesPayload, Matchup, PricedMatchup, WeekSummary } from "@/lib/types";

export type SnapshotResult = { snapshot: LeagueSnapshot; warning: string | null };

/** Load the league snapshot from ESPN, falling back to the demo league with a warning. */
export async function getSnapshot(): Promise<SnapshotResult> {
  if (isEspnConfigured()) {
    try {
      const snapshot = await getEspnSnapshot();
      const warning = snapshot.stale
        ? `ESPN is not responding (${snapshot.error ?? "unknown error"}). Showing the last good data from ${new Date(snapshot.fetchedAt).toLocaleTimeString()}.`
        : null;
      return { snapshot, warning };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const snapshot = await getDemoSnapshot();
      return {
        snapshot,
        warning: `Could not load your ESPN league: ${message}. Showing the demo league until the connection is fixed.`,
      };
    }
  }
  const snapshot = await getDemoSnapshot();
  return { snapshot, warning: null };
}

/** Load a snapshot for a specific source (used by settlement so old bets settle against the right data). */
export async function getSnapshotForSource(source: "espn" | "demo"): Promise<LeagueSnapshot | null> {
  if (source === "demo") return getDemoSnapshot();
  if (!isEspnConfigured()) return null;
  try {
    return await getEspnSnapshot();
  } catch {
    return null;
  }
}

export async function getWeekMatchups(snapshot: LeagueSnapshot, week: number): Promise<Matchup[]> {
  if (snapshot.source === "demo") return getDemoWeekMatchups(snapshot, week);
  return getEspnWeekMatchups(snapshot, week);
}

export function priceWeek(snapshot: LeagueSnapshot, matchups: Matchup[]): PricedMatchup[] {
  const nameOf = new Map(snapshot.teams.map((t) => [t.id, t.name]));
  const current = snapshot.meta.currentWeek;
  return matchups.map((m) => {
    const hasProjections = m.home.projected > 0 && m.away.projected > 0;
    const names = { home: nameOf.get(m.home.teamId) ?? `Team ${m.home.teamId}`, away: nameOf.get(m.away.teamId) ?? `Team ${m.away.teamId}` };
    const odds = hasProjections && m.state !== "final" ? priceMatchup(m, names) : null;

    let lockReason: string | null = null;
    if (m.state === "final") lockReason = "Final";
    else if (!hasProjections) lockReason = "Lines pending — ESPN hasn't published projections yet";
    else if (m.week < current) lockReason = "Closed";
    else if (odds && odds.marginSigma < 1.5) lockReason = "Closed — awaiting final scoring";

    return { ...m, odds, bettable: lockReason === null && odds !== null, lockReason };
  });
}

function weekLabel(week: number, snapshot: LeagueSnapshot): string {
  const reg = snapshot.meta.regularSeasonWeeks;
  if (week <= reg) return `Week ${week}`;
  const round = week - reg;
  const totalRounds = snapshot.meta.totalWeeks - reg;
  if (round === totalRounds) return "Championship";
  if (round === totalRounds - 1) return "Semifinals";
  return `Playoffs R${round}`;
}

export function summarizeWeeks(snapshot: LeagueSnapshot): WeekSummary[] {
  const { totalWeeks, currentWeek, regularSeasonWeeks, seasonComplete } = snapshot.meta;
  const out: WeekSummary[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const results = snapshot.results.filter((r) => r.week === w && r.awayTeamId !== null);
    let state: WeekSummary["state"];
    if (results.length > 0 && results.every((r) => r.winner !== "UNDECIDED")) state = "final";
    else if (w < currentWeek || seasonComplete) state = "final";
    else if (w === currentWeek) state = results.some((r) => r.homeScore > 0 || r.awayScore > 0) ? "live" : "upcoming";
    else if (w === currentWeek + 1) state = "upcoming";
    else state = "pending";
    out.push({ week: w, label: weekLabel(w, snapshot), state, isPlayoff: w > regularSeasonWeeks });
  }
  return out;
}

export async function getLines(weekParam?: number | null): Promise<LinesPayload> {
  const { snapshot, warning } = await getSnapshot();
  const { meta } = snapshot;
  const week = Math.min(Math.max(1, weekParam ?? meta.currentWeek), Math.max(1, meta.totalWeeks));
  const matchups = await getWeekMatchups(snapshot, week);
  const priced = priceWeek(snapshot, matchups);
  const weeks = summarizeWeeks(snapshot);

  let weekState: LinesPayload["weekState"] = weeks.find((w) => w.week === week)?.state ?? "pending";
  if (priced.length > 0) {
    if (priced.every((m) => m.state === "final")) weekState = "final";
    else if (priced.some((m) => m.state === "live")) weekState = "live";
    else if (priced.some((m) => m.bettable)) weekState = "upcoming";
    else if (priced.every((m) => !m.odds)) weekState = "pending";
  } else if (week > meta.currentWeek) {
    weekState = "pending";
  }

  const weeksSynced = weeks.map((w) => (w.week === week ? { ...w, state: weekState } : w));

  // Sort: live first, then upcoming, then finals
  const order: Record<string, number> = { live: 0, upcoming: 1, final: 2 };
  priced.sort((a, b) => order[a.state] - order[b.state] || a.id - b.id);

  return {
    mode: snapshot.source,
    league: meta,
    week,
    weekState,
    weeks: weeksSynced,
    matchups: priced,
    teams: [...snapshot.teams].sort((a, b) => a.playoffSeed - b.playoffSeed || b.wins - a.wins || b.pointsFor - a.pointsFor),
    generatedAt: new Date().toISOString(),
    warning,
  };
}
