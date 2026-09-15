import { getDb } from "@/db";
import { betLegs, bets, ledger, users, type UserRow } from "@/db/schema";
import { getSnapshot, getWeekMatchups, priceWeek } from "@/lib/lines";
import { americanToDecimal, decimalToAmerican, payoutCents } from "@/lib/odds/math";
import { findPrice, gradeSelection } from "@/lib/odds/pricing";
import type { PlaceBetInput, Price, PricedMatchup } from "@/lib/types";
import { getSnapshotForSource } from "@/lib/lines";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export const MIN_STAKE_CENTS = 100; // $1
export const MAX_STAKE_CENTS = 500_000; // $5,000
export const MAX_PAYOUT_CENTS = 25_000_000; // $250,000
export const MAX_PARLAY_LEGS = 10;

export class BetError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

type ValidatedLeg = {
  price: Price;
  matchup: PricedMatchup;
  week: number;
};

/**
 * Re-price each selection server-side. The client's odds are only a claim —
 * the book always writes the ticket at its own current number and rejects the
 * slip if anything moved, so the user can review before re-submitting.
 */
async function validateSelections(input: PlaceBetInput, source: "espn" | "demo", cache: Map<number, PricedMatchup[]>, snapshotTeams: Map<number, string>) {
  const { snapshot } = await getSnapshot();
  const legs: ValidatedLeg[] = [];
  const moved: Array<{ matchupId: number; market: string; selection: string; line: number | null; american: number }> = [];

  for (const sel of input.selections) {
    let weekMatchups = cache.get(sel.week);
    if (!weekMatchups) {
      const raw = await getWeekMatchups(snapshot, sel.week);
      weekMatchups = priceWeek(snapshot, raw);
      cache.set(sel.week, weekMatchups);
    }
    const matchup = weekMatchups.find((m) => m.id === sel.matchupId);
    if (!matchup) throw new BetError("not_found", "One of your selections no longer exists.");
    if (!matchup.bettable || !matchup.odds) {
      throw new BetError("locked", `${snapshotTeams.get(matchup.away.teamId) ?? "Away"} @ ${snapshotTeams.get(matchup.home.teamId) ?? "Home"} is closed for betting (${matchup.lockReason ?? "locked"}).`);
    }
    const price = findPrice(matchup.odds, sel.market, sel.selection, sel.teamId);
    if (!price) throw new BetError("not_found", "Selection unavailable.");
    const lineChanged = (price.line ?? null) !== (sel.line ?? null);
    const oddsChanged = price.american !== sel.american;
    if (lineChanged || oddsChanged) {
      moved.push({ matchupId: sel.matchupId, market: sel.market, selection: sel.selection, line: price.line, american: price.american });
    }
    legs.push({ price, matchup, week: sel.week });
  }
  if (moved.length) {
    throw new BetError("odds_changed", "Odds have changed since you built your slip. Review the new prices and place again.", { moved });
  }
  void source;
  return legs;
}

export type PlacedTicket = {
  betId: number;
  kind: "single" | "parlay";
  stakeCents: number;
  americanOdds: number;
  potentialPayoutCents: number;
  legs: string[];
};

