import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase/api-auth";

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient(request);

  if (auth.response) return auth.response;

  let body: {
    roundId?: string;
    amount?: number;
    autoCashout?: number | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const { roundId, amount, autoCashout = null } = body;

  if (
    typeof roundId !== "string" ||
    !roundId ||
    !Number.isSafeInteger(amount) ||
    (amount as number) < 1 ||
    (amount as number) > 50
  ) {
    return NextResponse.json(
      { error: "A valid round ID and bet amount from 1 to 50 are required." },
      { status: 400 }
    );
  }

  if (
    autoCashout !== null &&
    (typeof autoCashout !== "number" ||
      !Number.isFinite(autoCashout) ||
      autoCashout < 1.01)
  ) {
    return NextResponse.json(
      { error: "Auto cashout must be at least 1.01x." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase!.rpc(
    "pidgeot_place_bet",
    {
      p_round_id: roundId,
      p_amount: amount,
      p_auto_cashout: autoCashout,
    }
  );

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ bet: data });
}