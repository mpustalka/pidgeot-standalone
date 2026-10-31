import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getAuthenticatedClient(request);

  if (auth.response) return auth.response;

  const { data, error } = await auth.supabase!.rpc(
    "pidgeot_get_current_round"
  );

  if (error) {
    console.error("Could not load current Pidgeot round:", error.message);

    return NextResponse.json(
      { error: "Could not load the current round." },
      { status: 500 }
    );
  }

  const round = Array.isArray(data) ? data[0] ?? null : data;

  return NextResponse.json({ round });
}