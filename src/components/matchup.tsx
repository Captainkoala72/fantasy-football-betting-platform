"use client";

import { useMemo } from "react";
import type { LeagueTeam, MatchupSide, Price, PricedMatchup, Starter } from "@/lib/types";
import { fmtPts, fmtRecord, selectionKey } from "@/lib/format";
import { formatAmerican, formatLine, formatPct, normalPdf } from "@/lib/odds/math";
import { useBetSlip } from "./providers";
import { Icon, Modal, StatePill, TeamBadge } from "./ui";

export type Movement = Record<string, "up" | "down">;

// ---------------------------------------------------------------------------
// Odds button
// ---------------------------------------------------------------------------

export function OddsButton({
  price,
  matchup,
  matchupLabel,
  movement,
  disabled,
  compact,
}: {
  price: Price;
  matchup: PricedMatchup;
  matchupLabel: string;
  movement?: Movement;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { toggle, isSelected } = useBetSlip();
  const key = selectionKey({ matchupId: matchup.id, market: price.market, selection: price.selection, teamId: price.teamId });
  const selected = isSelected(key);
  const moved = movement?.[key];
  const lineText =
    price.market === "moneyline"
      ? null
      : price.market === "spread"
        ? formatLine(price.line ?? 0)
        : `${price.selection === "over" ? "O" : "U"} ${formatLine(price.line ?? 0, { signed: false })}`;
  return (
    <button
      type="button"
      disabled={disabled}
      data-selected={selected}
      onClick={() => toggle(price, matchup, matchupLabel)}
      className={`odds-btn ${compact ? "h-12!" : ""} ${moved === "up" ? "animate-flash-up" : moved === "down" ? "animate-flash-down" : ""}`}
      aria-pressed={selected}
      aria-label={`${price.label} at ${formatAmerican(price.american)}`}
    >
      {moved && (
        <span className={`absolute right-1.5 top-1.5 ${moved === "up" ? "text-win-400" : "text-heat-400"}`}>
          {moved === "up" ? <Icon.ArrowUp /> : <Icon.ArrowDown />}
        </span>
      )}
      {lineText && <span className="odds-line">{lineText}</span>}
      <span className={`odds-price ${!lineText ? "text-lg" : ""}`}>{formatAmerican(price.american)}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Team row inside a card
// ---------------------------------------------------------------------------

function TeamRow({ team, side, m, isHome }: { team: LeagueTeam | undefined; side: MatchupSide; m: PricedMatchup; isHome: boolean }) {
  const won = m.state === "final" && ((isHome && m.winner === "HOME") || (!isHome && m.winner === "AWAY"));
  const showScore = m.state !== "upcoming";
  const name = team?.name ?? `Team ${side.teamId}`;
  return (
    <div className={`flex items-center gap-3 ${m.state === "final" && !won ? "opacity-60" : ""}`}>
      <TeamBadge id={side.teamId} name={name} abbrev={team?.abbrev} logo={team?.logo ?? null} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold leading-tight text-mist-50">{name}</p>
          {won && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-win-500/20 text-win-400">
              <Icon.Check className="h-3 w-3" />
            </span>
          )}
          {isHome && <span className="hidden rounded bg-white/6 px-1 text-[9px] font-bold uppercase tracking-wider text-mist-400 sm:inline">Home</span>}
        </div>
        <p className="truncate text-xs text-mist-500">
          {team ? fmtRecord(team) : "—"}
          {team?.playoffSeed ? ` · #${team.playoffSeed} seed` : ""} · {team?.owner ?? ""}
        </p>
      </div>
      <div className="text-right">
        {showScore ? (
          <>
            <p className={`font-display text-xl font-bold tabular leading-none ${won ? "text-win-400" : "text-mist-50"}`}>{fmtPts(side.points)}</p>
            <p className="mt-1 text-[11px] tabular text-mist-500">
              {m.state === "live" ? `proj ${fmtPts(side.liveProjected)}` : `proj ${fmtPts(side.projected)}`}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-xl font-bold tabular leading-none text-mist-100">{fmtPts(side.projected)}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-mist-500">proj</p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Win-probability bar
// ---------------------------------------------------------------------------

function ProbBar({ awayProb, homeProb, awayName, homeName }: { awayProb: number; homeProb: number; awayName: string; homeName: string }) {
  return (
    <div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/6">
        <div className="bg-gradient-to-r from-ice-500 to-ice-400 transition-all duration-700" style={{ width: `${awayProb * 100}%` }} />
        <div className="bg-gradient-to-r from-volt-500 to-volt-300 transition-all duration-700" style={{ width: `${homeProb * 100}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-mist-400">
        <span className="truncate">
          <span className="font-semibold text-ice-400">{formatPct(awayProb)}</span> {awayName}
        </span>
        <span className="truncate text-right">
          {homeName} <span className="font-semibold text-volt-300">{formatPct(homeProb)}</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game card
// ---------------------------------------------------------------------------

export function GameCard({
  m,
  teams,
  movement,
  onDetails,
  index,
}: {
  m: PricedMatchup;
  teams: Map<number, LeagueTeam>;
  movement: Movement;
  onDetails: (m: PricedMatchup) => void;
  index: number;
}) {
  const away = teams.get(m.away.teamId);
  const home = teams.get(m.home.teamId);
  const label = `${away?.abbrev ?? "AWAY"} @ ${home?.abbrev ?? "HOME"}`;
  const odds = m.odds;
  const disabled = !m.bettable;
  const done = m.home.startersDone + m.away.startersDone;
  const total = m.home.startersTotal + m.away.startersTotal;

  return (
    <article className="card overflow-hidden rounded-3xl animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}>
      <header className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2 text-xs text-mist-400">
          <StatePill state={m.state} />
          {m.state === "live" && total > 0 && (
            <span className="tabular">
              {done}/{total} starters final
            </span>
          )}
          {m.state === "upcoming" && odds && (
            <span className="hidden sm:inline">
              Fav: <span className="font-semibold text-mist-200">{odds.homeWinProb >= 0.5 ? home?.abbrev : away?.abbrev}</span> by{" "}
              <span className="tabular font-semibold text-mist-200">{fmtPts(Math.abs(odds.expectedMargin))}</span>
            </span>
          )}
          {m.playoffTier && m.playoffTier !== "NONE" && <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-400">Playoffs</span>}
          {!m.bettable && m.lockReason && m.state !== "final" && (
            <span className="flex items-center gap-1 text-mist-500">
              <Icon.Lock className="h-3 w-3" /> {m.lockReason}
            </span>
          )}
        </div>
        <button onClick={() => onDetails(m)} className="flex items-center gap-1 text-xs font-semibold text-mist-300 hover:text-volt-300">
          Matchup detail <Icon.ChevronRight className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
        <div className="space-y-3.5">
          <TeamRow team={away} side={m.away} m={m} isHome={false} />
          <TeamRow team={home} side={m.home} m={m} isHome />
        </div>

        {odds ? (
          <div className="grid grid-cols-3 gap-2">
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">Spread</p>
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">Total</p>
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">Moneyline</p>
            <OddsButton price={odds.spread[0]} matchup={m} matchupLabel={label} movement={movement} disabled={disabled} />
            <OddsButton price={odds.total[0]} matchup={m} matchupLabel={label} movement={movement} disabled={disabled} />
            <OddsButton price={odds.moneyline[0]} matchup={m} matchupLabel={label} movement={movement} disabled={disabled} />
            <OddsButton price={odds.spread[1]} matchup={m} matchupLabel={label} movement={movement} disabled={disabled} />
            <OddsButton price={odds.total[1]} matchup={m} matchupLabel={label} movement={movement} disabled={disabled} />
            <OddsButton price={odds.moneyline[1]} matchup={m} matchupLabel={label} movement={movement} disabled={disabled} />
          </div>
        ) : m.state === "final" ? (
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/6 bg-ink-950/40 p-3 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-mist-500">Margin</p>
              <p className="font-display text-base font-bold tabular">{fmtPts(Math.abs(m.home.points - m.away.points))}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-mist-500">Total</p>
              <p className="font-display text-base font-bold tabular">{fmtPts(m.home.points + m.away.points)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-mist-500">Proj total</p>
              <p className="font-display text-base font-bold tabular text-mist-300">{fmtPts(m.home.projected + m.away.projected)}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-mist-500">
            <Icon.Lock className="mr-2 h-4 w-4" /> Lines post when ESPN publishes projections
          </div>
        )}
      </div>

      {odds && (
        <footer className="border-t border-white/5 px-4 py-3 sm:px-5">
          <ProbBar awayProb={1 - odds.homeWinProb} homeProb={odds.homeWinProb} awayName={away?.name ?? "Away"} homeName={home?.name ?? "Home"} />
        </footer>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Distribution chart (SVG)
// ---------------------------------------------------------------------------

function DistributionChart({ m, away, home }: { m: PricedMatchup; away?: LeagueTeam; home?: LeagueTeam }) {
  const data = useMemo(() => {
    const sides = [m.away, m.home].map((s) => ({
      mu: s.sigma > 1 ? s.liveProjected : s.projected,
      sigma: s.sigma > 1 ? s.sigma : s.pregameSigma,
    }));
    const lo = Math.min(...sides.map((s) => s.mu - 3.2 * s.sigma));
    const hi = Math.max(...sides.map((s) => s.mu + 3.2 * s.sigma));
    const W = 640;
    const H = 200;
    const pad = { l: 12, r: 12, t: 16, b: 28 };
    const n = 90;
    const peak = Math.max(...sides.map((s) => normalPdf(s.mu, s.mu, s.sigma)));
    const x = (v: number) => pad.l + ((v - lo) / (hi - lo)) * (W - pad.l - pad.r);
    const y = (p: number) => H - pad.b - (p / peak) * (H - pad.t - pad.b);
    const paths = sides.map((s) => {
      const pts: string[] = [];
      for (let i = 0; i <= n; i++) {
        const v = lo + ((hi - lo) * i) / n;
        pts.push(`${x(v).toFixed(1)},${y(normalPdf(v, s.mu, s.sigma)).toFixed(1)}`);
      }
      const line = `M${pts.join("L")}`;
      const area = `${line}L${x(hi).toFixed(1)},${(H - pad.b).toFixed(1)}L${x(lo).toFixed(1)},${(H - pad.b).toFixed(1)}Z`;
      return { line, area, mx: x(s.mu), my: y(normalPdf(s.mu, s.mu, s.sigma)), mu: s.mu };
    });
    const ticks: number[] = [];
    const step = Math.max(10, Math.round((hi - lo) / 6 / 10) * 10);
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
    return { W, H, pad, paths, ticks, x };
  }, [m]);

  return (
    <svg viewBox={`0 0 ${data.W} ${data.H}`} className="h-auto w-full" role="img" aria-label="Projected score distributions">
      <defs>
        <linearGradient id="g-away" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="g-home" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9ff3d" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#c9ff3d" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {data.ticks.map((t) => (
        <g key={t}>
          <line x1={data.x(t)} x2={data.x(t)} y1={data.pad.t} y2={data.H - data.pad.b} stroke="rgba(255,255,255,0.05)" />
          <text x={data.x(t)} y={data.H - 8} textAnchor="middle" fontSize="11" fill="#6f7a94">
            {t}
          </text>
        </g>
      ))}
      <line x1={data.pad.l} x2={data.W - data.pad.r} y1={data.H - data.pad.b} y2={data.H - data.pad.b} stroke="rgba(255,255,255,0.12)" />
      <path d={data.paths[0].area} fill="url(#g-away)" />
      <path d={data.paths[1].area} fill="url(#g-home)" />
      <path d={data.paths[0].line} fill="none" stroke="#2dd4bf" strokeWidth="2" />
      <path d={data.paths[1].line} fill="none" stroke="#c9ff3d" strokeWidth="2" />
      {data.paths.map((p, i) => (
        <g key={i}>
          <line x1={p.mx} x2={p.mx} y1={p.my} y2={data.H - data.pad.b} stroke={i === 0 ? "#2dd4bf" : "#c9ff3d"} strokeDasharray="3 3" strokeOpacity="0.7" />
          <text x={p.mx} y={p.my - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill={i === 0 ? "#5eead4" : "#dbff7a"}>
            {(i === 0 ? away?.abbrev : home?.abbrev) ?? ""} {fmtPts(p.mu)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Lineup table
// ---------------------------------------------------------------------------

function Lineup({ side, team, accent }: { side: MatchupSide; team?: LeagueTeam; accent: "ice" | "volt" }) {
  const color = accent === "ice" ? "text-ice-400" : "text-volt-300";
  const dot = (s: Starter) =>
    s.status === "final" ? "bg-mist-500" : s.status === "live" ? "bg-heat-500 animate-pulse-dot" : s.status === "bye" ? "bg-ink-500" : "bg-win-500/70";
  return (
    <div className="rounded-2xl border border-white/6 bg-ink-950/40">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <TeamBadge id={side.teamId} name={team?.name ?? ""} abbrev={team?.abbrev} logo={team?.logo ?? null} size={24} />
          <p className={`truncate text-sm font-semibold ${color}`}>{team?.name ?? `Team ${side.teamId}`}</p>
        </div>
        <p className="text-[11px] tabular text-mist-500">
          σ <span className="text-mist-300">{fmtPts(side.sigma > 0 ? side.sigma : side.pregameSigma)}</span>
        </p>
      </div>
      {side.starters.length === 0 ? (
        <p className="px-3 py-4 text-xs text-mist-500">Lineup not available.</p>
      ) : (
        <ul className="divide-y divide-white/4">
          {side.starters.map((s, i) => (
            <li key={`${s.name}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              <span className="w-9 shrink-0 rounded bg-white/6 px-1 py-0.5 text-center text-[10px] font-bold text-mist-400">{s.slot}</span>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot(s)}`} title={s.status} />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-mist-100">{s.name}</span>
                <span className="text-mist-500">
                  {" "}
                  {s.proTeam}
                  {s.injuryStatus ? ` · ${s.injuryStatus.slice(0, 1)}` : ""}
                </span>
              </span>
              <span className="w-12 text-right tabular text-mist-400">{fmtPts(s.projected)}</span>
              <span className={`w-12 text-right font-semibold tabular ${s.status === "pre" ? "text-mist-600" : "text-mist-50"}`}>
                {s.status === "pre" ? "—" : fmtPts(s.actual)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between border-t border-white/5 px-3 py-2 text-xs">
        <span className="text-mist-500">Projected / Actual</span>
        <span className="tabular">
          <span className="text-mist-300">{fmtPts(side.projected)}</span>
          <span className="mx-2 text-mist-600">/</span>
          <span className="font-semibold text-mist-50">{fmtPts(side.points)}</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matchup modal
// ---------------------------------------------------------------------------

export function MatchupModal({
  m,
  teams,
  movement,
  onClose,
}: {
  m: PricedMatchup | null;
  teams: Map<number, LeagueTeam>;
  movement: Movement;
  onClose: () => void;
}) {
  if (!m) return null;
  const away = teams.get(m.away.teamId);
  const home = teams.get(m.home.teamId);
  const label = `${away?.abbrev ?? "AWAY"} @ ${home?.abbrev ?? "HOME"}`;
  const odds = m.odds;
  const disabled = !m.bettable;
  return (
    <Modal open={!!m} onClose={onClose} size="xl" label="Matchup detail">
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-mist-400">
            <StatePill state={m.state} />
            <span>Week {m.week}</span>
            {m.playoffTier !== "NONE" && <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-400">Playoffs</span>}
          </div>
          <button onClick={onClose} className="text-mist-500 hover:text-mist-100" aria-label="Close">
            <Icon.Close />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex items-center gap-3">
            <TeamBadge id={m.away.teamId} name={away?.name ?? ""} abbrev={away?.abbrev} logo={away?.logo ?? null} size={56} />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-bold leading-tight">{away?.name}</p>
              <p className="text-xs text-mist-500">
                {away ? fmtRecord(away) : ""} · {away?.owner}
              </p>
              <p className="mt-1 font-display text-2xl font-bold tabular text-ice-400">{fmtPts(m.state === "upcoming" ? m.away.projected : m.away.points)}</p>
            </div>
          </div>
          <div className="text-center">
            <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-mist-500">at</p>
            {odds && (
              <p className="mt-1 whitespace-nowrap text-[11px] text-mist-400">
                {odds.homeWinProb >= 0.5 ? home?.abbrev : away?.abbrev} {formatLine(-Math.abs(odds.expectedMargin))}
              </p>
            )}
          </div>
          <div className="flex flex-row-reverse items-center gap-3 text-right">
            <TeamBadge id={m.home.teamId} name={home?.name ?? ""} abbrev={home?.abbrev} logo={home?.logo ?? null} size={56} />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-bold leading-tight">{home?.name}</p>
              <p className="text-xs text-mist-500">
                {home ? fmtRecord(home) : ""} · {home?.owner}
              </p>
              <p className="mt-1 font-display text-2xl font-bold tabular text-volt-300">{fmtPts(m.state === "upcoming" ? m.home.projected : m.home.points)}</p>
            </div>
          </div>
        </div>

        {odds && (
          <div className="mt-5">
            <ProbBar awayProb={1 - odds.homeWinProb} homeProb={odds.homeWinProb} awayName={away?.name ?? "Away"} homeName={home?.name ?? "Home"} />
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-white/6 bg-ink-950/40 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Projected score distributions</h3>
              <span className="text-[11px] text-mist-500">Normal model · live variance</span>
            </div>
            <div className="mt-2">
              <DistributionChart m={m} away={away} home={home} />
            </div>
            {odds && (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Exp. margin" value={`${home?.abbrev} ${formatLine(odds.expectedMargin)}`} />
                <Metric label="Exp. total" value={fmtPts(odds.expectedTotal)} />
                <Metric label="Margin σ" value={fmtPts(odds.marginSigma)} />
                <Metric label="Book hold" value={formatPct(odds.hold, 1)} />
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/6 bg-ink-950/40 p-4">
            <h3 className="text-sm font-semibold">All markets</h3>
            {odds ? (
              <div className="mt-3 space-y-3">
                <MarketRow title="Spread" prices={odds.spread} m={m} label={label} movement={movement} disabled={disabled} names={[away?.abbrev, home?.abbrev]} />
                <MarketRow title="Total" prices={odds.total} m={m} label={label} movement={movement} disabled={disabled} names={["Over", "Under"]} />
                <MarketRow title="Moneyline" prices={odds.moneyline} m={m} label={label} movement={movement} disabled={disabled} names={[away?.abbrev, home?.abbrev]} />
                <MarketRow title={`${away?.abbrev} team total`} prices={odds.teamTotals.away} m={m} label={label} movement={movement} disabled={disabled} names={["Over", "Under"]} />
                <MarketRow title={`${home?.abbrev} team total`} prices={odds.teamTotals.home} m={m} label={label} movement={movement} disabled={disabled} names={["Over", "Under"]} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-mist-500">{m.state === "final" ? "This matchup is final." : "Lines will post once projections are published."}</p>
            )}
          </section>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Lineup side={m.away} team={away} accent="ice" />
          <Lineup side={m.home} team={home} accent="volt" />
        </div>
      </div>
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/3 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-mist-500">{label}</p>
      <p className="font-display text-sm font-bold tabular text-mist-50">{value}</p>
    </div>
  );
}

function MarketRow({
  title,
  prices,
  m,
  label,
  movement,
  disabled,
  names,
}: {
  title: string;
  prices: [Price, Price];
  m: PricedMatchup;
  label: string;
  movement: Movement;
  disabled: boolean;
  names: [string | undefined, string | undefined];
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {prices.map((p, i) => (
          <div key={p.selection} className="flex items-center gap-2">
            <span className="w-12 shrink-0 truncate text-xs text-mist-400">{names[i]}</span>
            <OddsButton price={p} matchup={m} matchupLabel={label} movement={movement} disabled={disabled} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
