
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc(
      "pidgeot_advance_round"
    );

    if (error) {
      console.error("Controller RPC error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    const round = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      success: true,
      round: round ? {
        id: round.id, round_number: round.round_number, status: round.status,
        betting_opens_at: round.betting_opens_at, starts_at: round.starts_at,
        crashed_at: round.crashed_at,
        crash_multiplier: ["crashed", "settled"].includes(round.status) ? round.crash_multiplier : null,
      } : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Controller error:", error);

    return NextResponse.json(
      { error: "Controller request failed." },
      { status: 500 }
    );
  }
}
