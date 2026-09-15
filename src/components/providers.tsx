"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PublicUser } from "@/lib/auth";
import type { LinesPayload, MarketKey, PlaceBetInput, Price, PricedMatchup, Selection } from "@/lib/types";
import { americanToDecimal, decimalToAmerican, formatAmerican } from "@/lib/odds/math";
import { findPrice } from "@/lib/odds/pricing";
import { fmtMoney, marketKey, selectionKey } from "@/lib/format";

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export type Toast = { id: number; kind: "success" | "error" | "info"; title: string; body?: string; ttl?: number };

type ToastCtx = { toasts: Toast[]; push: (t: Omit<Toast, "id">) => void; dismiss: (id: number) => void };
const ToastContext = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside provider");
  return ctx;
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

type UserCtx = {
  user: PublicUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: PublicUser | null) => void;
  signOut: () => Promise<void>;
  authOpen: boolean;
  openAuth: () => void;
  closeAuth: () => void;
};
const UserContext = createContext<UserCtx | null>(null);

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser outside provider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Bet slip
// ---------------------------------------------------------------------------

export type SlipSelection = {
  key: string;
  matchupId: number;
  week: number;
  market: MarketKey;
  selection: Selection;
  teamId: number | null;
  line: number | null;
  american: number;
  decimal: number;
  label: string;
  matchupLabel: string;
  moved: "up" | "down" | "line" | null;
};

type SlipCtx = {
  selections: SlipSelection[];
  mode: "single" | "parlay";
  setMode: (m: "single" | "parlay") => void;
  stakes: Record<string, number>;
  setStake: (key: string, cents: number) => void;
  parlayStake: number;
  setParlayStake: (cents: number) => void;
  toggle: (price: Price, matchup: PricedMatchup, matchupLabel: string) => void;
  isSelected: (key: string) => boolean;
  remove: (key: string) => void;
  clear: () => void;
  syncPrices: (payload: LinesPayload) => void;
  place: () => Promise<boolean>;
  placing: boolean;
  open: boolean;
  setOpen: (o: boolean) => void;
  parlayOdds: { american: number; decimal: number } | null;
  totals: { stake: number; payout: number };
  lastError: string | null;
};
const SlipContext = createContext<SlipCtx | null>(null);

