import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase/api-auth";

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient(request);

  if (auth.response) return auth.response;

  let body: { betId?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!body.betId) {
    return NextResponse.json(
      { error: "A bet ID is required." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase!.rpc(
    "pidgeot_cancel_bet",
    { p_bet_id: body.betId }
  );

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ result: data });
}