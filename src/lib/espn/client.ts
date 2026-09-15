/**
 * Thin client for ESPN's unofficial Fantasy Football v3 API.
 *
 * Private leagues authenticate with two cookies copied from a logged-in
 * browser session: `espn_s2` and `SWID`. They are read from environment
 * variables (case-insensitive lookups so `espn_s2` / `ESPN_S2` both work).
 */

const BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

export class EspnError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "EspnError";
    this.status = status;
  }
}

function env(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  // case-insensitive sweep as a last resort
  const lower = names.map((n) => n.toLowerCase());
  for (const [k, v] of Object.entries(process.env)) {
    if (lower.includes(k.toLowerCase()) && v && v.trim()) return v.trim();
  }
  return undefined;
}

export type EspnCredentials = {
  leagueId: string | null;
  espnS2: string | null;
  swid: string | null;
  seasonOverride: number | null;
};

export function getCredentials(): EspnCredentials {
  const leagueId = env("ESPN_LEAGUE_ID", "LEAGUE_ID", "espn_league_id", "league_id", "ESPN_LEAGUEID") ?? null;
  const espnS2 = env("ESPN_S2", "espn_s2") ?? null;
  let swid = env("SWID", "swid", "ESPN_SWID") ?? null;
  if (swid && !swid.startsWith("{")) swid = `{${swid.replace(/[{}]/g, "")}}`;
  const seasonRaw = env("ESPN_SEASON", "SEASON", "espn_season");
  const seasonOverride = seasonRaw && /^\d{4}$/.test(seasonRaw) ? Number(seasonRaw) : null;
  return { leagueId, espnS2, swid, seasonOverride };
}

export function isEspnConfigured(): boolean {
  return Boolean(getCredentials().leagueId);
}

function buildHeaders(filter?: object): HeadersInit {
  const { espnS2, swid } = getCredentials();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  };
  const cookies: string[] = [];
  if (espnS2) cookies.push(`espn_s2=${espnS2}`);
  if (swid) cookies.push(`SWID=${swid}`);
  if (cookies.length) headers.Cookie = cookies.join("; ");
  if (filter) headers["x-fantasy-filter"] = JSON.stringify(filter);
  return headers;
}

async function espnGet<T>(url: string, filter?: object): Promise<T> {
  const res = await fetch(url, {
    headers: buildHeaders(filter),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { messages?: string[]; message?: string };
      detail = body.messages?.join("; ") ?? body.message ?? "";
    } catch {
      /* ignore */
    }
    const hint =
      res.status === 401
        ? "Unauthorized — check ESPN_S2 and SWID cookies"
        : res.status === 404
          ? "League/season not found — check the league ID and season"
          : `ESPN responded with ${res.status}`;
    throw new EspnError(res.status, detail ? `${hint} (${detail})` : hint);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Raw response shapes (only the fields we touch)
// ---------------------------------------------------------------------------

export type RawStat = {
  scoringPeriodId: number;
  statSourceId: number; // 0 = actual, 1 = projected
  statSplitTypeId: number; // 1 = weekly, 0 = season
  appliedTotal?: number;
  proTeamId?: number;
};

export type RawPlayer = {
  id: number;
  fullName: string;
  defaultPositionId: number;
  proTeamId: number;
  injuryStatus?: string;
  injured?: boolean;
  stats?: RawStat[];
};

export type RawRosterEntry = {
  lineupSlotId: number;
  playerId: number;
  playerPoolEntry?: { player: RawPlayer; appliedStatTotal?: number };
};

export type RawMatchupSide = {
  teamId: number;
  totalPoints?: number;
  totalPointsLive?: number;
  totalProjectedPointsLive?: number;
  pointsByScoringPeriod?: Record<string, number>;
  rosterForCurrentScoringPeriod?: { entries: RawRosterEntry[]; appliedStatTotal?: number };
  rosterForMatchupPeriod?: { entries: RawRosterEntry[] };
};

export type RawMatchup = {
  id: number;
  matchupPeriodId: number;
  playoffTierType?: string;
  winner?: "HOME" | "AWAY" | "TIE" | "UNDECIDED";
  home?: RawMatchupSide;
  away?: RawMatchupSide;
};

export type RawTeam = {
  id: number;
  abbrev?: string;
  name?: string;
  location?: string;
  nickname?: string;
  logo?: string;
  divisionId?: number;
  owners?: string[];
  primaryOwner?: string;
  playoffSeed?: number;
  record?: {
    overall?: {
      wins?: number;
      losses?: number;
      ties?: number;
      pointsFor?: number;
      pointsAgainst?: number;
      streakLength?: number;
      streakType?: "WIN" | "LOSS" | "TIE" | "NONE";
    };
  };
};

export type RawMember = { id: string; displayName?: string; firstName?: string; lastName?: string };

export type RawLeague = {
  id: number;
  seasonId: number;
  scoringPeriodId: number;
  members?: RawMember[];
  settings?: {
    name?: string;
    size?: number;
    scheduleSettings?: {
      matchupPeriodCount?: number;
      matchupPeriods?: Record<string, number[]>;
      playoffTeamCount?: number;
      playoffMatchupPeriodLength?: number;
    };
    scoringSettings?: { scoringType?: string };
  };
  status?: {
    currentMatchupPeriod?: number;
    latestScoringPeriod?: number;
    finalScoringPeriod?: number;
    firstScoringPeriod?: number;
    isActive?: boolean;
  };
  teams?: RawTeam[];
  schedule?: RawMatchup[];
};

export type RawProGame = {
  id: number;
  date: number;
  homeProTeamId: number;
  awayProTeamId: number;
  scoringPeriodId: number;
  statsOfficial?: boolean;
};

export type RawProSchedule = {
  settings?: {
    proTeams?: Array<{
      id: number;
      abbrev?: string;
      byeWeek?: number;
      proGamesByScoringPeriod?: Record<string, RawProGame[]>;
    }>;
  };
};

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

function leagueUrl(season: number, leagueId: string, params: Record<string, string | string[]>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.append(k, v);
  }
  return `${BASE}/seasons/${season}/segments/0/leagues/${leagueId}?${qs.toString()}`;
}

/** Teams, members, settings, status and the full season schedule with final totals. */
export async function fetchLeagueBase(season: number, leagueId: string): Promise<RawLeague> {
  return espnGet<RawLeague>(
    leagueUrl(season, leagueId, { view: ["mTeam", "mSettings", "mStatus", "mMatchupScore"] }),
  );
}

/** Box scores (starters + projections + live totals) for one scoring period. */
export async function fetchWeekBoxscores(
  season: number,
  leagueId: string,
  scoringPeriodId: number,
  matchupPeriodId: number,
): Promise<RawLeague> {
  return espnGet<RawLeague>(
    leagueUrl(season, leagueId, {
      view: ["mMatchupScore", "mScoreboard"],
      scoringPeriodId: String(scoringPeriodId),
    }),
    { schedule: { filterMatchupPeriodIds: { value: [matchupPeriodId] } } },
  );
}

/** NFL schedule (kickoff times per pro team per scoring period) — drives live variance. */
export async function fetchProSchedule(season: number): Promise<RawProSchedule> {
  return espnGet<RawProSchedule>(`${BASE}/seasons/${season}?view=proTeamSchedules_wl`);
}
