import { NextResponse } from "next/server";
import { advanceDemoWeek } from "@/lib/demo/league";
import { getSnapshot } from "@/lib/lines";
import { settleOpenBets } from "@/lib/bets";

export const dynamic = "force-dynamic";

/** Demo-only: finalize the current week, settle tickets and open the next week's board. */
export async function POST() {
  const { snapshot } = await getSnapshot();
  if (snapshot.source !== "demo") {
    return NextResponse.json({ error: "Only available in demo mode" }, { status: 400 });
  }
  const state = await advanceDemoWeek();
  const settled = await settleOpenBets({ force: true }).catch(() => ({ settledBets: 0, settledLegs: 0 }));
  return NextResponse.json({ state, settled });
}
