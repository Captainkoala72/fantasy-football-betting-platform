import { db } from "@/db";
import { appState } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { LeagueSnapshot, ScheduleResult } from "@/lib/espn/league";
import { playerSigma } from "@/lib/odds/pricing";
import type { LeagueTeam, Matchup, MatchupSide, Starter } from "@/lib/types";

/**
 * Demo league: a fully deterministic 12-team league used when ESPN credentials
 * are not configured (or ESPN is unreachable). Every number is derived from a
 * seed so results are stable across requests and server restarts.
 */

export const DEMO_REGULAR_SEASON_WEEKS = 14;
const DEMO_STATE_KEY = "demo";

type DemoState = { week: number; epoch: number };

const TEAMS: Array<{ name: string; abbrev: string; owner: string; strength: number }> = [
  { name: "Mahomes Alone", abbrev: "MAHO", owner: "Tyler Brooks", strength: 128 },
  { name: "Kittle Corn", abbrev: "KITT", owner: "Jess Alvarez", strength: 121 },
  { name: "Zero Dark Purdy", abbrev: "ZDP", owner: "Marcus Lee", strength: 117 },
  { name: "Lamar You Doin'", abbrev: "LAMR", owner: "Priya Natarajan", strength: 124 },
  { name: "Hurts So Good", abbrev: "HURT", owner: "Danny O'Connell", strength: 114 },
  { name: "Bijan Mustard", abbrev: "BJN", owner: "Sam Whitfield", strength: 119 },
  { name: "Puka Shell Necklace", abbrev: "PUKA", owner: "Chris Tanaka", strength: 111 },
  { name: "The Gus Bus", abbrev: "GUS", owner: "Ally Freeman", strength: 106 },
  { name: "Kelce Grammer", abbrev: "KELC", owner: "Jordan Park", strength: 116 },
  { name: "Run CMC", abbrev: "CMC", owner: "Nate Rodriguez", strength: 122 },
  { name: "Baker's Dozen", abbrev: "BAKE", owner: "Morgan Ellis", strength: 109 },
  { name: "Chubb Rock", abbrev: "CHUB", owner: "Devin Carter", strength: 112 },
];

const QB = "Josh Allen|BUF,Lamar Jackson|BAL,Jalen Hurts|PHI,Patrick Mahomes|KC,Joe Burrow|CIN,Jayden Daniels|WSH,Jared Goff|DET,Baker Mayfield|TB,Bo Nix|DEN,Justin Herbert|LAC,C.J. Stroud|HOU,Brock Purdy|SF".split(",");
const RB = "Saquon Barkley|PHI,Bijan Robinson|ATL,Jahmyr Gibbs|DET,Derrick Henry|BAL,Christian McCaffrey|SF,Josh Jacobs|GB,De'Von Achane|MIA,Kyren Williams|LAR,James Cook|BUF,Bucky Irving|TB,Jonathan Taylor|IND,Chase Brown|CIN,Breece Hall|NYJ,Kenneth Walker III|SEA,Alvin Kamara|NO,Chuba Hubbard|CAR,Joe Mixon|HOU,David Montgomery|DET,Aaron Jones|MIN,James Conner|ARI,Omarion Hampton|LAC,Ashton Jeanty|LV,RJ Harvey|DEN,TreVeyon Henderson|NE,D'Andre Swift|CHI,Tony Pollard|TEN,Isiah Pacheco|KC,Rhamondre Stevenson|NE,Javonte Williams|DAL,Brian Robinson Jr.|SF,Travis Etienne Jr.|JAX,Tyrone Tracy Jr.|NYG,Jaylen Warren|PIT,Zach Charbonnet|SEA,Rachaad White|TB,Najee Harris|LAC".split(",");
const WR = "Ja'Marr Chase|CIN,Justin Jefferson|MIN,CeeDee Lamb|DAL,Puka Nacua|LAR,Amon-Ra St. Brown|DET,Malik Nabers|NYG,Nico Collins|HOU,Brian Thomas Jr.|JAX,Drake London|ATL,A.J. Brown|PHI,Ladd McConkey|LAC,Tee Higgins|CIN,Tyreek Hill|MIA,Mike Evans|TB,Davante Adams|LAR,Terry McLaurin|WSH,Garrett Wilson|NYJ,Marvin Harrison Jr.|ARI,Jaxon Smith-Njigba|SEA,DK Metcalf|PIT,DJ Moore|CHI,Zay Flowers|BAL,Jaylen Waddle|MIA,Courtland Sutton|DEN,George Pickens|DAL,Rashee Rice|KC,Xavier Worthy|KC,Tetairoa McMillan|CAR,Jameson Williams|DET,Chris Olave|NO,Jerry Jeudy|CLE,Rome Odunze|CHI,Jakobi Meyers|LV,Calvin Ridley|TEN,Travis Hunter|JAX,DeVonta Smith|PHI".split(",");
const TE = "Brock Bowers|LV,Trey McBride|ARI,George Kittle|SF,Sam LaPorta|DET,Travis Kelce|KC,T.J. Hockenson|MIN,Mark Andrews|BAL,David Njoku|CLE,Evan Engram|DEN,Tucker Kraft|GB,Jake Ferguson|DAL,Dalton Kincaid|BUF".split(",");
const K = "Brandon Aubrey|DAL,Cameron Dicker|LAC,Chris Boswell|PIT,Jake Bates|DET,Ka'imi Fairbairn|HOU,Harrison Butker|KC,Tyler Bass|BUF,Jason Sanders|MIA,Wil Lutz|DEN,Chase McLaughlin|TB,Jake Elliott|PHI,Justin Tucker|BAL".split(",");
const DST = "Eagles D/ST|PHI,Ravens D/ST|BAL,Broncos D/ST|DEN,Steelers D/ST|PIT,Texans D/ST|HOU,Vikings D/ST|MIN,Packers D/ST|GB,Lions D/ST|DET,Chiefs D/ST|KC,Bills D/ST|BUF,Seahawks D/ST|SEA,Chargers D/ST|LAC".split(",");

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

