"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BetWithLegs, LedgerPoint } from "@/lib/bets";
import { fmtDate, fmtMoney, fmtPts } from "@/lib/format";
import { formatAmerican } from "@/lib/odds/math";
import { marketName } from "./bet-slip";
import { useUser } from "./providers";
import { Icon, Spinner, Stat } from "./ui";

type Tab = "open" | "settled" | "all";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "border-volt-400/30 bg-volt-400/10 text-volt-300",
    won: "border-win-500/40 bg-win-500/10 text-win-400",
    lost: "border-heat-500/40 bg-heat-500/10 text-heat-400",
    push: "border-white/15 bg-white/5 text-mist-300",
    void: "border-white/15 bg-white/5 text-mist-300",
  };
  return <span className={`chip ${map[status] ?? ""}`}>{status}</span>;
}

function LegRow({ leg }: { leg: BetWithLegs["legs"][number] }) {
  const dot = leg.status === "won" ? "bg-win-500" : leg.status === "lost" ? "bg-heat-500" : leg.status === "push" ? "bg-mist-400" : "bg-volt-400";
  return (
    <li className="flex items-start gap-3 py-2">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-mist-50">{leg.label}</p>
        <p className="truncate text-[11px] text-mist-500">
          {marketName(leg.market)} · {leg.awayTeamName} @ {leg.homeTeamName} · Wk {leg.week}
        </p>
        {leg.homeScore !== null && leg.awayScore !== null && (
          <p className="mt-0.5 text-[11px] tabular text-mist-400">
            Final: {leg.awayTeamName} {fmtPts(leg.awayScore)} — {leg.homeTeamName} {fmtPts(leg.homeScore)}
          </p>
        )}
      </div>
      <span className="font-display text-sm font-bold tabular text-mist-200">{formatAmerican(leg.americanOdds)}</span>
    </li>
  );
}

