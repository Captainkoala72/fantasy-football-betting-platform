"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PublicUser } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";
import { useBetSlip, useToast, useUser } from "./providers";
import { Icon, Modal, Spinner } from "./ui";

const NAV = [
  { href: "/", label: "Lines" },
  { href: "/bets", label: "My Bets" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/how-it-works", label: "How odds work" },
];

export function TopNav() {
  const pathname = usePathname();
  const { user, openAuth, signOut } = useUser();
  const { selections, setOpen } = useBetSlip();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [prevBalance, setPrevBalance] = useState(user?.balanceCents ?? 0);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.balanceCents !== prevBalance) {
      setFlash(user.balanceCents > prevBalance ? "up" : "down");
      setPrevBalance(user.balanceCents);
      const t = window.setTimeout(() => setFlash(null), 1600);
      return () => window.clearTimeout(t);
    }
  }, [user, prevBalance]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Icon.Logo className="h-8 w-8" />
          <span className="font-display text-lg font-bold tracking-tight">
            League<span className="text-volt-400">Lines</span>
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  active ? "bg-white/8 text-mist-50" : "text-mist-400 hover:bg-white/5 hover:text-mist-100"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <div
                className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 sm:flex ${
                  flash === "up" ? "border-win-500/60 animate-flash-up" : flash === "down" ? "border-heat-500/50 animate-flash-down" : "border-white/10 bg-white/3"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">Balance</span>
                <span className="font-display text-base font-bold tabular text-volt-300">{fmtMoney(user.balanceCents)}</span>
              </div>
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenu((m) => !m)}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/3 py-1.5 pl-1.5 pr-3 text-sm hover:border-white/20"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-volt-400 to-ice-500 font-display text-xs font-bold text-ink-950">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden font-medium sm:inline">{user.displayName}</span>
                </button>
                {menu && (
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl glass shadow-float animate-pop">
                    <div className="border-b border-white/5 px-4 py-3">
                      <p className="text-xs text-mist-500">Signed in as</p>
                      <p className="truncate font-semibold">@{user.username}</p>
                      <p className="mt-1 font-display text-lg font-bold text-volt-300 sm:hidden">{fmtMoney(user.balanceCents)}</p>
                    </div>
                    <Link href="/bets" onClick={() => setMenu(false)} className="block px-4 py-2.5 text-sm hover:bg-white/5">
                      My bets
                    </Link>
                    <Link href="/leaderboard" onClick={() => setMenu(false)} className="block px-4 py-2.5 text-sm hover:bg-white/5">
                      Leaderboard
                    </Link>
                    <button
                      onClick={() => {
                        setMenu(false);
                        void signOut();
                      }}
                      className="block w-full px-4 py-2.5 text-left text-sm text-heat-400 hover:bg-white/5"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button onClick={openAuth} className="btn-primary px-4! py-2! text-sm">
              <Icon.User /> Sign in
            </button>
          )}

          <button
            onClick={() => setOpen(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/3 text-mist-100 hover:border-white/20 xl:hidden"
            aria-label="Open bet slip"
          >
            <Icon.Ticket />
            {selections.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-volt-400 px-1 font-display text-[11px] font-bold text-ink-950">
                {selections.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-white/8 text-mist-50" : "text-mist-400"}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <AuthDialog />
    </header>
  );
}

// ---------------------------------------------------------------------------
// Auth dialog
// ---------------------------------------------------------------------------

export function AuthDialog() {
  const { authOpen, closeAuth, setUser } = useUser();
  const { push } = useToast();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authOpen) setError(null);
  }, [authOpen]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, username, displayName: displayName || username, pin }),
      });
      const data = (await res.json()) as { user?: PublicUser; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setUser(data.user);
      closeAuth();
      push({
        kind: "success",
        title: mode === "signup" ? `Welcome, ${data.user.displayName}!` : `Welcome back, ${data.user.displayName}`,
        body: mode === "signup" ? "Your $10,000 bankroll is loaded. Good luck." : `Balance: ${fmtMoney(data.user.balanceCents)}`,
      });
      setPin("");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={authOpen} onClose={closeAuth} size="sm" label="Sign in">
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-volt-400">Play-money sportsbook</p>
            <h2 className="mt-1 font-display text-2xl font-bold">{mode === "signup" ? "Open your account" : "Welcome back"}</h2>
            <p className="mt-1 text-sm text-mist-400">
              {mode === "signup" ? "Pick a username and a PIN. You start with $10,000." : "Enter your username and PIN to continue."}
            </p>
          </div>
          <button onClick={closeAuth} className="text-mist-500 hover:text-mist-100" aria-label="Close">
            <Icon.Close />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 rounded-xl bg-ink-950/60 p-1 text-sm font-semibold">
          {(["signup", "signin"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg py-2 transition ${mode === m ? "bg-white/10 text-mist-50" : "text-mist-400 hover:text-mist-200"}`}
            >
              {m === "signup" ? "Create account" : "Sign in"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-mist-400">Username</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. commish"
              autoComplete="username"
              required
              minLength={3}
              maxLength={20}
            />
          </label>
          {mode === "signup" && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-mist-400">Display name</span>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How you appear on the leaderboard" maxLength={32} />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-mist-400">PIN (4–8 digits)</span>
            <input
              className="input tracking-[0.4em]"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="••••"
              inputMode="numeric"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={4}
            />
          </label>
          {error && (
            <p className="flex items-center gap-2 rounded-xl border border-heat-500/30 bg-heat-500/10 px-3 py-2 text-sm text-heat-400">
              <Icon.Alert /> {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner /> : mode === "signup" ? "Create account & claim $10,000" : "Sign in"}
          </button>
          <p className="text-center text-[11px] text-mist-500">No real money. Ever. This is a private league game.</p>
        </form>
      </div>
    </Modal>
  );
}
