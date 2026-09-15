"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LeagueTeam, LinesPayload, PricedMatchup } from "@/lib/types";
import { fmtPts, fmtRecord, selectionKey, timeAgo } from "@/lib/format";
import { formatAmerican, formatLine, formatPct } from "@/lib/odds/math";
import { BetSlip } from "./bet-slip";
import { GameCard, MatchupModal, type Movement } from "./matchup";
import { useBetSlip, useToast, useUser } from "./providers";
import { Icon, LiveDot, Spinner, TeamBadge } from "./ui";

function collectPrices(p: LinesPayload): Map<string, { american: number; decimal: number }> {
  const out = new Map<string, { american: number; decimal: number }>();
  for (const m of p.matchups) {
    if (!m.odds) continue;
    const all = [...m.odds.spread, ...m.odds.total, ...m.odds.moneyline, ...m.odds.teamTotals.home, ...m.odds.teamTotals.away];
    for (const pr of all) {
      out.set(selectionKey({ matchupId: m.id, market: pr.market, selection: pr.selection, teamId: pr.teamId }), { american: pr.american, decimal: pr.decimal });
    }
  }
  return out;
}

export function Sportsbook({ initial }: { initial: LinesPayload }) {
  const [data, setData] = useState<LinesPayload>(initial);
  const [week, setWeek] = useState(initial.week);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [movement, setMovement] = useState<Movement>({});
  const [detail, setDetail] = useState<PricedMatchup | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const prevPrices = useRef(collectPrices(initial));
  const { syncPrices } = useBetSlip();
  const { refresh: refreshUser } = useUser();
  const { push } = useToast();

  const teams = useMemo(() => new Map<number, LeagueTeam>(data.teams.map((t) => [t.id, t])), [data.teams]);

  const load = useCallback(
    async (w: number, opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetch(`/api/lines?week=${w}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Lines request failed (${res.status})`);
        const payload = (await res.json()) as LinesPayload;
        if (payload.week === w || !opts.silent) {
          const next = collectPrices(payload);
          const mv: Movement = {};
          if (payload.week === week) {
            for (const [k, v] of next) {
              const prev = prevPrices.current.get(k);
              if (prev && prev.decimal !== v.decimal) mv[k] = v.decimal > prev.decimal ? "up" : "down";
            }
          }
          prevPrices.current = next;
          setMovement(mv);
          setData(payload);
          setNow(Date.now());
          syncPrices(payload);
          setDetail((d) => (d ? (payload.matchups.find((m) => m.id === d.id) ?? d) : d));
          if (Object.keys(mv).length) window.setTimeout(() => setMovement({}), 2500);
        }
      } catch (err) {
        if (!opts.silent) push({ kind: "error", title: "Couldn't load lines", body: err instanceof Error ? err.message : undefined });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [push, syncPrices, week],
  );

  const changeWeek = (w: number) => {
    if (w === week) return;
    setWeek(w);
    const url = new URL(window.location.href);
    url.searchParams.set("week", String(w));
    window.history.replaceState(null, "", url.toString());
    void load(w);
  };

  // Poll for live odds
  useEffect(() => {
    const interval = data.weekState === "live" ? 30_000 : data.weekState === "upcoming" ? 60_000 : 300_000;
    const id = window.setInterval(() => void load(week, { silent: true }), interval);
    return () => window.clearInterval(id);
  }, [data.weekState, load, week]);

  // tick "updated x ago"
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const advanceDemo = async () => {
    setAdvancing(true);
    try {
      const res = await fetch("/api/demo/advance", { method: "POST" });
      const body = (await res.json()) as { state?: { week: number }; settled?: { settledBets: number }; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed");
      push({
        kind: "success",
        title: `Week ${body.state ? body.state.week - 1 || 14 : ""} is final`,
        body: body.settled?.settledBets ? `${body.settled.settledBets} ticket${body.settled.settledBets === 1 ? "" : "s"} settled. Check My Bets.` : "Board rolled to the next week.",
      });
      const nextWeek = body.state?.week ?? week;
      setWeek(nextWeek);
      await load(nextWeek);
      await refreshUser();
    } catch (err) {
      push({ kind: "error", title: "Could not advance", body: err instanceof Error ? err.message : undefined });
    } finally {
      setAdvancing(false);
    }
  };

  const live = data.matchups.filter((m) => m.state === "live").length;
  const openCount = data.matchups.filter((m) => m.bettable).length;
  const biggestFav = data.matchups
    .filter((m) => m.odds)
    .map((m) => ({ m, p: Math.max(m.odds!.homeWinProb, 1 - m.odds!.homeWinProb) }))
    .sort((a, b) => b.p - a.p)[0];
  const closest = data.matchups
    .filter((m) => m.odds)
    .sort((a, b) => Math.abs(a.odds!.expectedMargin) - Math.abs(b.odds!.expectedMargin))[0];
  const highestTotal = data.matchups.filter((m) => m.odds).sort((a, b) => b.odds!.expectedTotal - a.odds!.expectedTotal)[0];
  const weekMeta = data.weeks.find((w) => w.week === week);

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-24 sm:px-6">
      {/* Hero */}
      <section className="relative mt-4 overflow-hidden rounded-3xl border border-white/6">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/images/hero-stadium.jpg)" }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/30" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent" aria-hidden />
        <div className="absolute inset-0 field-grid opacity-60" aria-hidden />
        <div className="relative px-5 py-7 sm:px-8 sm:py-9">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="chip border-volt-400/30 bg-volt-400/10 text-volt-300">
              <Icon.Bolt className="h-3 w-3" /> {data.mode === "demo" ? "Demo league" : "Connected to ESPN"}
            </span>
            <span className="chip">{data.league.season} season</span>
            <span className="chip">{data.league.teamCount} teams</span>
            {live > 0 && (
              <span className="chip border-heat-500/40 bg-heat-500/10 text-heat-400">
                <LiveDot /> {live} live
              </span>
            )}
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            <span className="text-gradient">{data.league.name}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-mist-300 sm:text-base">
            {weekMeta?.label ?? `Week ${week}`} board · {openCount > 0 ? `${openCount} matchup${openCount === 1 ? "" : "s"} open for betting` : data.weekState === "final" ? "All matchups final" : "Lines pending"}
            {" · "}
            <span className="text-mist-500" suppressHydrationWarning>updated {timeAgo(data.generatedAt)}</span>
            {refreshing && <Spinner className="ml-2 inline h-3 w-3 text-mist-500" />}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-3xl">
            <HeroStat
              label="Biggest favorite"
              value={biggestFav ? `${teams.get(biggestFav.m.odds!.homeWinProb >= 0.5 ? biggestFav.m.home.teamId : biggestFav.m.away.teamId)?.abbrev ?? ""} ${formatPct(biggestFav.p)}` : "—"}
              sub={biggestFav ? formatAmerican(biggestFav.m.odds!.homeWinProb >= 0.5 ? biggestFav.m.odds!.moneyline[1].american : biggestFav.m.odds!.moneyline[0].american) : ""}
            />
            <HeroStat
              label="Closest matchup"
              value={closest ? `${teams.get(closest.away.teamId)?.abbrev} @ ${teams.get(closest.home.teamId)?.abbrev}` : "—"}
              sub={closest ? `spread ${formatLine(closest.odds!.spread[1].line ?? 0)}` : ""}
            />
            <HeroStat label="Highest total" value={highestTotal ? fmtPts(highestTotal.odds!.expectedTotal) : "—"} sub={highestTotal ? `${teams.get(highestTotal.away.teamId)?.abbrev} @ ${teams.get(highestTotal.home.teamId)?.abbrev}` : ""} />
            <HeroStat label="Book hold" value="4.55%" sub="−110 / −110 baseline" />
          </div>
        </div>
      </section>

      {/* Warnings / demo controls */}
      {data.warning && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-gold-400/30 bg-gold-400/10 px-4 py-3 text-sm text-gold-400">
          <Icon.Alert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{data.warning}</p>
        </div>
      )}
      {data.mode === "demo" && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/8 bg-ink-800/60 px-4 py-3 text-sm sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-semibold text-mist-100">You&apos;re looking at the demo league.</p>
            <p className="text-xs text-mist-400">
              Set <code className="rounded bg-white/8 px-1 py-0.5 text-[11px]">ESPN_LEAGUE_ID</code>, <code className="rounded bg-white/8 px-1 py-0.5 text-[11px]">espn_s2</code> and{" "}
              <code className="rounded bg-white/8 px-1 py-0.5 text-[11px]">SWID</code> to price your own league. Meanwhile, place bets and fast-forward to see them settle.
            </p>
          </div>
          <button onClick={() => void advanceDemo()} disabled={advancing} className="btn-ghost whitespace-nowrap text-sm">
            {advancing ? <Spinner /> : <Icon.Play />} Simulate Week {data.league.currentWeek} results
          </button>
        </div>
      )}

      {/* Ticker */}
      {data.matchups.some((m) => m.odds) && (
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/6 bg-ink-900/70">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-ink-900 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-ink-900 to-transparent" />
          <div className="flex w-max animate-marquee gap-10 whitespace-nowrap px-4 py-2 text-xs">
            {[0, 1].map((rep) =>
              data.matchups
                .filter((m) => m.odds)
                .map((m) => (
                  <button key={`${rep}-${m.id}`} onClick={() => setDetail(m)} className="flex items-center gap-2 text-mist-300 hover:text-mist-50">
                    {m.state === "live" && <LiveDot />}
                    <span className="font-semibold">{teams.get(m.away.teamId)?.abbrev}</span>
                    <span className="tabular text-mist-500">{formatLine(m.odds!.spread[0].line ?? 0)}</span>
                    <span className="text-mist-600">@</span>
                    <span className="font-semibold">{teams.get(m.home.teamId)?.abbrev}</span>
                    <span className="tabular text-mist-500">{formatLine(m.odds!.spread[1].line ?? 0)}</span>
                    <span className="text-mist-600">·</span>
                    <span className="tabular text-volt-300">O/U {formatLine(m.odds!.total[0].line ?? 0, { signed: false })}</span>
                  </button>
                )),
            )}
          </div>
        </div>
      )}

      {/* Mobile week selector */}
      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
        {data.weeks.map((w) => (
          <button
            key={w.week}
            onClick={() => changeWeek(w.week)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              w.week === week ? "border-volt-400/60 bg-volt-400/15 text-volt-300" : "border-white/10 text-mist-400"
            }`}
          >
            {w.state === "live" && <LiveDot />}
            {w.isPlayoff ? w.label : `Wk ${w.week}`}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_360px]">
        {/* Left rail */}
        <aside className="hidden space-y-4 lg:block">
          <div className="card rounded-3xl p-3">
            <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-mist-500">Schedule</p>
            <ul className="max-h-[420px] space-y-0.5 overflow-y-auto scrollbar-thin pr-1">
              {data.weeks.map((w) => (
                <li key={w.week}>
                  <button
                    onClick={() => changeWeek(w.week)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                      w.week === week ? "bg-volt-400/12 text-volt-300" : "text-mist-300 hover:bg-white/5"
                    }`}
                  >
                    <span className="font-medium">{w.label}</span>
                    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-mist-500">
                      {w.state === "live" ? (
                        <>
                          <LiveDot /> live
                        </>
                      ) : w.state === "final" ? (
                        "final"
                      ) : w.state === "upcoming" ? (
                        <span className="text-volt-400">open</span>
                      ) : (
                        "—"
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <Standings teams={data.teams} />
        </aside>

        {/* Board */}
        <main className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">
              {weekMeta?.label ?? `Week ${week}`} <span className="text-mist-500">· {data.matchups.length} games</span>
            </h2>
            <button onClick={() => void load(week, { silent: true })} className="flex items-center gap-1.5 text-xs text-mist-400 hover:text-mist-100" disabled={refreshing}>
              {refreshing ? <Spinner className="h-3.5 w-3.5" /> : <Icon.Refresh className="h-3.5 w-3.5" />} Refresh
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-40 rounded-3xl" />
              ))}
            </div>
          ) : data.matchups.length === 0 ? (
            <div className="card flex flex-col items-center justify-center rounded-3xl px-6 py-20 text-center">
              <Icon.Lock className="h-8 w-8 text-mist-600" />
              <p className="mt-4 font-semibold">No lines for this week yet</p>
              <p className="mt-1 max-w-sm text-sm text-mist-500">
                Lines are generated from ESPN&apos;s weekly projections, which are published for the current week and the one after it.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.matchups.map((m, i) => (
                <GameCard key={m.id} m={m} teams={teams} movement={movement} onDetails={setDetail} index={i} />
              ))}
            </div>
          )}

          <div className="mt-5 lg:hidden">
            <Standings teams={data.teams} />
          </div>
        </main>

        <BetSlip />
      </div>

      <MatchupModal m={detail} teams={teams} movement={movement} onClose={() => setDetail(null)} />
    </div>
  );
}

function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-ink-950/50 px-3.5 py-3 backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">{label}</p>
      <p className="mt-1 truncate font-display text-lg font-bold tabular text-mist-50">{value}</p>
      {sub && <p className="truncate text-[11px] tabular text-mist-400">{sub}</p>}
    </div>
  );
}

function Standings({ teams }: { teams: LeagueTeam[] }) {
  return (
    <div className="card rounded-3xl p-3">
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mist-500">Standings</p>
        <p className="text-[10px] uppercase tracking-wider text-mist-600">W-L · PF</p>
      </div>
      <ul className="space-y-0.5">
        {teams.map((t, i) => (
          <li key={t.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-white/4">
            <span className="w-4 text-right text-[11px] tabular text-mist-500">{i + 1}</span>
            <TeamBadge id={t.id} name={t.name} abbrev={t.abbrev} logo={t.logo} size={24} />
            <span className="min-w-0 flex-1 truncate text-mist-100">{t.name}</span>
            <span className="tabular text-xs font-semibold text-mist-200">{fmtRecord(t)}</span>
            <span className="w-12 text-right tabular text-[11px] text-mist-500">{fmtPts(t.pointsFor, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
