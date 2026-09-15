import { NextRequest, NextResponse } from "next/server";
import { getLines } from "@/lib/lines";
import { settleOpenBets } from "@/lib/bets";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const weekRaw = req.nextUrl.searchParams.get("week");
  const week = weekRaw && /^\d+$/.test(weekRaw) ? Number(weekRaw) : null;
  try {
    const [payload] = await Promise.all([getLines(week), settleOpenBets().catch(() => null)]);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load lines";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
