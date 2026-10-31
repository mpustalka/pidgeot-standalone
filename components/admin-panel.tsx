"use client";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Settings = { daily_free_rounds:number; daily_free_coins:number; daily_login_points:number; daily_rewards_enabled:boolean; free_rounds_enabled:boolean; free_coins_enabled:boolean; login_bonus_enabled:boolean };
type Player = { user_id:string; email:string|null; username:string|null; coins:number|null; points:number|null; created_at:string };
type Prize = { id:string; title:string; description:string; image_url:string|null; points_cost:number; stock:number; enabled:boolean };
const blankPrize = { id:"", title:"", description:"", image_url:"", points_cost:"100", stock:"10", enabled:true };
const input = "mt-1 w-full rounded-xl border border-white/10 bg-[#171a21] px-3 py-3 text-white outline-none focus:border-white/10 focus:ring-2 focus:ring-violet-100";
const card = "mt-6 rounded-2xl border border-white/10 bg-[#171a21] p-5 shadow-lg  sm:p-7";
const imageTypes = ["image/jpeg","image/png","image/webp","image/gif"];
const maxImageBytes = 5 * 1024 * 1024;

export default function AdminPage() {
  const db = createClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [ok,setOk] = useState(false), [msg,setMsg] = useState("Checking admin access…");
  const [settings,setSettings] = useState<Settings|null>(null);
  const [players,setPlayers] = useState<Player[]>([]);
  const [selectedUser,setSelectedUser] = useState("");
  const [coins,setCoins] = useState("0"), [points,setPoints] = useState("0"), [reason,setReason] = useState("");
  const [prizes,setPrizes] = useState<Prize[]>([]);
  const [prize,setPrize] = useState(blankPrize);
  const [busy,setBusy] = useState(false), [uploadingImage,setUploadingImage] = useState(false);

  async function loadPlayers() {
    const {data,error} = await db.rpc("pidgeot_admin_list_users");
    if (error) { setMsg(error.message); return; }
    setPlayers((data||[]) as Player[]);
    const {data:{user}} = await db.auth.getUser();
    if (user && !selectedUser) setSelectedUser(user.id);
  }
  async function loadPrizes() {
    const {data,error} = await db.from("pidgeot_prizes").select("id,title,description,image_url,points_cost,stock,enabled").order("created_at",{ascending:false});
    if (error) setMsg(error.message); else setPrizes((data||[]) as Prize[]);
  }
  useEffect(() => { (async()=>{
    const {data:{user}} = await db.auth.getUser();
    if (!user) { setMsg("Please sign in with the admin account admin@evileevee.com."); return; }
    const {data:admin,error:adminError} = await db.rpc("pidgeot_is_admin");
    if (adminError || !admin) { setMsg("Admin access denied. Sign in as admin@evileevee.com."); return; }
    setOk(true);
    const {data,error} = await db.from("pidgeot_game_settings").select("daily_free_rounds,daily_free_coins,daily_login_points,daily_rewards_enabled,free_rounds_enabled,free_coins_enabled,login_bonus_enabled").eq("id",true).single();
    if (error) { setMsg("Apply migrations 0001 through 0005 in Supabase."); return; }
    setSettings(data as Settings); setMsg("Admin authenticated — your account can be selected below.");
    await Promise.all([loadPlayers(),loadPrizes()]);
  })(); }, []);

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    const {error} = await db.rpc("pidgeot_admin_update_settings", {
      free_rounds:settings.daily_free_rounds, free_coins:settings.daily_free_coins, login_points:settings.daily_login_points,
      rewards_on:settings.daily_rewards_enabled, rounds_on:settings.free_rounds_enabled, coins_on:settings.free_coins_enabled, login_on:settings.login_bonus_enabled
    });
    setBusy(false); setMsg(error?.message || "Daily reward settings saved.");
  }
  async function adjustBalance() {
    if (!selectedUser) { setMsg("Choose an account."); return; }
    const c=Number(coins), p=Number(points);
    if (!Number.isSafeInteger(c)||!Number.isSafeInteger(p)||(!c&&!p)) { setMsg("Enter a non-zero whole-number coin or point adjustment."); return; }
    if (reason.trim().length<3) { setMsg("Add a reason of at least 3 characters."); return; }
    setBusy(true);
    const {error}=await db.rpc("pidgeot_admin_adjust_balance",{target_user:selectedUser,coin_delta:c,point_delta:p,adjustment_reason:reason});
    setBusy(false);
    if(error){setMsg(error.message);return;}
    setMsg("Balance updated.");setCoins("0");setPoints("0");setReason("");await loadPlayers();
  }
  async function uploadPrizeImage(file?:File) {
    if(!file)return;
    if(!imageTypes.includes(file.type)){setMsg("Choose a JPG, PNG, WebP, or GIF image.");if(fileInput.current)fileInput.current.value="";return;}
    if(file.size>maxImageBytes){setMsg("Image must be 5 MB or smaller.");if(fileInput.current)fileInput.current.value="";return;}
    setUploadingImage(true);setMsg("Uploading prize image…");
    const ext:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"};
    const path=`prize-images/${crypto.randomUUID()}.${ext[file.type]}`;
    const {error}=await db.storage.from("prizes").upload(path,file,{cacheControl:"3600",contentType:file.type,upsert:false});
    if(error){setUploadingImage(false);setMsg(`Upload failed: ${error.message}. Confirm migration 0005 and admin sign-in.`);if(fileInput.current)fileInput.current.value="";return;}
    const {data}=db.storage.from("prizes").getPublicUrl(path);
    setPrize(current=>({...current,image_url:data.publicUrl}));
    setUploadingImage(false);setMsg("Image uploaded. Save the prize form to link it to the prize.");
    if(fileInput.current)fileInput.current.value="";
  }
  async function savePrize(e:React.FormEvent) {
    e.preventDefault();
    if(uploadingImage){setMsg("Wait for image upload to finish.");return;}
    setBusy(true);
    const {error}=await db.rpc("pidgeot_admin_save_prize",{
      prize_id:prize.id||null,prize_title:prize.title,prize_description:prize.description,prize_image_url:prize.image_url||null,
      prize_points_cost:Number(prize.points_cost),prize_stock:Number(prize.stock),prize_enabled:prize.enabled
    });
    setBusy(false);
    if(error){setMsg(error.message);return;}
    setMsg(prize.id?"Prize updated.":"Prize created and shown on the public shelf.");
    setPrize(blankPrize);await loadPrizes();
  }

  return <section className=" bg-[#14161c]    px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-6xl">
    <header className="mt-8 rounded-2xl bg-[#14161c]    p-7 text-white  "><p className="font-extrabold uppercase tracking-[.25em] text-pink-100">Control tower</p><h1 className="mt-2 text-3xl font-bold sm:text-3xl">Prize management</h1><p className="mt-3 text-white/90">{msg}</p></header>
    {ok&&settings&&<>
      <section className={card}><h2 className="text-2xl font-black">Daily rewards</h2><p className="mt-1 text-white/50">Set daily allowances and toggle rewards.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">{([["daily_free_rounds","Free rounds per day"],["daily_free_coins","Free coins per day"],["daily_login_points","Prize points per day"]] as [keyof Settings,string][]).map(([key,label])=><label key={key} className="font-bold">{label}<input className={input} type="number" min="0" value={settings[key] as number} onChange={e=>setSettings({...settings,[key]:Number(e.target.value)})}/></label>)}</div>
        <div className="mt-5 flex flex-wrap gap-3">{(["daily_rewards_enabled","free_rounds_enabled","free_coins_enabled","login_bonus_enabled"] as (keyof Settings)[]).map(key=><label key={key} className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 font-semibold"><input type="checkbox" checked={settings[key] as boolean} onChange={e=>setSettings({...settings,[key]:e.target.checked})}/>{key.replaceAll("_"," ")}</label>)}</div>
        <button disabled={busy} onClick={()=>void saveSettings()} className="mt-5 rounded-xl bg-violet-700 px-5 py-3 font-extrabold text-white disabled:opacity-50">Save daily rewards</button>
      </section>
      <section className={card}><h2 className="text-2xl font-black">Adjust a player balance</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="font-bold">Account<select value={selectedUser} onChange={e=>setSelectedUser(e.target.value)} className={input}>{players.map(p=><option key={p.user_id} value={p.user_id}>{p.email||p.username||p.user_id} · {p.points??0} points</option>)}</select></label>
        <label className="font-bold">Game coins (+ / −)<input className={input} type="number" value={coins} onChange={e=>setCoins(e.target.value)}/></label>
        <label className="font-bold">Prize points (+ / −)<input className={input} type="number" value={points} onChange={e=>setPoints(e.target.value)}/></label>
        <label className="font-bold">Reason<input className={input} value={reason} onChange={e=>setReason(e.target.value)} placeholder="launch bonus or correction"/></label></div>
        <button disabled={busy} onClick={()=>void adjustBalance()} className="mt-5 rounded-xl bg-amber-400 px-5 py-3 font-black text-white disabled:opacity-50">Apply balance adjustment</button><button onClick={()=>void loadPlayers()} className="ml-3 mt-5 rounded-xl border border-white/10 px-5 py-3 font-bold text-amber-300">Refresh accounts</button>
      </section>
      <section className={card}><h2 className="text-2xl font-black">{prize.id?"Edit a prize":"Create a prize"}</h2><p className="mt-1 text-white/50">Choose a JPG, PNG, WebP, or GIF up to 5 MB. It uploads to the public <code>prizes</code> bucket.</p>
        <form onSubmit={savePrize} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="font-bold">Prize name<input required maxLength={120} className={input} value={prize.title} onChange={e=>setPrize({...prize,title:e.target.value})} placeholder="Pidgeot plush, sticker pack…"/></label>
          <label className="font-bold">Point cost<input required type="number" min="1" className={input} value={prize.points_cost} onChange={e=>setPrize({...prize,points_cost:e.target.value})}/></label>
          <label className="font-bold">Stock available<input required type="number" min="0" className={input} value={prize.stock} onChange={e=>setPrize({...prize,stock:e.target.value})}/></label>
          <label className="font-bold">Upload image<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploadingImage||busy} onChange={e=>void uploadPrizeImage(e.target.files?.[0])} className={`${input} file:mr-3 file:rounded-lg file:border-0 file:bg-white/5 file:px-3 file:py-2 file:font-bold file:text-amber-300`}/><span className="text-xs font-normal text-white/50">Upload first, then save the prize.</span></label>
          <label className="font-bold">Image URL<input type="url" className={input} value={prize.image_url} onChange={e=>setPrize({...prize,image_url:e.target.value})} placeholder="Filled after upload; editable"/></label>
          {prize.image_url&&<div className="sm:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-3"><p className="mb-2 text-sm font-bold text-amber-300">Image preview</p><img src={prize.image_url} alt="Prize preview" className="max-h-56 max-w-full rounded-xl object-contain"/><button type="button" onClick={()=>setPrize({...prize,image_url:""})} className="mt-2 text-sm font-bold text-rose-700">Remove image URL</button></div>}
          <label className="font-bold sm:col-span-2">Description<textarea className={input} rows={3} value={prize.description} onChange={e=>setPrize({...prize,description:e.target.value})} placeholder="Tell players what makes this prize special."/></label>
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={prize.enabled} onChange={e=>setPrize({...prize,enabled:e.target.checked})}/> Show on public prize shelf</label>
          <div className="flex flex-wrap gap-3"><button disabled={busy||uploadingImage} className="rounded-xl bg-white/50 px-5 py-3 font-extrabold text-white disabled:opacity-50">{uploadingImage?"Uploading…":busy?"Saving…":prize.id?"Save prize changes":"Create prize"}</button>{prize.id&&<button type="button" onClick={()=>setPrize(blankPrize)} className="rounded-xl border px-5 py-3 font-bold">Cancel edit</button>}</div>
        </form>
        <div className="mt-7 space-y-3">{prizes.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-3">{p.image_url&&<img src={p.image_url} alt="" className="h-16 w-16 rounded-xl bg-[#171a21] object-contain"/>}<div><p className="font-black">{p.title} {p.enabled?"Visible":"Hidden"}</p><p className="text-sm text-white/50">{p.points_cost} points · {p.stock} in stock · {p.enabled?"Visible":"Hidden"}</p></div></div><button onClick={()=>setPrize({id:p.id,title:p.title,description:p.description||"",image_url:p.image_url||"",points_cost:String(p.points_cost),stock:String(p.stock),enabled:p.enabled})} className="rounded-xl bg-[#171a21] px-4 py-2 font-bold text-amber-300 shadow-sm">Edit prize</button></div>)}</div>
      </section>
      <section className={card}><div className="flex items-center justify-between"><h2 className="text-2xl font-black">Players ({players.length})</h2><button onClick={()=>void loadPlayers()} className="font-bold text-amber-300">Refresh</button></div><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-white/50"><th className="py-2">Account</th><th>Coins</th><th>Prize points</th><th>Joined</th></tr></thead><tbody>{players.map(p=><tr key={p.user_id} className="border-t border-white/10"><td className="py-3 pr-4">{p.email||p.username||"—"}</td><td>{p.coins??0}</td><td>{p.points??0}</td><td>{new Date(p.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div></section>
    </>}
  </div></section>;
}
