import type { SupabaseClient } from "@supabase/supabase-js";

export function cashoutDetails(data: unknown): { payout: number; multiplier: number } | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const { payout, cashout_multiplier } = row as Record<string, unknown>;
  if (payout == null || cashout_multiplier == null || payout === "" || cashout_multiplier === "") return null;
  const amount = Number(payout);
  const multiplier = Number(cashout_multiplier);
  return Number.isFinite(amount) && amount >= 0 && Number.isFinite(multiplier) && multiplier >= 1
    ? { payout: amount, multiplier } : null;
}

// Some deployed cashout RPC versions return void. Read the recorded outcome
// rather than treating a missing response body as a failed wallet transaction.
export async function resolveCashout(db: SupabaseClient, betId: string, data: unknown) {
  const details = cashoutDetails(data);
  if (details) return details;
  try {
    const result = await db.from("pidgeot_bets")
      .select("status,payout,cashout_multiplier").eq("id", betId).maybeSingle();
    return !result.error && result.data?.status === "cashed_out" ? cashoutDetails(result.data) : null;
  } catch {
    // Live activity polling retries confirmation without repeating the cashout.
    return null;
  }
}