function BetCard({ bet }: { bet: BetWithLegs }) {
  const profit = bet.status === "open" ? bet.potentialPayoutCents - bet.stakeCents : bet.payoutCents - bet.stakeCents;
  return (
    <article className="card rounded-3xl p-4 animate-rise sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusPill status={bet.status} />
          <span className="text-xs text-mist-500">
            {bet.kind === "parlay" ? `${bet.legs.length}-leg parlay` : "Single"} · Ticket #{bet.id}
          </span>
          {bet.source === "demo" && <span className="chip text-mist-500">demo</span>}
        </div>
        <span className="text-xs text-mist-500" suppressHydrationWarning>{fmtDate(bet.placedAt)}</span>
      </header>
      <ul className="mt-2 divide-y divide-white/5">
        {bet.legs.map((l) => (
          <LegRow key={l.id} leg={l} />
        ))}
      </ul>
      <footer className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-ink-950/50 px-3 py-2.5 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-mist-500">Stake</p>
          <p className="font-display text-sm font-bold tabular">{fmtMoney(bet.stakeCents)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-mist-500">Odds</p>
          <p className="font-display text-sm font-bold tabular text-volt-300">{formatAmerican(bet.americanOdds)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-mist-500">{bet.status === "open" ? "To win" : bet.status === "push" ? "Returned" : "Net"}</p>
          <p className={`font-display text-sm font-bold tabular ${bet.status === "lost" ? "text-heat-400" : bet.status === "won" ? "text-win-400" : "text-mist-100"}`}>
            {bet.status === "push" ? fmtMoney(bet.payoutCents) : fmtMoney(profit, { sign: bet.status !== "open" })}
          </p>
        </div>
      </footer>
    </article>
  );
}

function Sparkline({ points }: { points: LedgerPoint[] }) {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const vals = points.map((p) => p.balanceAfterCents);
    const lo = Math.min(...vals, 1_000_000);
    const hi = Math.max(...vals, 1_000_000);
    const W = 600;
    const H = 120;
    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => H - 8 - ((v - lo) / Math.max(1, hi - lo)) * (H - 16);
    const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const base = y(1_000_000);
    return { d, area: `${d}L${W},${H}L0,${H}Z`, base, W, H, up: vals[vals.length - 1] >= 1_000_000 };
  }, [points]);
  if (!path) return <p className="py-8 text-center text-xs text-mist-500">Your bankroll chart appears after your first settled ticket.</p>;
  const stroke = path.up ? "#22d37a" : "#ff3b5c";
  return (
    <svg viewBox={`0 0 ${path.W} ${path.H}`} className="h-28 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2={path.W} y1={path.base} y2={path.base} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
      <path d={path.area} fill="url(#spark)" />
      <path d={path.d} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

export function BetsView({ initialBets, initialLedger }: { initialBets: BetWithLegs[]; initialLedger: LedgerPoint[] }) {
  const { user, openAuth, refresh } = useUser();
  const [bets, setBets] = useState(initialBets);
  const [tab, setTab] = useState<Tab>("open");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/bets", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { bets: BetWithLegs[] };
        setBets(data.bets);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => void reload(), 60_000);
    return () => window.clearInterval(id);
  }, [reload]);

  const stats = useMemo(() => {
    const settled = bets.filter((b) => b.status !== "open");
    const open = bets.filter((b) => b.status === "open");
    const wagered = settled.reduce((s, b) => s + b.stakeCents, 0);
    const returned = settled.reduce((s, b) => s + b.payoutCents, 0);
    return {
      openRisk: open.reduce((s, b) => s + b.stakeCents, 0),
      openToWin: open.reduce((s, b) => s + b.potentialPayoutCents - b.stakeCents, 0),
      net: returned - wagered,
      wins: settled.filter((b) => b.status === "won").length,
      losses: settled.filter((b) => b.status === "lost").length,
      pushes: settled.filter((b) => b.status === "push").length,
      roi: wagered > 0 ? (returned - wagered) / wagered : 0,
    };
  }, [bets]);

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <Icon.Ticket className="mx-auto h-10 w-10 text-mist-600" />
        <h1 className="mt-4 font-display text-2xl font-bold">Sign in to see your tickets</h1>
        <p className="mt-2 text-sm text-mist-400">Create a free account to get a $10,000 bankroll and start betting on your league.</p>
        <button onClick={openAuth} className="btn-primary mt-6">
          <Icon.User /> Sign in
        </button>
      </div>
    );
  }

  const visible = bets.filter((b) => (tab === "all" ? true : tab === "open" ? b.status === "open" : b.status !== "open"));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-volt-400">My bets</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{user.displayName}&apos;s tickets</h1>
        </div>
        <button onClick={() => void reload()} className="btn-ghost text-sm" disabled={busy}>
          {busy ? <Spinner /> : <Icon.Refresh />} Refresh & settle
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Balance" value={fmtMoney(user.balanceCents)} accent="volt" />
        <Stat label="Open risk" value={fmtMoney(stats.openRisk)} sub={`to win ${fmtMoney(stats.openToWin)}`} />
        <Stat label="Settled net" value={fmtMoney(stats.net, { sign: true })} accent={stats.net > 0 ? "win" : stats.net < 0 ? "heat" : undefined} />
        <Stat label="Record" value={`${stats.wins}-${stats.losses}${stats.pushes ? `-${stats.pushes}` : ""}`} sub="W-L-P" />
        <Stat label="ROI" value={`${(stats.roi * 100).toFixed(1)}%`} accent={stats.roi > 0 ? "win" : stats.roi < 0 ? "heat" : undefined} />
      </div>

      <div className="card mt-4 rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mist-500">Bankroll</p>
          <p className="text-[11px] text-mist-500">Dashed line = starting $10,000</p>
        </div>
        <Sparkline points={initialLedger} />
      </div>

      <div className="mt-6 flex items-center gap-1 rounded-xl bg-ink-900/70 p-1 text-sm font-semibold sm:w-fit">
        {(["open", "settled", "all"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-1.5 capitalize transition ${tab === t ? "bg-white/10 text-mist-50" : "text-mist-400 hover:text-mist-200"}`}>
            {t}
            <span className="ml-1.5 text-xs text-mist-500">{t === "all" ? bets.length : t === "open" ? bets.filter((b) => b.status === "open").length : bets.filter((b) => b.status !== "open").length}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card mt-4 rounded-3xl px-6 py-16 text-center">
          <p className="font-semibold">No {tab === "all" ? "" : tab} tickets yet</p>
          <p className="mt-1 text-sm text-mist-500">Head to the board and find an edge.</p>
          <Link href="/" className="btn-primary mt-5 inline-flex">
            Go to the lines
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {visible.map((b) => (
            <BetCard key={b.id} bet={b} />
          ))}
        </div>
      )}
    </div>
  );
}
