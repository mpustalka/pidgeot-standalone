"use client";

import { createBrowserClient } from "@supabase/ssr";

let supabase:
  | ReturnType<typeof createBrowserClient>
  | undefined;

export function createClient() {
  if (supabase) return supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Missing public Supabase environment variables.");
  }

  supabase = createBrowserClient(url, key);
  return supabase;
}