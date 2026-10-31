import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActivityBet {
  id: string;
  username: string;
  betAmount: number;
  isOwn: boolean;
  status: string;
  autoCashout: number | null;
  payout: number;
  cashout?: number;
}
export interface GameActivity {
  roundId: string;
  crashes: { id: string; multiplier: number }[];
  bets: ActivityBet[];
  ownBets: ActivityBet[];
  history: {
    id: string; betAmount: number; crashPoint: number; cashedOut: boolean;
    cashoutMultiplier: number | null; winAmount: number; profit: number; createdAt: string;
  }[];
}

// Only explicitly selected, public game fields leave the server. The supplied
// user ID comes from verified authentication, never from a request parameter.
export async function readGameActivity(db: SupabaseClient, roundId: string, userId: string | null): Promise<GameActivity> {
  const [rounds, bets, ownBets, history] = await Promise.all([
    db.from("pidgeot_rounds").select("id,crash_multiplier").in("status", ["crashed", "settled"])
      .not("crash_multiplier", "is", null).order("round_number", { ascending: false }).limit(15),
    db.from("pidgeot_bets").select("id,user_id,amount,status,cashout_multiplier,payout")
      .eq("round_id", roundId).neq("status", "cancelled").order("placed_at", { ascending: false }).limit(200),
    userId ? db.from("pidgeot_bets").select("id,user_id,amount,status,cashout_multiplier,payout,auto_cashout")
      .eq("round_id", roundId).eq("user_id", userId).neq("status", "cancelled").order("placed_at") : Promise.resolve({ data: [], error: null }),
    userId ? db.from("pidgeot_bets")
      .select("id,amount,status,cashout_multiplier,payout,placed_at,pidgeot_rounds!inner(crash_multiplier,status)")
      .eq("user_id", userId).in("status", ["cashed_out", "lost"])
      .in("pidgeot_rounds.status", ["crashed", "settled"])
      .order("placed_at", { ascending: false }).limit(10) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [rounds, bets, ownBets, history]) {
    if (result.error) throw new Error("Game activity could not be loaded.");
  }
  const rows = bets.data || [];
  const ownRows = ownBets.data || [];
  const ids = [...new Set([...rows, ...ownRows].map(b => b.user_id))];
  const profiles = ids.length ? await db.from("pidgeot_profiles").select("user_id,username").in("user_id", ids) : { data: [], error: null };
  if (profiles.error) throw new Error("Player names could not be loaded.");
  const names = new Map((profiles.data || []).map(p => [p.user_id, p.username]));
  const toBet = (bet: typeof rows[number] & { auto_cashout?: number | string | null }, own = false): ActivityBet => ({
    id: bet.id, username: names.get(bet.user_id) || "Pilot", betAmount: Number(bet.amount),
    isOwn: bet.user_id === userId, status: bet.status,
    autoCashout: own && bet.auto_cashout != null ? Number(bet.auto_cashout) : null,
    payout: Number(bet.payout),
    ...(bet.status === "cashed_out" && bet.cashout_multiplier != null ? { cashout: Number(bet.cashout_multiplier) } : {}),
  });
  return {
    roundId,
    crashes: (rounds.data || []).map(r => ({ id: r.id, multiplier: Number(r.crash_multiplier) })),
    bets: rows.map(b => toBet(b)),
    ownBets: ownRows.map(b => toBet(b, true)),
    history: (history.data || []).flatMap(b => {
      const round = Array.isArray(b.pidgeot_rounds) ? b.pidgeot_rounds[0] : b.pidgeot_rounds;
      if (!round || round.crash_multiplier == null) return [];
      const amount = Number(b.amount);
      const payout = Number(b.payout);
      return [{ id: b.id, betAmount: amount, crashPoint: Number(round.crash_multiplier),
        cashedOut: b.status === "cashed_out", cashoutMultiplier: b.cashout_multiplier == null ? null : Number(b.cashout_multiplier),
        winAmount: payout, profit: payout - amount, createdAt: b.placed_at }];
    }),
  };
}
