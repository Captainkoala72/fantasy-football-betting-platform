import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { BetError, listUserBets, placeWagers, settleOpenBets } from "@/lib/bets";
import type { PlaceBetInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await settleOpenBets().catch(() => null);
  const bets = await listUserBets(user.id);
  return NextResponse.json({ bets }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to place a bet", code: "auth" }, { status: 401 });
  let body: { wagers?: PlaceBetInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 });
  }
  try {
    const result = await placeWagers(user, body.wagers ?? []);
    const fresh = await getCurrentUser();
    return NextResponse.json({ ...result, user: fresh ? toPublicUser(fresh) : null });
  } catch (err) {
    if (err instanceof BetError) {
      return NextResponse.json({ error: err.message, code: err.code, details: err.details ?? null }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Could not place bet";
    return NextResponse.json({ error: message, code: "server" }, { status: 500 });
  }
}
