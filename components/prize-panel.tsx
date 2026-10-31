"use client";
import { useEffect, useState } from "react";
import { Gift, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AdminPanel from "./admin-panel";

type Prize = { id: string; title: string; description: string; image_url: string | null; points_cost: number; stock: number };
export default function PrizePanel({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: () => void }) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [points, setPoints] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Prize | null>(null);
  const [category, setCategory] = useState("All prizes");
  const [admin, setAdmin] = useState(false);
  const [manage, setManage] = useState(false);
  async function load() {
    const db = createClient();
    const { data, error } = await db.from("pidgeot_prizes").select("id,title,description,image_url,points_cost,stock").eq("enabled", true).order("points_cost");
    if (error) setMessage("The prize shop could not load. Please try again.");
    else setPrizes(data || []);
    if (signedIn) {
      const { data: { user } } = await db.auth.getUser();
      if (user) {
        const { data: wallet } = await db.from("pidgeot_wallets").select("prize_points").eq("user_id", user.id).maybeSingle();
        setPoints(wallet?.prize_points ?? null);
        const { data: isAdmin } = await db.rpc("pidgeot_is_admin");
        setAdmin(isAdmin === true);
      }
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [signedIn, manage]);
  async function redeem() {
    if (!selected || busy) return;
    setBusy(true);
    const { error } = await createClient().rpc("pidgeot_redeem_prize", { prize_id: selected.id });
    setBusy(false);
    if (error) { setMessage(error.message); setSelected(null); return; }
    setMessage(`Redemption requested for ${selected.title}. Your request is awaiting review.`);
    setSelected(null);
    await load();
    window.dispatchEvent(new Event("wallet-updated"));
  }
  const filtered = prizes.filter(p => category === "All prizes" || (category === "In stock" ? p.stock > 0 : points !== null && p.points_cost <= points && p.stock > 0));
  return <section className="flight-panel">
    <header className="flight-panel-heading"><p className="flight-eyebrow">THE PRIZE HANGAR</p><h1>Prize Shop<span className="flight-dot">.</span></h1><p>Turn your flight points into something worth keeping.</p><div className="flight-points"><Gift size={20}/><span>{points === null ? "Sign in to view points" : `${Number(points).toLocaleString()} prize points`}</span></div></header>
    {admin && <button className="flight-button mb-5" onClick={() => setManage(!manage)}><ShieldCheck size={16}/>{manage ? "Back to shop" : "Manage prizes & rewards"}</button>}
    {manage && admin ? <div className="flight-legacy"><AdminPanel/></div> : <>
      <div className="flight-filters" aria-label="Prize categories">{["All prizes", "In stock", "Within reach"].map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
      {message && <p role="status" className="flight-notice">{message}</p>}
      {loading ? <div className="flight-skeleton" aria-label="Loading prizes"/> : filtered.length === 0 ? <div className="flight-empty"><Gift size={36}/><h2>{prizes.length ? "No prizes in this selection" : "The hangar is getting stocked"}</h2><p>{prizes.length ? "Try another category to explore the shelf." : "New rewards appear here when they become available."}</p><button className="flight-button" onClick={() => void load()}>Refresh shop</button></div> : <div className="flight-prizes">{filtered.map(p => <article key={p.id} className="flight-prize"><div className="flight-prize-image">{p.image_url ? <img src={p.image_url} alt={p.title} onError={e => { e.currentTarget.style.display = "none"; }}/>: <Gift size={44}/>}</div><div className="p-5"><p className="flight-eyebrow">{p.stock > 0 ? `${p.stock} AVAILABLE` : "OUT OF STOCK"}</p><h2>{p.title}</h2><p className="mt-2 text-sm text-white/50">{p.description}</p><div className="flight-prize-bottom"><strong>{Number(p.points_cost).toLocaleString()} <small>PTS</small></strong><button className="flight-button" disabled={p.stock <= 0 || busy || (signedIn && (points === null || points < p.points_cost))} onClick={() => signedIn ? setSelected(p) : onSignIn()}>{!signedIn ? "Sign in" : points !== null && points < p.points_cost ? "More points needed" : "Redeem"}</button></div></div></article>)}</div>}
      <p className="mt-6 text-xs leading-6 text-white/40">Redemptions are reviewed by the admin. Points are reserved when you submit your request. Delivery details may be needed for physical prizes.</p>
    </>}
    {selected && <div className="flight-confirm" role="dialog" aria-modal="true" aria-labelledby="redeem-title"><h2 id="redeem-title">Redeem {selected.title}?</h2><p>{selected.points_cost.toLocaleString()} points will be reserved for this request.</p><div className="flex gap-3 mt-4"><button autoFocus className="flight-button" disabled={busy} onClick={() => setSelected(null)}>Cancel</button><button className="flight-button" disabled={busy} onClick={() => void redeem()}>{busy ? "Submitting…" : "Confirm redemption"}</button></div></div>}
  </section>;
}
