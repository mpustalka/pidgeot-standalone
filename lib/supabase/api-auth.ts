import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function getAuthenticatedClient(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      user: null,
      supabase: null,
      response: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      ),
    };
  }

  const token = authorization.slice("Bearer ".length).trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key || !token) {
    return {
      user: null,
      supabase: null,
      response: NextResponse.json(
        { error: "Supabase configuration or token is missing." },
        { status: 500 }
      ),
    };
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return {
      user: null,
      supabase: null,
      response: NextResponse.json(
        { error: "Your session is invalid or expired." },
        { status: 401 }
      ),
    };
  }

  return {
    user: data.user,
    supabase,
    response: null,
  };
}