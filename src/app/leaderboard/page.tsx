import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getLeaderboard, settleOpenBets } from "@/lib/bets";
import { fmtMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  await settleOpenBets().catch(() => null);
  const [entries, me] = await Promise.all([getLeaderboard(), getCurrentUser()]);
  const podium = entries.slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-volt-400">Leaderboard</p>
      <h1 className="mt-1 font-display text-3xl font-bold">Sharpest bettors in the league</h1>
      <p className="mt-1 text-sm text-mist-400">Ranked by equity (cash + open stakes) relative to the $10,000 starting bankroll.</p>

      {podium.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {podium.map((e, i) => (
            <div key={e.id} className={`card relative overflow-hidden rounded-3xl p-5 ${i === 0 ? "sm:order-2 border-gold-400/40" : i === 1 ? "sm:order-1" : "sm:order-3"}`}>
              {i === 0 && <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gold-400/15 blur-2xl" />}
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl font-display text-lg font-bold ${i === 0 ? "bg-gold-400 text-ink-950" : i === 1 ? "bg-mist-200 text-ink-950" : "bg-[#c77b3a] text-ink-950"}`}>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{e.displayName}</p>
                  <p className="truncate text-xs text-mist-500">@{e.username}</p>
                </div>
                {i === 0 && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ml-auto h-5 w-5 text-gold-400" aria-hidden>
                    <path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <p className={`mt-4 font-display text-2xl font-bold tabular ${e.profitCents >= 0 ? "text-win-400" : "text-heat-400"}`}>{fmtMoney(e.profitCents, { sign: true })}</p>
              <p className="text-xs text-mist-500">
                {e.wins}-{e.losses}
                {e.pushes ? `-${e.pushes}` : ""} · ROI {(e.roi * 100).toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="card mt-6 overflow-hidden rounded-3xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-[0.14em] text-mist-500">
              <th className="px-4 py-3 font-semibold">#</th>
              <th className="px-4 py-3 font-semibold">Bettor</th>
              <th className="px-4 py-3 text-right font-semibold">Balance</th>
              <th className="px-4 py-3 text-right font-semibold">Profit</th>
              <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Record</th>
              <th className="hidden px-4 py-3 text-right font-semibold md:table-cell">ROI</th>
              <th className="hidden px-4 py-3 text-right font-semibold md:table-cell">Biggest win</th>
              <th className="hidden px-4 py-3 text-right font-semibold lg:table-cell">Open</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-mist-500">
                  No bettors yet. Be the first to open an account.
                </td>
              </tr>
            )}
            {entries.map((e, i) => {
              const isMe = me?.id === e.id;
              return (
                <tr key={e.id} className={`border-b border-white/4 ${isMe ? "bg-volt-400/6" : "hover:bg-white/3"}`}>
                  <td className="px-4 py-3 tabular text-mist-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-ink-500 to-ink-700 font-display text-xs font-bold text-mist-100 ring-1 ring-white/10">
                        {e.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {e.displayName} {isMe && <span className="ml-1 rounded bg-volt-400/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-volt-300">you</span>}
                        </p>
                        <p className="truncate text-xs text-mist-500">@{e.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-display font-bold tabular">{fmtMoney(e.balanceCents)}</td>
                  <td className={`px-4 py-3 text-right font-display font-bold tabular ${e.profitCents > 0 ? "text-win-400" : e.profitCents < 0 ? "text-heat-400" : "text-mist-300"}`}>
                    {fmtMoney(e.profitCents, { sign: true })}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular text-mist-300 sm:table-cell">
                    {e.wins}-{e.losses}
                    {e.pushes ? `-${e.pushes}` : ""}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular text-mist-300 md:table-cell">{(e.roi * 100).toFixed(1)}%</td>
                  <td className="hidden px-4 py-3 text-right tabular text-mist-300 md:table-cell">{e.biggestWinCents > 0 ? fmtMoney(e.biggestWinCents) : "—"}</td>
                  <td className="hidden px-4 py-3 text-right tabular text-mist-300 lg:table-cell">{e.open}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
