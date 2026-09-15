"use client";

import { useEffect, useState, type ReactNode } from "react";
import { initials, teamGradient } from "@/lib/format";
import { useToast } from "./providers";

// ---------------------------------------------------------------------------
// Icons (inline, no dependency)
// ---------------------------------------------------------------------------

type IconProps = { className?: string };

export const Icon = {
  Logo: ({ className = "h-6 w-6" }: IconProps) => (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="ll-logo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#dbff7a" />
          <stop offset="1" stopColor="#2dd4bf" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="url(#ll-logo)" strokeWidth="2" />
      <path d="M8 22 L14 12 L18 18 L24 9" stroke="url(#ll-logo)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="9" r="2.2" fill="#dbff7a" />
    </svg>
  ),
  Ticket: ({ className = "h-5 w-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5V8Z" />
      <path d="M13 6v12" strokeDasharray="2 2" />
    </svg>
  ),
  Close: ({ className = "h-5 w-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  ),
  Trash: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeLinecap="round" />
    </svg>
  ),
  Info: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6M12 7.5v.5" strokeLinecap="round" />
    </svg>
  ),
  Check: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={className} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Alert: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden>
      <path d="M12 3l9.5 17h-19L12 3Z" strokeLinejoin="round" />
      <path d="M12 10v4M12 17v.5" strokeLinecap="round" />
    </svg>
  ),
  Bolt: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  ),
  Lock: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  ChevronRight: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ArrowUp: ({ className = "h-3 w-3" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ArrowDown: ({ className = "h-3 w-3" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden>
      <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Trophy: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Refresh: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Play: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M7 5v14l12-7L7 5Z" />
    </svg>
  ),
  User: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" strokeLinecap="round" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Team badge
// ---------------------------------------------------------------------------

export function TeamBadge({
  id,
  name,
  abbrev,
  logo,
  size = 40,
  className = "",
}: {
  id: number;
  name: string;
  abbrev?: string;
  logo: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = logo && !failed;
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ring-1 ring-white/10 ${className}`}
      style={{ width: size, height: size, background: showImg ? "#0e1424" : teamGradient(id) }}
      title={name}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={name} className="h-full w-full object-cover" onError={() => setFailed(true)} referrerPolicy="no-referrer" />
      ) : (
        <span
          className="absolute inset-0 flex items-center justify-center font-display font-bold tracking-tight text-white drop-shadow"
          style={{ fontSize: Math.max(10, size * 0.3) }}
        >
          {(abbrev && abbrev.length <= 4 ? abbrev : initials(name)).slice(0, 4)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live dot / status pill
// ---------------------------------------------------------------------------

export function LiveDot({ className = "" }: IconProps) {
  return <span className={`inline-block h-2 w-2 rounded-full bg-heat-500 animate-pulse-dot ${className}`} />;
}

export function StatePill({ state }: { state: "upcoming" | "live" | "final" | "pending" }) {
  if (state === "live")
    return (
      <span className="chip border-heat-500/40 bg-heat-500/10 text-heat-400">
        <LiveDot /> Live
      </span>
    );
  if (state === "final") return <span className="chip text-mist-400">Final</span>;
  if (state === "pending") return <span className="chip text-mist-500">Lines pending</span>;
  return <span className="chip border-volt-400/30 bg-volt-400/10 text-volt-300">Open</span>;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  children,
  size = "lg",
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "lg" | "xl";
  label?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const width = size === "sm" ? "max-w-md" : size === "xl" ? "max-w-5xl" : "max-w-3xl";
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal aria-label={label}>
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm animate-fade" onClick={onClose} />
      <div
        className={`relative w-full ${width} max-h-[92vh] overflow-y-auto scrollbar-thin rounded-t-3xl sm:rounded-3xl glass shadow-float animate-pop`}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast stack
// ---------------------------------------------------------------------------

export function ToastStack() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto w-full max-w-sm rounded-2xl border p-4 shadow-float animate-rise ${
            t.kind === "success"
              ? "border-win-500/40 bg-ink-800/95"
              : t.kind === "error"
                ? "border-heat-500/40 bg-ink-800/95"
                : "border-white/10 bg-ink-800/95"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                t.kind === "success" ? "bg-win-500/20 text-win-400" : t.kind === "error" ? "bg-heat-500/20 text-heat-400" : "bg-white/10 text-mist-200"
              }`}
            >
              {t.kind === "success" ? <Icon.Check /> : t.kind === "error" ? <Icon.Alert /> : <Icon.Info />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-mist-50">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs leading-relaxed text-mist-300">{t.body}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-mist-500 hover:text-mist-200" aria-label="Dismiss">
              <Icon.Close className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: "volt" | "heat" | "win" | "gold" }) {
  const color =
    accent === "volt" ? "text-volt-300" : accent === "heat" ? "text-heat-400" : accent === "win" ? "text-win-400" : accent === "gold" ? "text-gold-400" : "text-mist-50";
  return (
    <div className="card rounded-2xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mist-500">{label}</p>
      <p className={`mt-1.5 font-display text-2xl font-bold tabular ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-mist-400">{sub}</p>}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