function hash(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(r: () => number): number {
  const u = Math.max(r(), 1e-12);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export async function getDemoState(): Promise<DemoState> {
  try {
    const rows = await db.select().from(appState).where(eq(appState.key, DEMO_STATE_KEY)).limit(1);
    const v = rows[0]?.value as Partial<DemoState> | undefined;
    if (v && typeof v.week === "number" && typeof v.epoch === "number") return { week: v.week, epoch: v.epoch };
  } catch {
    /* fall through */
  }
  return { week: 9, epoch: 1 };
}

export async function advanceDemoWeek(): Promise<DemoState> {
  const cur = await getDemoState();
  const next: DemoState =
    cur.week >= DEMO_REGULAR_SEASON_WEEKS ? { week: 1, epoch: cur.epoch + 1 } : { week: cur.week + 1, epoch: cur.epoch };
  await db
    .insert(appState)
    .values({ key: DEMO_STATE_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appState.key, set: { value: next, updatedAt: new Date() } });
  return next;
}

export function demoSeason(): number {
  const d = new Date();
  return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

// ---------------------------------------------------------------------------
// Schedule + scoring model
// ---------------------------------------------------------------------------

/** Round-robin pairings: returns [homeIdx, awayIdx][] for a week (12 teams → 6 games). */
function pairings(week: number): Array<[number, number]> {
  const n = TEAMS.length;
  const idx = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const rot = (week - 1) % (n - 1);
  const rotated = [...idx.slice(rot), ...idx.slice(0, rot)];
  const order = [0, ...rotated];
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n / 2; i++) {
    const a = order[i];
    const b = order[n - 1 - i];
    out.push(week % 2 === 0 ? [a, b] : [b, a]);
  }
  return out;
}

function matchupId(week: number, gameIdx: number): number {
  return (week - 1) * 6 + gameIdx + 1;
}

type PlayerSeed = { name: string; proTeam: string; position: string; slot: string; base: number };

function rosterFor(teamIdx: number): PlayerSeed[] {
  const split = (s: string) => {
    const [name, proTeam] = s.split("|");
    return { name, proTeam };
  };
  const q = split(QB[teamIdx]);
  const r1 = split(RB[teamIdx * 2]);
  const r2 = split(RB[teamIdx * 2 + 1]);
  const w1 = split(WR[teamIdx * 2]);
  const w2 = split(WR[teamIdx * 2 + 1]);
  const t = split(TE[teamIdx]);
  const flexSrc = teamIdx % 2 === 0 ? RB[24 + teamIdx] : WR[24 + teamIdx];
  const f = split(flexSrc);
  const k = split(K[teamIdx]);
  const d = split(DST[teamIdx]);
  const strength = TEAMS[teamIdx].strength / 118; // scale roster quality to team strength
  return [
    { ...q, position: "QB", slot: "QB", base: (23 - teamIdx * 0.45) * strength },
    { ...r1, position: "RB", slot: "RB", base: (17.5 - teamIdx * 0.3) * strength },
    { ...r2, position: "RB", slot: "RB", base: (13.5 - teamIdx * 0.2) * strength },
    { ...w1, position: "WR", slot: "WR", base: (16.5 - teamIdx * 0.3) * strength },
    { ...w2, position: "WR", slot: "WR", base: (13 - teamIdx * 0.2) * strength },
    { ...t, position: "TE", slot: "TE", base: (11.5 - teamIdx * 0.45) * strength },
    { ...f, position: teamIdx % 2 === 0 ? "RB" : "WR", slot: "FLEX", base: (11 - teamIdx * 0.15) * strength },
    { ...k, position: "K", slot: "K", base: 8.5 - teamIdx * 0.1 },
    { ...d, position: "D/ST", slot: "D/ST", base: 7.5 - teamIdx * 0.15 },
  ];
}

type SimPlayer = Starter & { finalActual: number };

function simulateTeamWeek(teamIdx: number, week: number, epoch: number): { players: SimPlayer[]; projected: number; final: number } {
  const r = rng(`e${epoch}:t${teamIdx}:w${week}`);
  const players: SimPlayer[] = rosterFor(teamIdx).map((p) => {
    const proj = Math.max(1.5, p.base * (1 + (r() - 0.5) * 0.22));
    const sigma = playerSigma(p.position, proj);
    const actual = Math.max(0, proj + gaussian(r) * sigma * 0.95);
    return {
      name: p.name,
      position: p.position,
      slot: p.slot,
      proTeam: p.proTeam,
      projected: round2(proj),
      actual: 0,
      status: "pre",
      injuryStatus: r() < 0.06 ? "QUESTIONABLE" : null,
      sigma,
      finalActual: round2(actual),
    };
  });
  const projected = round2(players.reduce((s, p) => s + p.projected, 0));
  const final = round2(players.reduce((s, p) => s + p.finalActual, 0));
  return { players, projected, final };
}

function finalizeSide(teamId: number, sim: ReturnType<typeof simulateTeamWeek>): MatchupSide {
  const starters = sim.players.map((p) => ({ ...p, actual: p.finalActual, status: "final" as const, sigma: 0 }));
  return {
    teamId,
    points: sim.final,
    projected: sim.projected,
    liveProjected: sim.final,
    sigma: 0,
    pregameSigma: Math.sqrt(sim.players.reduce((s, p) => s + p.sigma * p.sigma, 0)),
    startersDone: starters.length,
    startersTotal: starters.length,
    starters: starters.map(stripSim),
  };
}

function stripSim(p: SimPlayer | Starter): Starter {
  const { name, position, slot, proTeam, projected, actual, status, injuryStatus, sigma } = p;
  return { name, position, slot, proTeam, projected, actual, status, injuryStatus, sigma };
}

function pregameSide(teamId: number, sim: ReturnType<typeof simulateTeamWeek>, liveIdx: number[] = []): MatchupSide {
  const starters: Starter[] = sim.players.map((p, i) =>
    liveIdx.includes(i)
      ? { ...stripSim(p), actual: p.finalActual, status: "final" as const, sigma: 0 }
      : stripSim(p),
  );
  const points = round2(starters.reduce((s, p) => s + p.actual, 0));
  const liveProjected = round2(starters.reduce((s, p) => s + (p.status === "final" ? p.actual : p.projected), 0));
  return {
    teamId,
    points,
    projected: sim.projected,
    liveProjected,
    sigma: Math.sqrt(starters.reduce((s, p) => s + p.sigma * p.sigma, 0)),
    pregameSigma: Math.sqrt(sim.players.reduce((s, p) => s + p.sigma * p.sigma, 0)),
    startersDone: starters.filter((s) => s.status === "final").length,
    startersTotal: starters.length,
    starters,
  };
}

// ---------------------------------------------------------------------------
// Public API (mirrors the ESPN layer)
// ---------------------------------------------------------------------------

export async function getDemoSnapshot(): Promise<LeagueSnapshot> {
  const state = await getDemoState();
  const season = demoSeason();
  const results: ScheduleResult[] = [];
  const records = TEAMS.map(() => ({ w: 0, l: 0, t: 0, pf: 0, pa: 0, streak: [] as Array<"W" | "L" | "T"> }));

  for (let week = 1; week <= DEMO_REGULAR_SEASON_WEEKS; week++) {
    pairings(week).forEach(([h, a], gi) => {
      const isFinal = week < state.week;
      const hs = isFinal ? simulateTeamWeek(h, week, state.epoch).final : 0;
      const as = isFinal ? simulateTeamWeek(a, week, state.epoch).final : 0;
      const winner: ScheduleResult["winner"] = !isFinal ? "UNDECIDED" : hs > as ? "HOME" : as > hs ? "AWAY" : "TIE";
      results.push({
        id: matchupId(week, gi),
        week,
        homeTeamId: h + 1,
        awayTeamId: a + 1,
        homeScore: hs,
        awayScore: as,
        winner,
        playoffTier: "NONE",
      });
      if (isFinal) {
        records[h].pf += hs;
        records[h].pa += as;
        records[a].pf += as;
        records[a].pa += hs;
        if (winner === "HOME") {
          records[h].w++;
          records[a].l++;
          records[h].streak.push("W");
          records[a].streak.push("L");
        } else if (winner === "AWAY") {
          records[a].w++;
          records[h].l++;
          records[a].streak.push("W");
          records[h].streak.push("L");
        } else {
          records[h].t++;
          records[a].t++;
          records[h].streak.push("T");
          records[a].streak.push("T");
        }
      }
    });
  }

  const seeds = TEAMS.map((_, i) => i).sort((x, y) => records[y].w - records[x].w || records[y].pf - records[x].pf);
  const teams: LeagueTeam[] = TEAMS.map((t, i) => {
    const rec = records[i];
    const last = rec.streak[rec.streak.length - 1];
    let streakLength = 0;
    for (let j = rec.streak.length - 1; j >= 0 && rec.streak[j] === last; j--) streakLength++;
    return {
      id: i + 1,
      abbrev: t.abbrev,
      name: t.name,
      logo: null,
      owner: t.owner,
      wins: rec.w,
      losses: rec.l,
      ties: rec.t,
      pointsFor: round2(rec.pf),
      pointsAgainst: round2(rec.pa),
      playoffSeed: seeds.indexOf(i) + 1,
      streakType: last === "W" ? "WIN" : last === "L" ? "LOSS" : last === "T" ? "TIE" : "NONE",
      streakLength,
      divisionId: i < 6 ? 0 : 1,
    };
  });

  const matchupPeriods: Record<number, number[]> = {};
  for (let w = 1; w <= DEMO_REGULAR_SEASON_WEEKS; w++) matchupPeriods[w] = [w];

  return {
    source: "demo",
    meta: {
      id: "demo",
      name: "The Sunday Scaries League",
      season,
      currentWeek: state.week,
      currentScoringPeriod: state.week,
      regularSeasonWeeks: DEMO_REGULAR_SEASON_WEEKS,
      totalWeeks: DEMO_REGULAR_SEASON_WEEKS,
      teamCount: TEAMS.length,
      scoringType: "H2H_POINTS",
      playoffTeamCount: 6,
      seasonComplete: false,
    },
    teams,
    results,
    matchupPeriods,
    fetchedAt: Date.now(),
    stale: false,
    error: null,
  };
}

export async function getDemoWeekMatchups(snapshot: LeagueSnapshot, week: number): Promise<Matchup[]> {
  if (week < 1 || week > DEMO_REGULAR_SEASON_WEEKS) return [];
  const state = await getDemoState();
  const current = snapshot.meta.currentWeek;
  // Projections only exist for the current week and the one after it, like ESPN.
  if (week > current + 1) return [];

  return pairings(week).map(([h, a], gi) => {
    const hs = simulateTeamWeek(h, week, state.epoch);
    const as = simulateTeamWeek(a, week, state.epoch);
    const isFinal = week < current;
    // In the current week, the first game's WR1s have already played (Thursday night).
    const isThursdayGame = week === current && gi === 0;
    const home = isFinal ? finalizeSide(h + 1, hs) : pregameSide(h + 1, hs, isThursdayGame ? [3] : []);
    const away = isFinal ? finalizeSide(a + 1, as) : pregameSide(a + 1, as, isThursdayGame ? [3] : []);
    const winner: Matchup["winner"] = !isFinal
      ? "UNDECIDED"
      : home.points > away.points
        ? "HOME"
        : away.points > home.points
          ? "AWAY"
          : "TIE";
    return {
      id: matchupId(week, gi),
      season: snapshot.meta.season,
      week,
      home,
      away,
      winner,
      playoffTier: "NONE",
      state: isFinal ? "final" : isThursdayGame ? "live" : "upcoming",
    };
  });
}
