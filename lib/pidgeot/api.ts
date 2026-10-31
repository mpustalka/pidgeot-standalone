"use client";

import { createClient } from "@/lib/supabase/client";

export async function pidgeotApi<T>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("Please sign in again to continue.");
  }

  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error ?? "The game request failed.");
  }

  return result as T;
}