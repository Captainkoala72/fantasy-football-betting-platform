import { Sportsbook } from "@/components/sportsbook";
import { settleOpenBets } from "@/lib/bets";
import { getLines } from "@/lib/lines";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const weekNum = week && /^\d+$/.test(week) ? Number(week) : null;
  const [lines] = await Promise.all([getLines(weekNum), settleOpenBets().catch(() => null)]);
  return <Sportsbook initial={lines} />;
}
