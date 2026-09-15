import { NextResponse } from "next/server";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { settleOpenBets } from "@/lib/bets";

export const dynamic = "force-dynamic";

export async function GET() {
  await settleOpenBets().catch(() => null);
  const user = await getCurrentUser();
  return NextResponse.json({ user: user ? toPublicUser(user) : null }, { headers: { "Cache-Control": "no-store" } });
}
