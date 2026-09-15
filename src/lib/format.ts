export function fmtMoney(cents: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  let body: string;
  if (opts.compact && abs >= 10000) {
    body = `$${(abs / 1000).toFixed(abs >= 100000 ? 0 : 1)}k`;
  } else {
    body = `$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (dollars < 0) return `-${body}`;
  if (opts.sign && dollars > 0) return `+${body}`;
  return body;
}

export function fmtPts(n: number, digits = 1): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtRecord(t: { wins: number; losses: number; ties: number }): string {
  return t.ties > 0 ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return (words[0][0] + words[1][0] + (words[2]?.[0] ?? "")).toUpperCase();
}

const PALETTES = [
  ["#7c3aed", "#db2777"],
  ["#0ea5e9", "#2dd4bf"],
  ["#f59e0b", "#ef4444"],
  ["#22c55e", "#84cc16"],
  ["#6366f1", "#a855f7"],
  ["#f43f5e", "#fb923c"],
  ["#14b8a6", "#3b82f6"],
  ["#eab308", "#f97316"],
  ["#8b5cf6", "#06b6d4"],
  ["#10b981", "#0ea5e9"],
  ["#e11d48", "#7c3aed"],
  ["#84cc16", "#14b8a6"],
];

export function teamGradient(id: number): string {
  const [a, b] = PALETTES[Math.abs(id) % PALETTES.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function selectionKey(s: { matchupId: number; market: string; selection: string; teamId: number | null }): string {
  return `${s.matchupId}:${s.market}:${s.selection}:${s.teamId ?? "g"}`;
}

export function marketKey(s: { matchupId: number; market: string; teamId: number | null }): string {
  return `${s.matchupId}:${s.market}:${s.market === "team_total" ? (s.teamId ?? "g") : "g"}`;
}
