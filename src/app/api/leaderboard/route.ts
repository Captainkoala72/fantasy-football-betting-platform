import { NextResponse } from "next/server";
import { getLeaderboard, settleOpenBets } from "@/lib/bets";

export const dynamic = "force-dynamic";

export async function GET() {
  await settleOpenBets().catch(() => null);
  const entries = await getLeaderboard();
  return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}
