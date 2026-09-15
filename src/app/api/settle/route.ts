import { NextResponse } from "next/server";
import { settleOpenBets } from "@/lib/bets";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await settleOpenBets({ force: true });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Settlement failed" }, { status: 500 });
  }
}
