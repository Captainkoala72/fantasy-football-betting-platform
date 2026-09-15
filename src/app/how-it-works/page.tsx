import type { Metadata } from "next";
import Link from "next/link";
import { isEspnConfigured } from "@/lib/espn/client";

export const metadata: Metadata = { title: "How odds work" };
export const dynamic = "force-dynamic";

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 overflow-x-auto rounded-2xl border border-white/8 bg-ink-950/60 px-4 py-3 font-display text-sm text-volt-200 sm:text-base">
      {children}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card rounded-3xl p-5 sm:p-7">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-volt-400 font-display text-base font-bold text-ink-950">{n}</span>
        <h2 className="font-display text-xl font-bold">{title}</h2>
      </div>
      <div className="prose-invert mt-4 space-y-3 text-sm leading-relaxed text-mist-300">{children}</div>
    </section>
  );
}

export default function HowItWorksPage() {
  const connected = isEspnConfigured();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-volt-400">House rules</p>
      <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">How projections become odds</h1>
      <p className="mt-3 text-mist-300">
        Every line on the board is derived mathematically from ESPN&apos;s player projections — no hand-set numbers. Here is the full pipeline, from your league&apos;s
        private API feed to the price you see on a button.
      </p>

      <div className="mt-8 space-y-4">
        <Step n={1} title="Pull the league from ESPN's fantasy API">
          <p>
            ESPN exposes an unofficial JSON API for fantasy leagues. Private leagues require two cookies from a logged-in session,{" "}
            <code className="rounded bg-white/8 px-1">espn_s2</code> and <code className="rounded bg-white/8 px-1">SWID</code>, which this app reads from environment variables together
            with the league ID.
          </p>
          <p>
            For each matchup period we request the box scores (<code className="rounded bg-white/8 px-1">mMatchupScore</code> + <code className="rounded bg-white/8 px-1">mScoreboard</code>) and read every
            starter&apos;s weekly projection (<code className="rounded bg-white/8 px-1">statSourceId = 1</code>) and actual score (<code className="rounded bg-white/8 px-1">statSourceId = 0</code>). Bench and IR slots are ignored.
          </p>
          <p className={connected ? "text-win-400" : "text-gold-400"}>
            {connected ? "✓ ESPN credentials detected — the board is pricing your league." : "ESPN credentials are not configured yet, so the board shows a demo league. Add ESPN_LEAGUE_ID, espn_s2 and SWID to connect."}
          </p>
        </Step>

        <Step n={2} title="Model each team's score as a normal distribution">
          <p>
            A fantasy team&apos;s weekly score is the sum of nine-or-so roughly independent player scores, so by the central limit theorem it is well approximated by a
            normal distribution. The mean is the team&apos;s projection; the variance is the sum of each starter&apos;s variance.
          </p>
          <Formula>
            μ<sub>team</sub> = Σ proj<sub>i</sub> &nbsp;&nbsp;&nbsp; σ<sub>team</sub>² = Σ σ<sub>i</sub>² &nbsp;&nbsp;&nbsp; σ<sub>i</sub> = clamp(CV<sub>pos</sub> · proj<sub>i</sub>, 2.25, 14)
          </Formula>
          <p>
            The coefficient of variation is position-specific, calibrated to historical week-to-week dispersion: QB 0.38, RB 0.55, WR 0.62, TE 0.68, K 0.55, D/ST 0.75. A
            typical lineup projected at ~120 points ends up with σ ≈ 20–22, matching what real leagues observe.
          </p>
        </Step>

        <Step n={3} title="Derive the margin and total">
          <p>Sums and differences of independent normals are normal, so both core markets have closed-form distributions:</p>
          <Formula>
            Margin M = H − A ~ N(μ<sub>H</sub> − μ<sub>A</sub>, σ<sub>H</sub>² + σ<sub>A</sub>²) &nbsp;&nbsp;&nbsp; Total T = H + A ~ N(μ<sub>H</sub> + μ<sub>A</sub>, σ<sub>H</sub>² + σ<sub>A</sub>²)
          </Formula>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-mist-100">Moneyline</strong>: P(home wins) = Φ((μ<sub>H</sub> − μ<sub>A</sub>) / σ<sub>M</sub>).
            </li>
            <li>
              <strong className="text-mist-100">Spread</strong>: the home line is −(μ<sub>H</sub> − μ<sub>A</sub>) rounded to the half point. Because of that rounding, the cover
              probability isn&apos;t exactly 50%, which is why you see prices like −108 / −112 instead of a flat −110.
            </li>
            <li>
              <strong className="text-mist-100">Total</strong>: the line is μ<sub>T</sub> rounded to the half point; P(over) = 1 − Φ((line − μ<sub>T</sub>) / σ<sub>T</sub>).
            </li>
            <li>
              <strong className="text-mist-100">Team totals</strong>: same idea applied to a single team&apos;s N(μ, σ²).
            </li>
          </ul>
        </Step>

        <Step n={4} title="Apply the book's hold and convert to American odds">
          <p>
            Fair probabilities sum to 100%. A sportsbook shades both sides so they sum to slightly more — that overround is the hold. LeagueLines uses a 4.55% hold
            applied multiplicatively, which turns a true coin flip into the classic −110 / −110.
          </p>
          <Formula>
            p′ = p · (1 + 0.0455) &nbsp;&nbsp;&nbsp; American = p′ ≥ 0.5 ? −100 · p′ / (1 − p′) : +100 · (1 − p′) / p′
          </Formula>
          <p>Prices are rounded like a real book (to the nearest 5 above ±200) and capped at ±10000.</p>
        </Step>

        <Step n={5} title="Lines move live">
          <p>
            During the week the model re-prices continuously. Each starter&apos;s status comes from the NFL schedule: before kickoff he carries full variance; while his game
            is in progress his remaining variance shrinks with elapsed time; once his game is final his points are banked and his variance is zero. The team mean becomes
            banked points plus the remaining expectation, so a Thursday-night blow-up immediately shifts the spread, total and moneyline for that matchup.
          </p>
          <p>When every starter has played, the matchup locks. It settles when ESPN marks the winner.</p>
        </Step>

        <Step n={6} title="Betting & settlement">
          <ul className="list-disc space-y-1 pl-5">
            <li>Every account starts with a $10,000 play-money bankroll. Minimum ticket $1, maximum $5,000, maximum payout $250,000.</li>
            <li>Singles and parlays (2–10 legs, one selection per matchup — correlated legs are not allowed).</li>
            <li>Your ticket is always written at the book&apos;s current price. If a line moves while your slip is open, you&apos;ll be asked to review before placing.</li>
            <li>Spreads and totals that land exactly on the number are pushes: stake returned, and a pushed parlay leg drops out of the multiplier.</li>
            <li>Settlement uses ESPN&apos;s official matchup totals and runs automatically whenever the board refreshes.</li>
          </ul>
        </Step>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn-primary">
          Back to the board
        </Link>
        <Link href="/leaderboard" className="btn-ghost">
          See the leaderboard
        </Link>
      </div>
    </div>
  );
}
