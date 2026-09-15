import type { Metadata } from "next";
import { BetsView } from "@/components/bets-view";
import { getCurrentUser } from "@/lib/auth";
import { listLedger, listUserBets, settleOpenBets } from "@/lib/bets";

export const metadata: Metadata = { title: "My Bets" };
export const dynamic = "force-dynamic";

export default async function BetsPage() {
  const user = await getCurrentUser();
  if (!user) return <BetsView initialBets={[]} initialLedger={[]} />;
  await settleOpenBets().catch(() => null);
  const [bets, ledger] = await Promise.all([listUserBets(user.id), listLedger(user.id)]);
  return <BetsView initialBets={bets} initialLedger={ledger} />;
}
