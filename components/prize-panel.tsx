"use client";
import { useEffect, useState } from "react";
import RedemptionList from "./redemption-list";
import { Gift, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AdminPanel from "./admin-panel";

type Prize = { id: string; title: string; description: string; image_url: string | null; points_cost: number; stock: number };
export default function PrizePanel({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: () => void }) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [points, setPoints] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All prizes");
  const [admin, setAdmin] = useState(false);
  const [manage, setManage] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  async function load() {
    const db = createClient();
    try {
      const { data: { session } } = await db.auth.getSession();
      const response = await fetch('/api/prizes', {headers: session ? {Authorization: `Bearer ${session.access_token}`} : {}, cache: 'no-store'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPrizes(data.prizes); setAdmin(data.admin);
    } catch(e) { setMessage(e.message || 'The prize shop could not load. Please try again.'); }
    if (!signedIn) {setPoints(null);setAdmin(false);setManage(false);}
    if (signedIn) {
      const { data: { user } } = await db.auth.getUser();
      if (user) {
        const { data: wallet } = await db.from("pidgeot_wallets").select("balance").eq("user_id", user.id).maybeSingle();
        setPoints(wallet?.balance ?? null);
        const { data: isAdmin } = await db.rpc("pidgeot_is_admin");
        setAdmin(isAdmin === true);
      }
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [signedIn, manage]);
  useEffect(() => { const update = () => void load(); window.addEventListener('wallet-updated', update); return () => window.removeEventListener('wallet-updated', update); }, [signedIn]);
  useEffect(() => {
    if (!admin) return;
    const check = async () => { try { const {data:{session}} = await createClient().auth.getSession(); if(!session) return; const response = await fetch('/api/prizes?admin=true', {headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'}); if(response.ok) {const data=await response.json();setPendingCount(data.orders.filter(o=>o.status==='pending'||o.status==='processing').length);} } catch {} };
    void check(); const timer=setInterval(()=>void check(),15000); return ()=>clearInterval(timer);
  }, [admin, manage]);
  const filtered = prizes.filter(p => category === "All prizes" || (category === "In stock" ? p.stock > 0 : points !== null && p.points_cost <= points && p.stock > 0));
  return <section className="flight-panel">
    <header className="flight-panel-heading"><p className="flight-eyebrow">THE PRIZE HANGAR</p><h1>Prize Shop<span className="flight-dot">.</span></h1><p>Turn your coins into something worth keeping.</p><div className="flight-points"><Gift size={20}/><span>{points === null ? "Sign in to view coins" : `${Number(points).toLocaleString()} coins`}</span></div></header>
    {admin && <button className="flight-button mb-5" onClick={() => setManage(!manage)}><ShieldCheck size={16}/>{manage ? "Back to shop" : `Manage prizes & rewards${pendingCount ? ` · ${pendingCount} requests` : ""}`}</button>}
    {manage && admin ? <div className="flight-legacy"><AdminPanel/></div> : <>
      <div className="flight-filters" aria-label="Prize categories">{["All prizes", "In stock", "Within reach"].map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
      {message && <p role="status" className="flight-notice">{message}</p>}
      {loading ? <div className="flight-skeleton" aria-label="Loading prizes"/> : filtered.length === 0 ? <div className="flight-empty"><Gift size={36}/><h2>{prizes.length ? "No prizes in this selection" : "The hangar is getting stocked"}</h2><p>{prizes.length ? "Try another category to explore the shelf." : "New rewards appear here when they become available."}</p><button className="flight-button" onClick={() => void load()}>Refresh shop</button></div> : <div className="flight-prizes">{filtered.map(p => <article key={p.id} className="flight-prize"><div className="flight-prize-image">{p.image_url ? <img src={p.image_url} alt={p.title} onError={e => { e.currentTarget.style.display = "none"; }}/>: <Gift size={44}/>}</div><div className="p-5"><p className="flight-eyebrow">{p.stock > 0 ? `${p.stock} AVAILABLE` : "OUT OF STOCK"}</p><h2>{p.title}</h2><p className="mt-2 text-sm text-white/50">{p.description}</p><div className="flight-prize-bottom"><strong>{Number(p.points_cost).toLocaleString()} <small>COINS</small></strong><button className="flight-button" disabled={p.stock <= 0 || (signedIn && (points === null || points < p.points_cost))} onClick={() => signedIn ? window.location.assign(`/redeem/${p.id}`) : onSignIn()}>{!signedIn ? "Sign in" : points !== null && points < p.points_cost ? "More coins needed" : "Redeem"}</button></div></div></article>)}</div>}
      <p className="mt-6 text-xs leading-6 text-white/40">Redemptions are reviewed by the admin. Enter your delivery details at checkout. Coins are charged when you submit; rejected requests are refunded.</p>
    </>}
    {signedIn && !manage && <RedemptionList/>}
  </section>;
}
