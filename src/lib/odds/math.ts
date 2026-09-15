/**
 * Probability / odds math used by the pricing engine.
 *
 * Fantasy team scores are modelled as Normal(μ, σ²) where μ is the ESPN
 * projection and σ² is the sum of each starter's variance. Because the sum of
 * independent normals is normal, the margin (H − A) and the total (H + A) are
 * both normal with variance σ_h² + σ_a², which lets every market be priced in
 * closed form with the standard normal CDF Φ.
 */

/** Abramowitz & Stegun 7.1.26 erf approximation (|error| < 1.5e-7). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF Φ(z). */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** P(X > x) for X ~ N(mu, sigma²). */
export function probGreaterThan(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return x < mu ? 1 : x > mu ? 0 : 0.5;
  return 1 - normalCdf((x - mu) / sigma);
}

/** Standard normal PDF. */
export function normalPdf(x: number, mu = 0, sigma = 1): number {
  if (sigma <= 0) return 0;
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

export const MIN_PROB = 0.0099; // caps prices at ±10000
export const MAX_PROB = 1 - MIN_PROB;

export function clampProb(p: number): number {
  if (!Number.isFinite(p)) return 0.5;
  return Math.min(MAX_PROB, Math.max(MIN_PROB, p));
}

/**
 * Apply the book's hold to a fair two-way market using the multiplicative
 * method: each side's implied probability is scaled so that they sum to
 * (1 + hold). A 4.55% hold turns a 50/50 market into the familiar −110/−110.
 */
export function applyHold(fairA: number, fairB: number, hold: number): [number, number] {
  const sum = fairA + fairB;
  const a = fairA / sum;
  const b = fairB / sum;
  const scale = 1 + hold;
  return [clampProb(a * scale), clampProb(b * scale)];
}

/** Convert a (vigged) implied probability to American odds. */
export function probToAmerican(p: number): number {
  const prob = clampProb(p);
  let odds: number;
  if (prob >= 0.5) {
    odds = -(prob / (1 - prob)) * 100;
  } else {
    odds = ((1 - prob) / prob) * 100;
  }
  return roundAmerican(odds);
}

/** Sportsbooks round big numbers to the nearest 5 and keep -100 → +100 continuity. */
export function roundAmerican(odds: number): number {
  const abs = Math.abs(odds);
  let rounded: number;
  if (abs < 200) rounded = Math.round(abs);
  else if (abs < 1000) rounded = Math.round(abs / 5) * 5;
  else rounded = Math.round(abs / 10) * 10;
  if (rounded < 100) rounded = 100;
  if (rounded > 10000) rounded = 10000;
  return odds < 0 ? -rounded : rounded;
}

export function americanToDecimal(odds: number): number {
  if (odds >= 100) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

export function decimalToAmerican(dec: number): number {
  if (dec >= 2) return roundAmerican((dec - 1) * 100);
  return roundAmerican(-100 / (dec - 1));
}

export function americanToImpliedProb(odds: number): number {
  if (odds >= 100) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

/** Round to nearest half point (standard for spreads and totals). */
export function roundToHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

export function formatAmerican(odds: number): string {
  if (odds >= 100) return `+${odds}`;
  return `${odds}`;
}

export function formatLine(line: number, opts: { signed?: boolean } = {}): string {
  const signed = opts.signed ?? true;
  if (line === 0) return signed ? "PK" : "0";
  const abs = Math.abs(line);
  const str = Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(1);
  if (!signed) return str;
  return line > 0 ? `+${str}` : `-${str}`;
}

export function formatPct(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`;
}

/** Payout (stake + profit) in cents for a stake and decimal odds. */
export function payoutCents(stakeCents: number, decimalOdds: number): number {
  return Math.round(stakeCents * decimalOdds);
}