export function useBetSlip() {
  const ctx = useContext(SlipContext);
  if (!ctx) throw new Error("useBetSlip outside provider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AppProviders({ children, initialUser }: { children: ReactNode; initialUser: PublicUser | null }) {
  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = idRef.current++;
      setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
      const ttl = t.ttl ?? (t.kind === "error" ? 7000 : 5000);
      window.setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  // user
  const [user, setUser] = useState<PublicUser | null>(initialUser);
  const [loading, setLoading] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = (await res.json()) as { user: PublicUser | null };
      setUser(data.user);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);
  const signOut = useCallback(async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setUser(null);
    push({ kind: "info", title: "Signed out" });
  }, [push]);

  // slip
  const [selections, setSelections] = useState<SlipSelection[]>([]);
  const [mode, setMode] = useState<"single" | "parlay">("single");
  const [stakes, setStakes] = useState<Record<string, number>>({});
  const [parlayStake, setParlayStake] = useState(2500);
  const [placing, setPlacing] = useState(false);
  const [open, setOpen] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const toggle = useCallback((price: Price, matchup: PricedMatchup, matchupLabel: string) => {
    const key = selectionKey({ matchupId: matchup.id, market: price.market, selection: price.selection, teamId: price.teamId });
    const mk = marketKey({ matchupId: matchup.id, market: price.market, teamId: price.teamId });
    setSelections((prev) => {
      if (prev.some((s) => s.key === key)) return prev.filter((s) => s.key !== key);
      const withoutSameMarket = prev.filter((s) => marketKey(s) !== mk);
      const next: SlipSelection = {
        key,
        matchupId: matchup.id,
        week: matchup.week,
        market: price.market,
        selection: price.selection,
        teamId: price.teamId,
        line: price.line,
        american: price.american,
        decimal: price.decimal,
        label: price.label,
        matchupLabel,
        moved: null,
      };
      return [...withoutSameMarket, next];
    });
    setStakes((s) => (s[key] ? s : { ...s, [key]: 2500 }));
    setLastError(null);
  }, []);

  const isSelected = useCallback((key: string) => selections.some((s) => s.key === key), [selections]);
  const remove = useCallback((key: string) => setSelections((prev) => prev.filter((s) => s.key !== key)), []);
  const clear = useCallback(() => {
    setSelections([]);
    setLastError(null);
  }, []);
  const setStake = useCallback((key: string, cents: number) => setStakes((s) => ({ ...s, [key]: cents })), []);

  /** Keep slip prices in step with the board; flag movement so the user can see it. */
  const syncPrices = useCallback((payload: LinesPayload) => {
    setSelections((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const m = payload.matchups.find((x) => x.id === s.matchupId && x.week === s.week);
        if (!m || !m.odds) return s;
        const p = findPrice(m.odds, s.market, s.selection, s.teamId);
        if (!p) return s;
        if (p.american === s.american && (p.line ?? null) === (s.line ?? null)) return s;
        changed = true;
        const moved: SlipSelection["moved"] =
          (p.line ?? null) !== (s.line ?? null) ? "line" : p.decimal > s.decimal ? "up" : "down";
        return { ...s, american: p.american, decimal: p.decimal, line: p.line, label: p.label, moved };
      });
      return changed ? next : prev;
    });
  }, []);

  const parlayOdds = useMemo(() => {
    if (selections.length < 2) return null;
    const decimal = selections.reduce((p, s) => p * s.decimal, 1);
    return { decimal, american: decimalToAmerican(decimal) };
  }, [selections]);

  const totals = useMemo(() => {
    if (mode === "parlay") {
      const payout = parlayOdds ? Math.round(parlayStake * parlayOdds.decimal) : 0;
      return { stake: selections.length >= 2 ? parlayStake : 0, payout };
    }
    let stake = 0;
    let payout = 0;
    for (const s of selections) {
      const st = stakes[s.key] ?? 0;
      stake += st;
      payout += Math.round(st * s.decimal);
    }
    return { stake, payout };
  }, [mode, parlayOdds, parlayStake, selections, stakes]);

  const place = useCallback(async (): Promise<boolean> => {
    if (!user) {
      setAuthOpen(true);
      return false;
    }
    if (selections.length === 0) return false;
    const wagers: PlaceBetInput[] = [];
    const toInput = (s: SlipSelection) => ({
      matchupId: s.matchupId,
      week: s.week,
      market: s.market,
      selection: s.selection,
      teamId: s.teamId,
      line: s.line,
      american: s.american,
    });
    if (mode === "parlay") {
      if (selections.length < 2) {
        setLastError("Add at least two selections to build a parlay.");
        return false;
      }
      wagers.push({ kind: "parlay", stakeCents: parlayStake, selections: selections.map(toInput) });
    } else {
      for (const s of selections) {
        const st = stakes[s.key] ?? 0;
        if (st > 0) wagers.push({ kind: "single", stakeCents: st, selections: [toInput(s)] });
      }
      if (wagers.length === 0) {
        setLastError("Enter a stake on at least one selection.");
        return false;
      }
    }
    setPlacing(true);
    setLastError(null);
    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wagers }),
      });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        details?: { moved?: Array<{ matchupId: number; market: string; selection: string; line: number | null; american: number }> } | null;
        tickets?: Array<{ betId: number; kind: string; stakeCents: number; americanOdds: number; potentialPayoutCents: number; legs: string[] }>;
        user?: PublicUser | null;
      };
      if (!res.ok) {
        if (data.code === "auth") setAuthOpen(true);
        if (data.code === "odds_changed" && data.details?.moved) {
          const moved = data.details.moved;
          setSelections((prev) =>
            prev.map((s) => {
              const m = moved.find((x) => x.matchupId === s.matchupId && x.market === s.market && x.selection === s.selection);
              if (!m) return s;
              return {
                ...s,
                line: m.line,
                american: m.american,
                decimal: americanToDecimal(m.american),
                moved: (m.line ?? null) !== (s.line ?? null) ? "line" : americanToDecimal(m.american) > s.decimal ? "up" : "down",
              };
            }),
          );
        }
        setLastError(data.error ?? "Could not place bet");
        push({ kind: "error", title: "Bet not placed", body: data.error });
        return false;
      }
      if (data.user) setUser(data.user);
      const tickets = data.tickets ?? [];
      const totalStake = tickets.reduce((s, t) => s + t.stakeCents, 0);
      const totalPayout = tickets.reduce((s, t) => s + t.potentialPayoutCents, 0);
      push({
        kind: "success",
        title: tickets.length === 1 ? `Ticket #${tickets[0].betId} placed` : `${tickets.length} tickets placed`,
        body:
          tickets.length === 1
            ? `${tickets[0].legs.join(" • ")} @ ${formatAmerican(tickets[0].americanOdds)} — to win ${fmtMoney(tickets[0].potentialPayoutCents - tickets[0].stakeCents)}`
            : `${fmtMoney(totalStake)} risked to pay ${fmtMoney(totalPayout)}`,
        ttl: 7000,
      });
      setSelections([]);
      setOpen(false);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setLastError(msg);
      push({ kind: "error", title: "Bet not placed", body: msg });
      return false;
    } finally {
      setPlacing(false);
    }
  }, [mode, parlayStake, push, selections, stakes, user]);

  // Clear "moved" flags after a beat so flashes fade
  useEffect(() => {
    if (!selections.some((s) => s.moved)) return;
    const t = window.setTimeout(() => setSelections((prev) => prev.map((s) => (s.moved ? { ...s, moved: null } : s))), 4000);
    return () => window.clearTimeout(t);
  }, [selections]);

  const userValue = useMemo<UserCtx>(
    () => ({
      user,
      loading,
      refresh,
      setUser,
      signOut,
      authOpen,
      openAuth: () => setAuthOpen(true),
      closeAuth: () => setAuthOpen(false),
    }),
    [user, loading, refresh, signOut, authOpen],
  );

  const slipValue = useMemo<SlipCtx>(
    () => ({
      selections,
      mode,
      setMode,
      stakes,
      setStake,
      parlayStake,
      setParlayStake,
      toggle,
      isSelected,
      remove,
      clear,
      syncPrices,
      place,
      placing,
      open,
      setOpen,
      parlayOdds,
      totals,
      lastError,
    }),
    [selections, mode, stakes, setStake, parlayStake, toggle, isSelected, remove, clear, syncPrices, place, placing, open, parlayOdds, totals, lastError],
  );

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      <UserContext.Provider value={userValue}>
        <SlipContext.Provider value={slipValue}>{children}</SlipContext.Provider>
      </UserContext.Provider>
    </ToastContext.Provider>
  );
}