export async function placeWagers(user: UserRow, wagers: PlaceBetInput[]): Promise<{ tickets: PlacedTicket[]; balanceCents: number }> {
  if (!Array.isArray(wagers) || wagers.length === 0) throw new BetError("invalid", "Your bet slip is empty.");
  if (wagers.length > 20) throw new BetError("invalid", "Too many wagers in one slip.");

  const { snapshot } = await getSnapshot();
  const source = snapshot.source;
  const season = snapshot.meta.season;
  const teamNames = new Map(snapshot.teams.map((t) => [t.id, t.name]));
  const weekCache = new Map<number, PricedMatchup[]>();

  // Validate everything before touching the ledger.
  const prepared: Array<{ wager: PlaceBetInput; legs: ValidatedLeg[]; decimal: number; american: number; payout: number }> = [];
  let totalStake = 0;
  for (const wager of wagers) {
    const stake = Math.round(Number(wager.stakeCents));
    if (!Number.isFinite(stake) || stake < MIN_STAKE_CENTS) throw new BetError("invalid", "Minimum wager is $1.00.");
    if (stake > MAX_STAKE_CENTS) throw new BetError("invalid", "Maximum wager is $5,000.00 per ticket.");
    if (wager.kind === "single" && wager.selections.length !== 1) throw new BetError("invalid", "A single needs exactly one selection.");
    if (wager.kind === "parlay") {
      if (wager.selections.length < 2) throw new BetError("invalid", "A parlay needs at least two selections.");
      if (wager.selections.length > MAX_PARLAY_LEGS) throw new BetError("invalid", `Parlays are limited to ${MAX_PARLAY_LEGS} legs.`);
      const games = new Set(wager.selections.map((s) => s.matchupId));
      if (games.size !== wager.selections.length) throw new BetError("invalid", "Parlays can only include one selection per matchup (correlated legs aren't allowed).");
    }
    const legs = await validateSelections(wager, source, weekCache, teamNames);
    const decimal = legs.reduce((p, l) => p * l.price.decimal, 1);
    const american = wager.kind === "single" ? legs[0].price.american : decimalToAmerican(decimal);
    const payout = payoutCents(stake, decimal);
    if (payout > MAX_PAYOUT_CENTS) throw new BetError("invalid", "That ticket exceeds the $250,000 maximum payout. Lower your stake.");
    totalStake += stake;
    prepared.push({ wager: { ...wager, stakeCents: stake }, legs, decimal, american, payout });
  }

  return getDb().transaction(async (tx) => {
    const [fresh] = await tx.select().from(users).where(eq(users.id, user.id)).for("update");
    if (!fresh) throw new BetError("auth", "Session expired. Please sign in again.");
    let balance = Number(fresh.balanceCents);
    if (totalStake > balance) {
      throw new BetError("insufficient", `Insufficient balance. You have $${(balance / 100).toFixed(2)} available.`);
    }
    const tickets: PlacedTicket[] = [];
    for (const p of prepared) {
      const week = Math.max(...p.legs.map((l) => l.week));
      const [bet] = await tx
        .insert(bets)
        .values({
          userId: user.id,
          kind: p.wager.kind,
          source,
          season,
          week,
          stakeCents: p.wager.stakeCents,
          americanOdds: p.american,
          decimalOdds: p.decimal.toFixed(4),
          potentialPayoutCents: p.payout,
          status: "open",
        })
        .returning();
      await tx.insert(betLegs).values(
        p.legs.map((l) => ({
          betId: bet.id,
          source,
          season,
          week: l.week,
          matchupId: l.matchup.id,
          market: l.price.market,
          selection: l.price.selection,
          teamId: l.price.teamId,
          line: l.price.line === null ? null : l.price.line.toFixed(2),
          americanOdds: l.price.american,
          decimalOdds: l.price.decimal.toFixed(4),
          homeTeamId: l.matchup.home.teamId,
          awayTeamId: l.matchup.away.teamId,
          homeTeamName: teamNames.get(l.matchup.home.teamId) ?? `Team ${l.matchup.home.teamId}`,
          awayTeamName: teamNames.get(l.matchup.away.teamId) ?? `Team ${l.matchup.away.teamId}`,
          label: l.price.label,
          status: "open",
        })),
      );
      balance -= p.wager.stakeCents;
      await tx.insert(ledger).values({
        userId: user.id,
        betId: bet.id,
        kind: "wager",
        amountCents: -p.wager.stakeCents,
        balanceAfterCents: balance,
        note: p.wager.kind === "parlay" ? `${p.legs.length}-leg parlay` : p.legs[0].price.label,
      });
      tickets.push({
        betId: bet.id,
        kind: p.wager.kind,
        stakeCents: p.wager.stakeCents,
        americanOdds: p.american,
        potentialPayoutCents: p.payout,
        legs: p.legs.map((l) => l.price.label),
      });
    }
    await tx.update(users).set({ balanceCents: balance, lastSeenAt: new Date() }).where(eq(users.id, user.id));
    return { tickets, balanceCents: balance };
  });
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

const globalForSettle = globalThis as typeof globalThis & { __llLastSettle?: number };

export async function settleOpenBets(opts: { force?: boolean } = {}): Promise<{ settledBets: number; settledLegs: number }> {
  const now = Date.now();
  if (!opts.force && globalForSettle.__llLastSettle && now - globalForSettle.__llLastSettle < 30_000) {
    return { settledBets: 0, settledLegs: 0 };
  }
  globalForSettle.__llLastSettle = now;

  const openLegs = await getDb()
    .select()
    .from(betLegs)
    .innerJoin(bets, eq(betLegs.betId, bets.id))
    .where(and(eq(betLegs.status, "open"), eq(bets.status, "open")));
  if (openLegs.length === 0) return { settledBets: 0, settledLegs: 0 };

  const sources = new Set(openLegs.map((r) => r.bet_legs.source as "espn" | "demo"));
  const snapshots = new Map<string, Awaited<ReturnType<typeof getSnapshotForSource>>>();
  for (const s of sources) snapshots.set(s, await getSnapshotForSource(s));

  let settledLegs = 0;
  const touchedBets = new Set<number>();

  for (const row of openLegs) {
    const leg = row.bet_legs;
    const snap = snapshots.get(leg.source);
    if (!snap || snap.meta.season !== leg.season) continue;
    const result = snap.results.find((r) => r.id === leg.matchupId && r.week === leg.week);
    if (!result || result.winner === "UNDECIDED") continue;
    const status = gradeSelection(
      leg.market as Price["market"],
      leg.selection as Price["selection"],
      leg.line === null ? null : Number(leg.line),
      leg.teamId,
      leg.homeTeamId,
      result.homeScore,
      result.awayScore,
    );
    await getDb()
      .update(betLegs)
      .set({ status, homeScore: result.homeScore.toFixed(2), awayScore: result.awayScore.toFixed(2), settledAt: new Date() })
      .where(eq(betLegs.id, leg.id));
    settledLegs++;
    touchedBets.add(leg.betId);
  }

  let settledBets = 0;
  for (const betId of touchedBets) {
    const legs = await getDb().select().from(betLegs).where(eq(betLegs.betId, betId));
    if (legs.some((l) => l.status === "open")) continue;
    const [bet] = await getDb().select().from(bets).where(eq(bets.id, betId));
    if (!bet || bet.status !== "open") continue;

    let status: "won" | "lost" | "push";
    let payout = 0;
    if (legs.some((l) => l.status === "lost")) {
      status = "lost";
    } else if (legs.every((l) => l.status === "push")) {
      status = "push";
      payout = Number(bet.stakeCents);
    } else {
      status = "won";
      const decimal = legs.reduce((p, l) => (l.status === "won" ? p * Number(l.decimalOdds) : p), 1);
      payout = payoutCents(Number(bet.stakeCents), decimal);
    }

    await getDb().transaction(async (tx) => {
      await tx.update(bets).set({ status, payoutCents: payout, settledAt: new Date() }).where(eq(bets.id, betId));
      if (payout > 0) {
        const [u] = await tx.select().from(users).where(eq(users.id, bet.userId)).for("update");
        const newBalance = Number(u.balanceCents) + payout;
        await tx.update(users).set({ balanceCents: newBalance }).where(eq(users.id, bet.userId));
        await tx.insert(ledger).values({
          userId: bet.userId,
          betId,
          kind: status === "push" ? "refund" : "payout",
          amountCents: payout,
          balanceAfterCents: newBalance,
          note: status === "push" ? "Push — stake returned" : `Winning ticket #${betId}`,
        });
      }
    });
    settledBets++;
  }
  return { settledBets, settledLegs };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export type BetWithLegs = {
  id: number;
  kind: "single" | "parlay";
  source: string;
  season: number;
  week: number;
  stakeCents: number;
  americanOdds: number;
  decimalOdds: number;
  potentialPayoutCents: number;
  status: string;
  payoutCents: number;
  placedAt: string;
  settledAt: string | null;
  legs: Array<{
    id: number;
    week: number;
    matchupId: number;
    market: string;
    selection: string;
    teamId: number | null;
    line: number | null;
    americanOdds: number;
    homeTeamName: string;
    awayTeamName: string;
    label: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
  }>;
};

export async function listUserBets(userId: number, limit = 200): Promise<BetWithLegs[]> {
  const rows = await getDb().select().from(bets).where(eq(bets.userId, userId)).orderBy(desc(bets.placedAt)).limit(limit);
  if (rows.length === 0) return [];
  const legs = await getDb()
    .select()
    .from(betLegs)
    .where(inArray(betLegs.betId, rows.map((r) => r.id)));
  const byBet = new Map<number, typeof legs>();
  for (const l of legs) {
    const arr = byBet.get(l.betId) ?? [];
    arr.push(l);
    byBet.set(l.betId, arr);
  }
  return rows.map((b) => ({
    id: b.id,
    kind: b.kind as "single" | "parlay",
    source: b.source,
    season: b.season,
    week: b.week,
    stakeCents: Number(b.stakeCents),
    americanOdds: b.americanOdds,
    decimalOdds: Number(b.decimalOdds),
    potentialPayoutCents: Number(b.potentialPayoutCents),
    status: b.status,
    payoutCents: Number(b.payoutCents),
    placedAt: b.placedAt.toISOString(),
    settledAt: b.settledAt?.toISOString() ?? null,
    legs: (byBet.get(b.id) ?? [])
      .sort((x, y) => x.id - y.id)
      .map((l) => ({
        id: l.id,
        week: l.week,
        matchupId: l.matchupId,
        market: l.market,
        selection: l.selection,
        teamId: l.teamId,
        line: l.line === null ? null : Number(l.line),
        americanOdds: l.americanOdds,
        homeTeamName: l.homeTeamName,
        awayTeamName: l.awayTeamName,
        label: l.label,
        status: l.status,
        homeScore: l.homeScore === null ? null : Number(l.homeScore),
        awayScore: l.awayScore === null ? null : Number(l.awayScore),
      })),
  }));
}

export type LeaderboardEntry = {
  id: number;
  username: string;
  displayName: string;
  balanceCents: number;
  profitCents: number;
  wins: number;
  losses: number;
  pushes: number;
  open: number;
  wageredCents: number;
  biggestWinCents: number;
  roi: number;
  joinedAt: string;
};

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const rows = await getDb()
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      balanceCents: users.balanceCents,
      createdAt: users.createdAt,
      wins: sql<number>`coalesce(sum(case when ${bets.status} = 'won' then 1 else 0 end), 0)`,
      losses: sql<number>`coalesce(sum(case when ${bets.status} = 'lost' then 1 else 0 end), 0)`,
      pushes: sql<number>`coalesce(sum(case when ${bets.status} = 'push' then 1 else 0 end), 0)`,
      open: sql<number>`coalesce(sum(case when ${bets.status} = 'open' then 1 else 0 end), 0)`,
      wagered: sql<number>`coalesce(sum(case when ${bets.status} <> 'open' then ${bets.stakeCents} else 0 end), 0)`,
      returned: sql<number>`coalesce(sum(case when ${bets.status} <> 'open' then ${bets.payoutCents} else 0 end), 0)`,
      openStake: sql<number>`coalesce(sum(case when ${bets.status} = 'open' then ${bets.stakeCents} else 0 end), 0)`,
      biggestWin: sql<number>`coalesce(max(case when ${bets.status} = 'won' then ${bets.payoutCents} - ${bets.stakeCents} else 0 end), 0)`,
    })
    .from(users)
    .leftJoin(bets, eq(bets.userId, users.id))
    .groupBy(users.id);

  return rows
    .map((r) => {
      const balance = Number(r.balanceCents);
      const openStake = Number(r.openStake);
      const wagered = Number(r.wagered);
      const returned = Number(r.returned);
      return {
        id: r.id,
        username: r.username,
        displayName: r.displayName,
        balanceCents: balance,
        // Equity = cash + open stakes − starting bankroll
        profitCents: balance + openStake - 1_000_000,
        wins: Number(r.wins),
        losses: Number(r.losses),
        pushes: Number(r.pushes),
        open: Number(r.open),
        wageredCents: wagered,
        biggestWinCents: Number(r.biggestWin),
        roi: wagered > 0 ? (returned - wagered) / wagered : 0,
        joinedAt: r.createdAt.toISOString(),
      };
    })
    .sort((a, b) => b.profitCents - a.profitCents || b.balanceCents - a.balanceCents);
}

export { americanToDecimal };

export type LedgerPoint = { at: string; balanceAfterCents: number; amountCents: number; kind: string; note: string | null };

export async function listLedger(userId: number, limit = 500): Promise<LedgerPoint[]> {
  const rows = await getDb().select().from(ledger).where(eq(ledger.userId, userId)).orderBy(ledger.createdAt, ledger.id).limit(limit);
  return rows.map((r) => ({
    at: r.createdAt.toISOString(),
    balanceAfterCents: Number(r.balanceAfterCents),
    amountCents: Number(r.amountCents),
    kind: r.kind,
    note: r.note,
  }));
}
