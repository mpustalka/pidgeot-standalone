
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.SUPABASE_URL;

    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SERVICE_ROLE_KEY;

    console.log("Pidgeot controller diagnostics:", {
      url,
      keyPresent: Boolean(key),
      keyLength: key?.length ?? 0,
      keyPrefix: key?.slice(0, 10),
    });

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

    return NextResponse.json({
      success: true,
      round: data,
    });
  } catch (error) {
    console.error("Controller error:", error);

    return NextResponse.json(
      { error: "Controller request failed." },
      { status: 500 }
    );
  }
}
