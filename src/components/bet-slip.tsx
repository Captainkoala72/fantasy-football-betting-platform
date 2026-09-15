"use client";

import { useMemo } from "react";
import { fmtMoney } from "@/lib/format";
import { formatAmerican } from "@/lib/odds/math";
import { useBetSlip, useUser, type SlipSelection } from "./providers";
import { Icon, Spinner } from "./ui";

const QUICK = [1000, 2500, 5000, 10000, 25000];

function StakeInput({ value, onChange, max }: { value: number; onChange: (c: number) => void; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-mist-500">$</span>
        <input
          type="number"
          min={1}
          step="1"
          max={max ? max / 100 : undefined}
          value={value ? (value / 100).toString() : ""}
          onChange={(e) => {
            const v = Math.max(0, Math.round(Number(e.target.value || 0) * 100));
            onChange(Math.min(v, 500_000));
          }}
          placeholder="0"
          className="input py-2! pl-7! text-right font-display text-base font-bold tabular"
          aria-label="Stake"
        />
      </div>
    </div>
  );
}

function QuickChips({ onPick, active }: { onPick: (c: number) => void; active: number }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {QUICK.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold tabular transition ${
            active === q ? "border-volt-400/60 bg-volt-400/15 text-volt-300" : "border-white/10 bg-white/3 text-mist-300 hover:border-white/25"
          }`}
        >
          ${q / 100}
        </button>
      ))}
    </div>
  );
}

function SelectionRow({ s, showStake }: { s: SlipSelection; showStake: boolean }) {
  const { remove, stakes, setStake } = useBetSlip();
  const stake = stakes[s.key] ?? 0;
  const toWin = Math.round(stake * s.decimal) - stake;
  return (
    <li
      className={`rounded-2xl border p-3 transition ${
        s.moved === "up" ? "border-win-500/40 animate-flash-up" : s.moved === "down" || s.moved === "line" ? "border-heat-500/40 animate-flash-down" : "border-white/8 bg-ink-900/60"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-mist-50">{s.label}</p>
          <p className="truncate text-[11px] text-mist-500">
            {marketName(s.market)} · {s.matchupLabel} · Wk {s.week}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {s.moved && (
            <span className={`flex items-center text-[10px] font-bold ${s.moved === "up" ? "text-win-400" : "text-heat-400"}`}>
              {s.moved === "up" ? <Icon.ArrowUp /> : s.moved === "down" ? <Icon.ArrowDown /> : "moved"}
            </span>
          )}
          <span className="font-display text-base font-bold tabular text-volt-300">{formatAmerican(s.american)}</span>
          <button onClick={() => remove(s.key)} className="ml-1 text-mist-500 hover:text-heat-400" aria-label="Remove">
            <Icon.Close className="h-4 w-4" />
          </button>
        </div>
      </div>
      {showStake && (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <StakeInput value={stake} onChange={(c) => setStake(s.key, c)} />
            </div>
            <div className="w-24 text-right">
              <p className="text-[10px] uppercase tracking-wider text-mist-500">To win</p>
              <p className="font-display text-sm font-bold tabular text-win-400">{fmtMoney(Math.max(0, toWin))}</p>
            </div>
          </div>
          <QuickChips onPick={(c) => setStake(s.key, c)} active={stake} />
        </div>
      )}
    </li>
  );
}

export function marketName(m: string): string {
  switch (m) {
    case "moneyline":
      return "Moneyline";
    case "spread":
      return "Spread";
    case "total":
      return "Total";
    case "team_total":
      return "Team total";
    default:
      return m;
  }
}

export function BetSlipPanel({ variant }: { variant: "sidebar" | "sheet" }) {
  const slip = useBetSlip();
  const { user, openAuth } = useUser();
  const { selections, mode, setMode, parlayOdds, parlayStake, setParlayStake, totals, place, placing, clear, lastError } = slip;

  const sameGame = useMemo(() => {
    const ids = selections.map((s) => s.matchupId);
    return new Set(ids).size !== ids.length;
  }, [selections]);

  const insufficient = user ? totals.stake > user.balanceCents : false;
  const canPlace =
    selections.length > 0 && !placing && totals.stake > 0 && !insufficient && (mode === "single" || (selections.length >= 2 && !sameGame));

  return (
    <div className={`flex h-full flex-col ${variant === "sidebar" ? "" : ""}`}>
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon.Ticket className="h-5 w-5 text-volt-400" />
          <h2 className="font-display text-base font-bold">Bet slip</h2>
          {selections.length > 0 && (
            <span className="rounded-full bg-volt-400 px-2 py-0.5 font-display text-[11px] font-bold text-ink-950">{selections.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selections.length > 0 && (
            <button onClick={clear} className="flex items-center gap-1 text-xs text-mist-500 hover:text-heat-400">
              <Icon.Trash /> Clear
            </button>
          )}
          {variant === "sheet" && (
            <button onClick={() => slip.setOpen(false)} className="text-mist-400 hover:text-mist-100" aria-label="Close bet slip">
              <Icon.Close />
            </button>
          )}
        </div>
      </div>

      {selections.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-white/15 text-mist-500">
            <Icon.Ticket className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-semibold text-mist-200">Your slip is empty</p>
          <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-mist-500">Tap any spread, total or moneyline on the board to start building a ticket.</p>
        </div>
      ) : (
        <>
          <div className="px-4 pt-3">
            <div className="grid grid-cols-2 rounded-xl bg-ink-950/60 p-1 text-sm font-semibold">
              {(["single", "parlay"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg py-1.5 transition ${mode === m ? "bg-white/10 text-mist-50" : "text-mist-400 hover:text-mist-200"}`}
                >
                  {m === "single" ? "Singles" : `Parlay${selections.length >= 2 && parlayOdds ? ` · ${formatAmerican(parlayOdds.american)}` : ""}`}
                </button>
              ))}
            </div>
          </div>

          <ul className="flex-1 space-y-2 overflow-y-auto scrollbar-thin px-4 py-3">
            {selections.map((s) => (
              <SelectionRow key={s.key} s={s} showStake={mode === "single"} />
            ))}
          </ul>

          <div className="border-t border-white/5 px-4 pb-4 pt-3">
            {mode === "parlay" && (
              <div className="mb-3 rounded-2xl border border-white/8 bg-ink-900/60 p-3">
                {selections.length < 2 ? (
                  <p className="text-xs text-mist-400">Add one more selection from a different matchup to build a parlay.</p>
                ) : sameGame ? (
                  <p className="flex items-center gap-2 text-xs text-heat-400">
                    <Icon.Alert /> Parlays can only include one selection per matchup.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{selections.length}-leg parlay</p>
                      <p className="font-display text-lg font-bold tabular text-volt-300">{parlayOdds ? formatAmerican(parlayOdds.american) : "—"}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1">
                        <StakeInput value={parlayStake} onChange={setParlayStake} />
                      </div>
                      <div className="w-24 text-right">
                        <p className="text-[10px] uppercase tracking-wider text-mist-500">To win</p>
                        <p className="font-display text-sm font-bold tabular text-win-400">{fmtMoney(Math.max(0, totals.payout - totals.stake))}</p>
                      </div>
                    </div>
                    <QuickChips onPick={setParlayStake} active={parlayStake} />
                  </>
                )}
              </div>
            )}

            <div className="flex items-end justify-between text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-mist-500">Total stake</p>
                <p className="font-display text-lg font-bold tabular">{fmtMoney(totals.stake)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-mist-500">Potential payout</p>
                <p className="font-display text-lg font-bold tabular text-win-400">{fmtMoney(totals.payout)}</p>
              </div>
            </div>

            {lastError && (
              <p className="mt-2 flex items-start gap-2 rounded-xl border border-heat-500/30 bg-heat-500/10 px-3 py-2 text-xs text-heat-400">
                <Icon.Alert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {lastError}
              </p>
            )}
            {insufficient && !lastError && (
              <p className="mt-2 text-xs text-heat-400">Stake exceeds your balance of {fmtMoney(user?.balanceCents ?? 0)}.</p>
            )}

            {user ? (
              <button onClick={() => void place()} disabled={!canPlace} className="btn-primary mt-3 w-full">
                {placing ? <Spinner /> : <Icon.Bolt />}
                {placing ? "Placing…" : mode === "parlay" ? "Place parlay" : `Place ${selections.filter((s) => (slip.stakes[s.key] ?? 0) > 0).length || ""} bet${selections.length === 1 ? "" : "s"}`}
              </button>
            ) : (
              <button onClick={openAuth} className="btn-primary mt-3 w-full">
                <Icon.User /> Sign in to place bet
              </button>
            )}
            <p className="mt-2 text-center text-[10px] text-mist-500">Min $1 · Max $5,000 per ticket · Max payout $250,000</p>
          </div>
        </>
      )}
    </div>
  );
}

/** Desktop sticky sidebar + mobile bottom sheet. */
export function BetSlip() {
  const { open, setOpen, selections } = useBetSlip();
  return (
    <>
      <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] xl:block">
        <div className="card flex h-full flex-col overflow-hidden rounded-3xl">
          <BetSlipPanel variant="sidebar" />
        </div>
      </aside>

      {selections.length > 0 && !open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-volt-400 py-3 pl-4 pr-5 font-semibold text-ink-950 shadow-glow-volt xl:hidden"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-950 font-display text-xs font-bold text-volt-300">{selections.length}</span>
          Open bet slip
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[80] xl:hidden">
          <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm animate-fade" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-3xl glass shadow-float animate-sheet-up">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15" />
            <div className="max-h-[calc(88vh-1rem)] overflow-y-auto">
              <BetSlipPanel variant="sheet" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
