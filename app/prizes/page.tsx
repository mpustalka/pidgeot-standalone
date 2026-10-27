 "use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Prize = { id: string; title: string; description: string; image_url: string | null; points_cost: number; stock: number; enabled: boolean };
type Wallet = { prize_points: number };

export default function PrizesPage() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [points, setPoints] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [message, setMessage] = useState("Loading the prize shelf…");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const db = createClient();
    const { data: { user } } = await db.auth.getUser();
    setSignedIn(!!user);
    const { data, error } = await db.from("pidgeot_prizes").select("id,title,description,image_url,points_cost,stock,enabled").eq("enabled", true).order("points_cost");
    if (error) { setMessage("Prize shelf needs the latest database migration applied."); return; }
    setPrizes((data || []) as Prize[]);
    if (user) {
      const { data: wallet } = await db.from("pidgeot_wallets").select("prize_points").eq("user_id", user.id).maybeSingle();
      setPoints((wallet as Wallet | null)?.prize_points ?? 0);
    }
    setMessage((data || []).length ? "Pick something fun!" : "The prize shelf is getting stocked. Check back soon!");
  }

  useEffect(() => { void load(); }, []);

  async function redeem(prize: Prize) {
    if (!signedIn) { window.location.href = "/login?next=/prizes"; return; }
    setBusy(prize.id); setMessage("");
    const { error } = await createClient().rpc("pidgeot_redeem_prize", { prize_id: prize.id });
    setBusy(null);
    if (error) setMessage(error.message);
    else { setMessage(`Redemption request sent for ${prize.title}!`); await load(); }
  }

  return <main className="min-h-screen bg-gradient-to-b from-amber-50 via-pink-50 to-sky-50 text-slate-900">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
      <Link href="/" className="font-black text-violet-700">🪽 PIDGEOT FLIGHT</Link>
      <nav className="flex items-center gap-3"><Link href="/game" className="rounded-full px-4 py-2 font-bold text-violet-700 hover:bg-white">🎮 Game</Link><Link href="/login" className="rounded-full bg-violet-700 px-4 py-2 font-bold text-white">Sign in</Link></nav>
    </header>
    <section className="mx-auto max-w-7xl px-5 pb-16 pt-5">
      <div className="rounded-[2rem] bg-gradient-to-r from-violet-700 via-fuchsia-600 to-pink-500 p-7 text-white shadow-xl shadow-pink-200 sm:p-10">
        <p className="font-extrabold uppercase tracking-[.25em] text-pink-100">The good stuff</p>
        <h1 className="mt-3 text-4xl font-black sm:text-6xl">The Prize Shelf 🎁</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-white/90">Browse rewards, see the points you need, and send a redemption request when you spot something you love.</p>
        <div className="mt-6 inline-flex rounded-2xl bg-white/15 px-5 py-3 font-bold">{points === null ? (signedIn ? "Checking your points…" : "Sign in to see your points") : `⭐ Your prize points: ${points.toLocaleString()}`}</div>
      </div>
      <p className="mt-5 min-h-6 font-semibold text-slate-600" role="status">{message}</p>
      {prizes.length > 0 && <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {prizes.map(prize => <article key={prize.id} className="overflow-hidden rounded-3xl border border-white bg-white shadow-lg shadow-violet-100/70 transition hover:-translate-y-1">
          <div className="flex h-44 items-center justify-center bg-gradient-to-br from-sky-100 via-violet-100 to-pink-100 text-7xl">
            {prize.image_url ? <img src={prize.image_url} alt={prize.title} className="h-full w-full object-cover" /> : "🎁"}
          </div>
          <div className="p-5"><div className="flex items-start justify-between gap-3"><h2 className="text-xl font-black">{prize.title}</h2><span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-800">⭐ {prize.points_cost.toLocaleString()}</span></div>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{prize.description || "A little something special from Pidgeot Flight."}</p>
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-400">{prize.stock > 0 ? `${prize.stock} available` : "Availability: ask admin"}</p>
            <button disabled={busy === prize.id || prize.stock === 0 || (points !== null && points < prize.points_cost)} onClick={() => void redeem(prize)} className="mt-5 w-full rounded-xl bg-violet-700 px-4 py-3 font-extrabold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300">
              {busy === prize.id ? "Sending request…" : !signedIn ? "Sign in to redeem" : points !== null && points < prize.points_cost ? "Not enough points yet" : prize.stock === 0 ? "Out of stock" : "Redeem prize"}
            </button>
          </div>
        </article>)}
      </div>}
      <div className="mt-10 rounded-3xl border border-violet-100 bg-white/80 p-6"><h2 className="text-xl font-black">How prizes work</h2><p className="mt-2 leading-7 text-slate-600">Prize requests are sent to the admin for review. Points are checked and reserved by the database when you redeem. Physical prizes may require delivery details after approval.</p><Link href="/login?next=/prizes" className="mt-4 inline-block font-extrabold text-violet-700 underline underline-offset-4">Sign in or create an account →</Link></div>
    </section>
  </main>;
}
