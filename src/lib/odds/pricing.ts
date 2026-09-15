import type { Matchup, MatchupOdds, Price, Selection, MarketKey } from "@/lib/types";
import {
  americanToDecimal,
  applyHold,
  formatLine,
  normalCdf,
  probGreaterThan,
  probToAmerican,
  roundToHalf,
} from "./math";

/** Book hold. 4.55% reproduces the classic −110 / −110 on a coin flip. */
export const BOOK_HOLD = 0.0455;

/**
 * Positional coefficient of variation (σ / projection) for a single starter,
 * estimated from historical week-to-week scoring dispersion. QBs are the most
 * stable; D/ST and TEs are the most volatile.
 */
const POSITION_CV: Record<string, number> = {
  QB: 0.38,
  RB: 0.55,
  WR: 0.62,
  TE: 0.68,
  K: 0.55,
  "D/ST": 0.75,
  DST: 0.75,
  FLEX: 0.6,
  OP: 0.45,
  DEFAULT: 0.58,
};

export function playerSigma(position: string, projected: number): number {
  if (projected <= 0) return 0;
  const cv = POSITION_CV[position] ?? POSITION_CV.DEFAULT;
  // Floor keeps low-projection starters from being treated as certainties;
  // ceiling stops one monster projection from dominating the variance.
  return Math.min(14, Math.max(2.25, cv * projected));
}

/** Fallback when starter-level data is unavailable. */
export function teamSigmaFallback(projected: number): number {
  return Math.max(14, 0.17 * projected);
}

function makePrice(
  market: MarketKey,
  selection: Selection,
  teamId: number | null,
  line: number | null,
  fairProb: number,
  impliedProb: number,
  label: string,
): Price {
  const american = probToAmerican(impliedProb);
  return {
    market,
    selection,
    teamId,
    line,
    american,
    decimal: americanToDecimal(american),
    impliedProb,
    fairProb,
    label,
  };
}

function shortName(name: string): string {
  return name.length > 22 ? `${name.slice(0, 21)}…` : name;
}

/**
 * Price every market for a matchup. Uses the live-adjusted projection and the
 * remaining variance, so lines move as real games play out.
 */
