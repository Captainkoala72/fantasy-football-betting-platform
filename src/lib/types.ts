export type DataMode = "espn" | "demo";

export type LeagueTeam = {
  id: number;
  abbrev: string;
  name: string;
  logo: string | null;
  owner: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  playoffSeed: number;
  streakType: "WIN" | "LOSS" | "TIE" | "NONE";
  streakLength: number;
  divisionId: number;
};

export type StarterStatus = "pre" | "live" | "final" | "bye";

export type Starter = {
  name: string;
  position: string;
  slot: string;
  proTeam: string;
  projected: number;
  actual: number;
  status: StarterStatus;
  injuryStatus: string | null;
  /** Remaining standard deviation for this player (0 once his game is final). */
  sigma: number;
};

export type MatchupSide = {
  teamId: number;
  /** Points scored so far this matchup (0 pre-game). */
  points: number;
  /** Pre-game projection (sum of starters' ESPN projections). */
  projected: number;
  /** Live-adjusted projection: actual points banked + remaining projection. */
  liveProjected: number;
  /** Remaining standard deviation of the team's final score. */
  sigma: number;
  /** Full pre-game sigma (for reference in the UI). */
  pregameSigma: number;
  startersDone: number;
  startersTotal: number;
  starters: Starter[];
};

export type MatchupState = "upcoming" | "live" | "final";

export type Matchup = {
  id: number;
  season: number;
  week: number;
  home: MatchupSide;
  away: MatchupSide;
  winner: "HOME" | "AWAY" | "TIE" | "UNDECIDED";
  playoffTier: string;
  state: MatchupState;
};

export type MarketKey = "moneyline" | "spread" | "total" | "team_total";
export type Selection = "home" | "away" | "over" | "under";

export type Price = {
  market: MarketKey;
  selection: Selection;
  /** Team the price references (null for game totals). */
  teamId: number | null;
  line: number | null;
  american: number;
  decimal: number;
  /** Vigged implied probability. */
  impliedProb: number;
  /** Model (fair) probability before hold. */
  fairProb: number;
  label: string;
};

export type MatchupOdds = {
  spread: [Price, Price];
  total: [Price, Price];
  moneyline: [Price, Price];
  teamTotals: { home: [Price, Price]; away: [Price, Price] };
  homeWinProb: number;
  expectedMargin: number;
  expectedTotal: number;
  marginSigma: number;
  totalSigma: number;
  hold: number;
};

export type PricedMatchup = Matchup & {
  odds: MatchupOdds | null;
  bettable: boolean;
  lockReason: string | null;
};

export type LeagueMeta = {
  id: string;
  name: string;
  season: number;
  currentWeek: number;
  currentScoringPeriod: number;
  regularSeasonWeeks: number;
  totalWeeks: number;
  teamCount: number;
  scoringType: string;
  playoffTeamCount: number;
  seasonComplete: boolean;
};

export type WeekSummary = {
  week: number;
  label: string;
  state: MatchupState | "pending";
  isPlayoff: boolean;
};

export type LinesPayload = {
  mode: DataMode;
  league: LeagueMeta;
  week: number;
  weekState: MatchupState | "pending";
  weeks: WeekSummary[];
  matchups: PricedMatchup[];
  teams: LeagueTeam[];
  generatedAt: string;
  warning: string | null;
};

/** Selection the client sends when placing a bet. */
export type BetSelectionInput = {
  matchupId: number;
  week: number;
  market: MarketKey;
  selection: Selection;
  teamId: number | null;
  line: number | null;
  american: number;
};

export type PlaceBetInput = {
  kind: "single" | "parlay";
  stakeCents: number;
  selections: BetSelectionInput[];
};
