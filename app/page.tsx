
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PidgeotFlightGame } from "@/components/pidgeot-flight-game";

type AuthMode = "signin" | "signup";

export default function HomePage() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user);
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function submitAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    const supabase = createClient();

    const result =
  mode === "signin"
    ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
    : await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

console.log("Pidgeot auth result", {
  mode,
  userId: result.data.user?.id ?? null,
  sessionCreated: !!result.data.session,
  error: result.error
    ? {
        name: result.error.name,
        message: result.error.message,
        status: result.error.status,
      }
    : null,
});

setBusy(false);

if (result.error) {
  setMessage(`Authentication failed: ${result.error.message}`);
  return;
}

if (mode === "signup" && !result.data.user) {
  setMessage("Supabase returned no user. Check the browser console.");
  return;
}

if (mode === "signup" && !result.data.session) {
  setMessage(
    "Signup request accepted, but no session was created. Check email confirmation and Authentication settings."
  );
  return;
}

setSignedIn(true);
setModalOpen(false);
setPassword("");
window.location.reload();

    // Reload the game so it initializes with the authenticated user's balance.
    window.location.reload();
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-[#08090c] text-white grid place-items-center">
        <span className="text-xs uppercase tracking-[0.3em] text-white/50">
          Throwing my pokeball..
        </span>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#08090c] text-white">
      <div className="relative min-h-screen">
        <PidgeotFlightGame />

        {!signedIn && (
          <button
            type="button"
            aria-label="Sign in to interact with Pidgeot Flight"
            onClick={() => {
              setMessage("");
              setModalOpen(true);
            }}
            className="absolute inset-0 z-20 h-full w-full cursor-pointer bg-transparent"
          />
        )}

        {modalOpen && !signedIn && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setModalOpen(false);
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-title"
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#111318] p-7 shadow-2xl sm:p-9"
            >
              <div className="mb-8 flex items-center justify-between">
                <span className="text-sm font-black tracking-[0.2em] text-amber-400">
                  PIDGEOT FLIGHT
                </span>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg px-3 py-1 text-xl text-white/50 hover:bg-white/10 hover:text-white"
                  aria-label="Close sign-in dialog"
                >
                  ×
                </button>
              </div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-400/80">
                Flight access
              </p>

              <h2 id="auth-title" className="text-3xl font-bold tracking-tight">
                {mode === "signin" ? "Welcome back." : "Create your account."}
              </h2>

              <p className="mt-3 text-sm leading-6 text-white/55">
                Sign in to place bets, cash out, and access your account balance.
              </p>

              <form onSubmit={submitAuth} className="mt-7 space-y-4">
                <label className="block text-sm text-white/70">
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-amber-400/70"
                    placeholder="you@example.com"
                  />
                </label>

                <label className="block text-sm text-white/70">
                  Password
                  <input
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    minLength={6}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-amber-400/70"
                    placeholder="At least 6 characters"
                  />
                </label>

                {message && (
                  <p role="status" className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                    {message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-amber-400 px-4 py-3.5 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy
                    ? "Please wait…"
                    : mode === "signin"
                      ? "SIGN IN"
                      : "CREATE ACCOUNT"}
                </button>
              </form>

              <div className="mt-6 border-t border-white/10 pt-5 text-center text-sm text-white/55">
                {mode === "signin" ? "New to Pidgeot Flight?" : "Already have an account?"}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setMessage("");
                  }}
                  className="ml-2 font-semibold text-amber-400 hover:text-amber-300"
                >
                  {mode === "signin" ? "Create account" : "Sign in"}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