export function priceMatchup(
  m: Matchup,
  names: { home: string; away: string },
  hold: number = BOOK_HOLD,
): MatchupOdds {
  const muH = m.home.liveProjected;
  const muA = m.away.liveProjected;
  const sH = m.home.sigma;
  const sA = m.away.sigma;

  const marginMu = muH - muA;
  const marginSigma = Math.sqrt(sH * sH + sA * sA);
  const totalMu = muH + muA;
  const totalSigma = marginSigma; // same variance under independence

  // --- Moneyline -----------------------------------------------------------
  const homeWinFair = marginSigma > 0 ? normalCdf(marginMu / marginSigma) : marginMu > 0 ? 1 : 0;
  const awayWinFair = 1 - homeWinFair;
  const [mlHome, mlAway] = applyHold(homeWinFair, awayWinFair, hold);

  // --- Spread ----------------------------------------------------------------
  // Home spread is the negative expected margin rounded to the half point.
  const homeSpread = roundToHalf(-marginMu) === 0 ? 0 : roundToHalf(-marginMu);
  const awaySpread = -homeSpread;
  // Home covers when margin > -homeSpread; because of rounding this is not
  // exactly 50%, so the juice drifts (e.g. −108 / −112) just like a real book.
  const homeCoverFair = probGreaterThan(-homeSpread, marginMu, marginSigma);
  const awayCoverFair = 1 - homeCoverFair;
  const [spHome, spAway] = applyHold(homeCoverFair, awayCoverFair, hold);

  // --- Total -------------------------------------------------------------------
  const totalLine = roundToHalf(totalMu);
  const overFair = probGreaterThan(totalLine, totalMu, totalSigma);
  const underFair = 1 - overFair;
  const [ovP, unP] = applyHold(overFair, underFair, hold);

  // --- Team totals --------------------------------------------------------------
  const homeTT = roundToHalf(muH);
  const awayTT = roundToHalf(muA);
  const homeOverFair = probGreaterThan(homeTT, muH, sH);
  const awayOverFair = probGreaterThan(awayTT, muA, sA);
  const [hOv, hUn] = applyHold(homeOverFair, 1 - homeOverFair, hold);
  const [aOv, aUn] = applyHold(awayOverFair, 1 - awayOverFair, hold);

  const homeName = shortName(names.home);
  const awayName = shortName(names.away);

  return {
    moneyline: [
      makePrice("moneyline", "away", m.away.teamId, null, awayWinFair, mlAway, `${awayName} ML`),
      makePrice("moneyline", "home", m.home.teamId, null, homeWinFair, mlHome, `${homeName} ML`),
    ],
    spread: [
      makePrice("spread", "away", m.away.teamId, awaySpread, awayCoverFair, spAway, `${awayName} ${formatLine(awaySpread)}`),
      makePrice("spread", "home", m.home.teamId, homeSpread, homeCoverFair, spHome, `${homeName} ${formatLine(homeSpread)}`),
    ],
    total: [
      makePrice("total", "over", null, totalLine, overFair, ovP, `Over ${formatLine(totalLine, { signed: false })}`),
      makePrice("total", "under", null, totalLine, underFair, unP, `Under ${formatLine(totalLine, { signed: false })}`),
    ],
    teamTotals: {
      home: [
        makePrice("team_total", "over", m.home.teamId, homeTT, homeOverFair, hOv, `${homeName} Over ${formatLine(homeTT, { signed: false })}`),
        makePrice("team_total", "under", m.home.teamId, homeTT, 1 - homeOverFair, hUn, `${homeName} Under ${formatLine(homeTT, { signed: false })}`),
      ],
      away: [
        makePrice("team_total", "over", m.away.teamId, awayTT, awayOverFair, aOv, `${awayName} Over ${formatLine(awayTT, { signed: false })}`),
        makePrice("team_total", "under", m.away.teamId, awayTT, 1 - awayOverFair, aUn, `${awayName} Under ${formatLine(awayTT, { signed: false })}`),
      ],
    },
    homeWinProb: homeWinFair,
    expectedMargin: marginMu,
    expectedTotal: totalMu,
    marginSigma,
    totalSigma,
    hold,
  };
}

/** Find a specific price inside a priced matchup (used to validate bet slips server-side). */
export function findPrice(
  odds: MatchupOdds,
  market: MarketKey,
  selection: Selection,
  teamId: number | null,
): Price | null {
  switch (market) {
    case "moneyline":
      return odds.moneyline.find((p) => p.selection === selection) ?? null;
    case "spread":
      return odds.spread.find((p) => p.selection === selection) ?? null;
    case "total":
      return odds.total.find((p) => p.selection === selection) ?? null;
    case "team_total": {
      const side = odds.teamTotals.home[0].teamId === teamId ? odds.teamTotals.home : odds.teamTotals.away[0].teamId === teamId ? odds.teamTotals.away : null;
      return side?.find((p) => p.selection === selection) ?? null;
    }
    default:
      return null;
  }
}

/** Resolve a settled leg given final scores. */
export function gradeSelection(
  market: MarketKey,
  selection: Selection,
  line: number | null,
  teamId: number | null,
  homeTeamId: number,
  homeScore: number,
  awayScore: number,
): "won" | "lost" | "push" {
  const EPS = 1e-9;
  switch (market) {
    case "moneyline": {
      if (Math.abs(homeScore - awayScore) < EPS) return "push";
      const homeWon = homeScore > awayScore;
      return (selection === "home") === homeWon ? "won" : "lost";
    }
    case "spread": {
      const ln = line ?? 0;
      const adjusted = selection === "home" ? homeScore + ln - awayScore : awayScore + ln - homeScore;
      if (Math.abs(adjusted) < EPS) return "push";
      return adjusted > 0 ? "won" : "lost";
    }
    case "total": {
      const ln = line ?? 0;
      const total = homeScore + awayScore;
      if (Math.abs(total - ln) < EPS) return "push";
      const over = total > ln;
      return (selection === "over") === over ? "won" : "lost";
    }
    case "team_total": {
      const ln = line ?? 0;
      const score = teamId === homeTeamId ? homeScore : awayScore;
      if (Math.abs(score - ln) < EPS) return "push";
      const over = score > ln;
      return (selection === "over") === over ? "won" : "lost";
    }
  }
}
