import { cachedFetch } from "@/lib/cache";
import { playerSigma, teamSigmaFallback } from "@/lib/odds/pricing";
import type { LeagueMeta, LeagueTeam, Matchup, MatchupSide, Starter, StarterStatus } from "@/lib/types";
import {
  fetchLeagueBase,
  fetchProSchedule,
  fetchWeekBoxscores,
  getCredentials,
  type RawLeague,
  type RawMatchup,
  type RawMatchupSide,
  type RawProGame,
  type RawRosterEntry,
  type RawTeam,
} from "./client";
import { NON_SCORING_SLOTS, POSITION_MAP, PRO_TEAM_MAP, SLOT_MAP, SLOT_ORDER } from "./constants";

export type ScheduleResult = {
  id: number;
  week: number;
  homeTeamId: number;
  awayTeamId: number | null;
  homeScore: number;
  awayScore: number;
  winner: "HOME" | "AWAY" | "TIE" | "UNDECIDED";
  playoffTier: string;
};

export type LeagueSnapshot = {
  source: "espn" | "demo";
  meta: LeagueMeta;
  teams: LeagueTeam[];
  results: ScheduleResult[];
  matchupPeriods: Record<number, number[]>;
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

const GAME_LENGTH_MS = 3.4 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Season resolution
// ---------------------------------------------------------------------------

function candidateSeasons(override: number | null): number[] {
  if (override) return [override];
  const y = new Date().getFullYear();
  return [y, y - 1];
}

async function loadBase(leagueId: string, season: number) {
  return cachedFetch(`espn:base:${leagueId}:${season}`, 60_000, () => fetchLeagueBase(season, leagueId));
}

export async function getEspnSnapshot(): Promise<LeagueSnapshot> {
  const { leagueId, seasonOverride } = getCredentials();
  if (!leagueId) throw new Error("ESPN_LEAGUE_ID is not configured");

  let lastError: unknown = null;
  for (const season of candidateSeasons(seasonOverride)) {
    try {
      const res = await loadBase(leagueId, season);
      const raw = res.value;
      const hasTeams = (raw.teams?.length ?? 0) > 1;
      const hasSchedule = (raw.schedule?.length ?? 0) > 0;
      if (hasTeams && hasSchedule) {
        return parseSnapshot(raw, season, res.fetchedAt, res.stale, res.error);
      }
      lastError = new Error(`Season ${season} has no schedule yet`);
    } catch (err) {
      lastError = err;
      // 401 means creds are wrong — no point trying other seasons
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to load league from ESPN");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function teamName(t: RawTeam): string {
  if (t.name && t.name.trim()) return t.name.trim();
  const combined = `${t.location ?? ""} ${t.nickname ?? ""}`.trim();
  return combined || `Team ${t.id}`;
}

function parseSnapshot(raw: RawLeague, season: number, fetchedAt: number, stale: boolean, error: string | null): LeagueSnapshot {
  const members = new Map<string, string>();
  for (const m of raw.members ?? []) {
    const full = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim();
    members.set(m.id, full || m.displayName || "Unknown");
  }

  const teams: LeagueTeam[] = (raw.teams ?? []).map((t) => {
    const rec = t.record?.overall ?? {};
    const ownerId = t.primaryOwner ?? t.owners?.[0];
    return {
      id: t.id,
      abbrev: (t.abbrev ?? teamName(t).slice(0, 4)).toUpperCase(),
      name: teamName(t),
      logo: t.logo && /^https?:\/\//.test(t.logo) ? t.logo : null,
      owner: ownerId ? (members.get(ownerId) ?? "Unknown") : "Unknown",
      wins: rec.wins ?? 0,
      losses: rec.losses ?? 0,
      ties: rec.ties ?? 0,
      pointsFor: round2(rec.pointsFor ?? 0),
      pointsAgainst: round2(rec.pointsAgainst ?? 0),
      playoffSeed: t.playoffSeed ?? 0,
      streakType: rec.streakType ?? "NONE",
      streakLength: rec.streakLength ?? 0,
      divisionId: t.divisionId ?? 0,
    };
  });

  const results: ScheduleResult[] = (raw.schedule ?? [])
    .filter((m) => m.home)
    .map((m) => ({
      id: m.id,
      week: m.matchupPeriodId,
      homeTeamId: m.home!.teamId,
      awayTeamId: m.away?.teamId ?? null,
      homeScore: round2(m.home!.totalPoints ?? 0),
      awayScore: round2(m.away?.totalPoints ?? 0),
      winner: m.winner ?? "UNDECIDED",
      playoffTier: m.playoffTierType ?? "NONE",
    }));

  const rawPeriods = raw.settings?.scheduleSettings?.matchupPeriods ?? {};
  const matchupPeriods: Record<number, number[]> = {};
  for (const [k, v] of Object.entries(rawPeriods)) matchupPeriods[Number(k)] = v;
  const totalWeeks = Math.max(
    Object.keys(matchupPeriods).length,
    ...results.map((r) => r.week),
    raw.settings?.scheduleSettings?.matchupPeriodCount ?? 0,
  );
  const regularSeasonWeeks = raw.settings?.scheduleSettings?.matchupPeriodCount ?? totalWeeks;
  const currentWeek = raw.status?.currentMatchupPeriod ?? 1;
  const currentScoringPeriod = raw.scoringPeriodId ?? raw.status?.latestScoringPeriod ?? 1;
  const finalScoringPeriod = raw.status?.finalScoringPeriod ?? 17;
  const seasonComplete =
    currentScoringPeriod > finalScoringPeriod || results.every((r) => r.winner !== "UNDECIDED");

  const meta: LeagueMeta = {
    id: String(raw.id),
    name: raw.settings?.name?.trim() || `League ${raw.id}`,
    season,
    currentWeek: Math.min(currentWeek, totalWeeks || currentWeek),
    currentScoringPeriod,
    regularSeasonWeeks,
    totalWeeks: totalWeeks || regularSeasonWeeks,
    teamCount: teams.length,
    scoringType: raw.settings?.scoringSettings?.scoringType ?? "H2H_POINTS",
    playoffTeamCount: raw.settings?.scheduleSettings?.playoffTeamCount ?? 0,
    seasonComplete,
  };

  return { source: "espn", meta, teams, results, matchupPeriods, fetchedAt, stale, error };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Pro schedule (kickoff times) → per-player game status
// ---------------------------------------------------------------------------

type ProGameIndex = Map<number, Map<number, RawProGame>>; // proTeamId → scoringPeriod → game

async function getProGameIndex(season: number): Promise<ProGameIndex | null> {
  try {
    const res = await cachedFetch(`espn:pro:${season}`, 12 * 60 * 60 * 1000, () => fetchProSchedule(season));
    const idx: ProGameIndex = new Map();
    for (const team of res.value.settings?.proTeams ?? []) {
      const byWeek = new Map<number, RawProGame>();
      for (const [sp, games] of Object.entries(team.proGamesByScoringPeriod ?? {})) {
        if (games[0]) byWeek.set(Number(sp), games[0]);
      }
      idx.set(team.id, byWeek);
    }
    return idx;
  } catch {
    return null;
  }
}

function gameStatus(
  game: RawProGame | undefined,
  hasIndex: boolean,
  actual: number,
  now: number,
): { status: StarterStatus; remaining: number } {
  if (!hasIndex) {
    // No kickoff data: infer from whether points have posted.
    return actual !== 0 ? { status: "final", remaining: 0 } : { status: "pre", remaining: 1 };
  }
  if (!game) return { status: "bye", remaining: 0 };
  if (game.statsOfficial) return { status: "final", remaining: 0 };
  const start = game.date;
  if (now < start) return { status: "pre", remaining: 1 };
  const elapsed = now - start;
  if (elapsed >= GAME_LENGTH_MS) return { status: "final", remaining: 0 };
  return { status: "live", remaining: Math.max(0.08, 1 - elapsed / GAME_LENGTH_MS) };
}

// ---------------------------------------------------------------------------
// Week matchups (box scores)
// ---------------------------------------------------------------------------

function buildSide(
  raw: RawMatchupSide,
  scoringPeriod: number,
  index: ProGameIndex | null,
  now: number,
  matchupFinal: boolean,
): MatchupSide {
  const entries: RawRosterEntry[] =
    raw.rosterForCurrentScoringPeriod?.entries ?? raw.rosterForMatchupPeriod?.entries ?? [];

  const starters: Starter[] = [];
  for (const e of entries) {
    if (NON_SCORING_SLOTS.has(e.lineupSlotId)) continue;
    const p = e.playerPoolEntry?.player;
    if (!p) continue;
    const stats = p.stats ?? [];
    const proj =
      stats.find((s) => s.scoringPeriodId === scoringPeriod && s.statSourceId === 1 && s.statSplitTypeId === 1)
        ?.appliedTotal ??
      stats.find((s) => s.scoringPeriodId === scoringPeriod && s.statSourceId === 1)?.appliedTotal ??
      0;
    const actualStat = stats.find((s) => s.scoringPeriodId === scoringPeriod && s.statSourceId === 0);
    const actual = actualStat?.appliedTotal ?? 0;
    const position = POSITION_MAP[p.defaultPositionId] ?? "FLEX";
    const slot = SLOT_MAP[e.lineupSlotId] ?? "FLEX";
    const game = index?.get(p.proTeamId)?.get(scoringPeriod);
    let { status, remaining } = gameStatus(game, index !== null, actual, now);
    if (matchupFinal) {
      status = status === "bye" ? "bye" : "final";
      remaining = 0;
    }
    const base = playerSigma(position, proj);
    const sigma = status === "final" || status === "bye" ? 0 : base * Math.sqrt(remaining);
    starters.push({
      name: p.fullName,
      position,
      slot,
      proTeam: PRO_TEAM_MAP[p.proTeamId] ?? "FA",
      projected: round2(proj),
      actual: round2(actual),
      status,
      injuryStatus: p.injuryStatus && p.injuryStatus !== "ACTIVE" ? p.injuryStatus : null,
      sigma,
    });
  }
  starters.sort((a, b) => (SLOT_ORDER[a.slot] ?? 9) - (SLOT_ORDER[b.slot] ?? 9) || b.projected - a.projected);

  const projected = round2(starters.reduce((s, p) => s + p.projected, 0));
  const banked = raw.totalPointsLive ?? raw.totalPoints ?? starters.reduce((s, p) => s + p.actual, 0);
  const points = round2(banked);
  const startersDone = starters.filter((s) => s.status === "final" || s.status === "bye").length;
  const anyStarted = starters.some((s) => s.status !== "pre");

  // Live projection: banked points for finished players + remaining expectation.
  let liveProjected: number;
  if (matchupFinal) {
    liveProjected = points;
  } else if (typeof raw.totalProjectedPointsLive === "number" && raw.totalProjectedPointsLive > 0 && anyStarted) {
    liveProjected = raw.totalProjectedPointsLive;
  } else if (anyStarted) {
    liveProjected = starters.reduce((s, p) => {
      if (p.status === "final" || p.status === "bye") return s + p.actual;
      if (p.status === "live") {
        const rem = p.sigma > 0 ? Math.pow(p.sigma / Math.max(playerSigma(p.position, p.projected), 1e-6), 2) : 0;
        return s + p.actual + p.projected * rem;
      }
      return s + p.projected;
    }, 0);
  } else {
    liveProjected = projected;
  }

  const pregameSigma =
    starters.length > 0
      ? Math.sqrt(starters.reduce((s, p) => s + Math.pow(playerSigma(p.position, p.projected), 2), 0))
      : teamSigmaFallback(projected);
  let sigma = starters.length > 0 ? Math.sqrt(starters.reduce((s, p) => s + p.sigma * p.sigma, 0)) : pregameSigma;
  if (matchupFinal) sigma = 0;

  return {
    teamId: raw.teamId,
    points,
    projected,
    liveProjected: round2(liveProjected),
    sigma,
    pregameSigma,
    startersDone,
    startersTotal: starters.length,
    starters,
  };
}

export async function getEspnWeekMatchups(snapshot: LeagueSnapshot, week: number): Promise<Matchup[]> {
  const { leagueId } = getCredentials();
  if (!leagueId) return [];
  const season = snapshot.meta.season;
  const periods = snapshot.matchupPeriods[week] ?? [week];
  // For multi-week matchups (playoffs), price against the latest active scoring period.
  const scoringPeriod =
    periods.find((sp) => sp >= snapshot.meta.currentScoringPeriod) ?? periods[periods.length - 1] ?? week;

  const isPast = week < snapshot.meta.currentWeek;
  const isCurrent = week === snapshot.meta.currentWeek;
  const ttl = isPast ? 6 * 60 * 60 * 1000 : isCurrent ? 45_000 : 10 * 60 * 1000;

  const [box, index] = await Promise.all([
    cachedFetch(`espn:box:${leagueId}:${season}:${week}:${scoringPeriod}`, ttl, () =>
      fetchWeekBoxscores(season, leagueId, scoringPeriod, week),
    ),
    getProGameIndex(season),
  ]);

  const now = Date.now();
  const resultsById = new Map(snapshot.results.map((r) => [r.id, r]));
  const out: Matchup[] = [];
  for (const m of (box.value.schedule ?? []) as RawMatchup[]) {
    if (m.matchupPeriodId !== week || !m.home || !m.away) continue; // skip byes
    const seasonResult = resultsById.get(m.id);
    const winner = seasonResult?.winner ?? m.winner ?? "UNDECIDED";
    const matchupFinal = winner !== "UNDECIDED" || (isPast && !isCurrent);
    const home = buildSide(m.home, scoringPeriod, index, now, matchupFinal);
    const away = buildSide(m.away, scoringPeriod, index, now, matchupFinal);
    if (matchupFinal && seasonResult) {
      // Season schedule totals are authoritative for multi-week matchups.
      home.points = seasonResult.homeScore;
      away.points = seasonResult.awayScore;
      home.liveProjected = home.points;
      away.liveProjected = away.points;
    }
    const anyStarted = [...home.starters, ...away.starters].some((s) => s.status === "live" || s.status === "final");
    const state: Matchup["state"] = matchupFinal
      ? "final"
      : home.points > 0 || away.points > 0 || (anyStarted && isCurrent)
        ? "live"
        : "upcoming";
    out.push({
      id: m.id,
      season,
      week,
      home,
      away,
      winner: matchupFinal && winner === "UNDECIDED" ? (home.points > away.points ? "HOME" : home.points < away.points ? "AWAY" : "TIE") : winner,
      playoffTier: m.playoffTierType ?? seasonResult?.playoffTier ?? "NONE",
      state,
    });
  }
  return out;
}
