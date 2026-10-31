import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { readGameActivity } from "@/lib/pidgeot/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const roundId = new URL(request.url).searchParams.get("roundId");
  if (!roundId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(roundId)) {
    return NextResponse.json({ error: "A valid round ID is required." }, { status: 400 });
  }
  let userId: string | null = null;
  if (request.headers.has("authorization")) {
    const auth = await getAuthenticatedClient(request);
    if (auth.response) return auth.response;
    userId = auth.user!.id;
  }
  try {
    const activity = await readGameActivity(createAdminClient(), roundId, userId);
    return NextResponse.json(activity, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Game activity could not be loaded. Retrying…" }, { status: 503 });
  }
}
