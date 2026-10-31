import { getDatabase } from '@netlify/database';
import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {'Cache-Control':'private, no-store'}});
async function importCatalog() {
 const source = createAdminClient();
 const {data, error} = await source.from('pidgeot_prizes').select('id,title,description,image_url,points_cost,stock,enabled');
 if(error) throw new Error('The prize catalog could not load.');
 const db = getDatabase();
 for(const p of data || []) await db.sql`INSERT INTO flight_prizes(id,title,description,image_url,points_cost,stock,enabled) VALUES(${p.id},${p.title},${p.description || ''},${p.image_url},${p.points_cost},${p.stock},${p.enabled}) ON CONFLICT(id) DO NOTHING`;
}
export async function GET(request: Request) {
 try {
  const db = getDatabase();
  const [catalog] = await db.sql`SELECT EXISTS(SELECT 1 FROM flight_prizes) AS present`;
  if(!catalog.present) await importCatalog();
  const adminView = new URL(request.url).searchParams.get('admin') === 'true';
  const auth = await getAuthenticatedClient(request);
  let admin = false;
  if(auth.supabase) { const result = await auth.supabase.rpc('pidgeot_is_admin'); admin = result.data === true; }
  if(adminView && !admin) return json({error:'Admin access required.'},403);
  const prizes = adminView ? await db.sql`SELECT * FROM flight_prizes ORDER BY created_at DESC` : await db.sql`SELECT * FROM flight_prizes WHERE enabled ORDER BY points_cost`;
  const orders = auth.user ? (adminView ? await db.sql`SELECT * FROM flight_redemptions ORDER BY created_at DESC LIMIT 200` : await db.sql`SELECT * FROM flight_redemptions WHERE user_id=${auth.user.id} ORDER BY created_at DESC LIMIT 100`) : [];
  return json({prizes, orders, admin});
 } catch { return json({error:'The prize service is unavailable. Please try again.'},503); }
}
export async function POST(request: Request) {
 const auth = await getAuthenticatedClient(request);
 if(auth.response) return auth.response;
 const {user, supabase} = auth;
 try {
  const body = await request.json();
  const db = getDatabase();
  if(body.action === 'save' || body.action === 'review') {
   const {data: admin} = await supabase.rpc('pidgeot_is_admin');
   if(admin !== true) return json({error:'Admin access required.'},403);
   if(body.action === 'save') {
    const p = body.prize;
    if(!p || !p.title?.trim() || p.title.length > 120 || !Number.isSafeInteger(+p.points_cost) || +p.points_cost < 1 || !Number.isSafeInteger(+p.stock) || +p.stock < 0) return json({error:'Enter a name, whole coin cost, and non-negative stock.'},400);
    if(p.image_url && !/^(https:\/\/|\/api\/prize-images\?id=)/.test(p.image_url)) return json({error:'Use an HTTPS image URL or upload an image.'},400);
    const id = p.id || crypto.randomUUID();
    await db.sql`INSERT INTO flight_prizes(id,title,description,image_url,points_cost,stock,enabled) VALUES(${id},${p.title.trim()},${p.description || ''},${p.image_url || null},${+p.points_cost},${+p.stock},${!!p.enabled}) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,image_url=EXCLUDED.image_url,points_cost=EXCLUDED.points_cost,stock=EXCLUDED.stock,enabled=EXCLUDED.enabled`;
    return json({saved:true});
   }
   const allowed: Record<string,string[]> = {pending:['approved','rejected'],approved:['shipped','fulfilled'],shipped:['fulfilled']};
   // Rejections happen before approval; coins are refunded by the existing atomic admin balance RPC.
   const client = await db.pool.connect();
   try {
    await client.query('BEGIN');
    const {rows:[order]} = await client.query('SELECT * FROM flight_redemptions WHERE id=$1 FOR UPDATE',[body.id]);
    if(!order || !allowed[order.status]?.includes(body.status)) { await client.query('ROLLBACK'); return json({error:'This request has changed or the status transition is invalid.'},409); }
    if(body.status === 'rejected') {
     // Persist a review marker first. A network interruption must never trigger a second automatic refund.
     await client.query("UPDATE flight_redemptions SET status='processing', message='Refund review in progress' WHERE id=$1",[order.id]);
     await client.query('COMMIT');
     const {error} = await supabase.rpc('pidgeot_admin_adjust_balance',{target_user:order.user_id,coin_delta:Number(order.coins),point_delta:0,adjustment_reason:`Prize refund ${order.id}`});
     if(error) { await db.sql`UPDATE flight_redemptions SET message='Refund requires manual review. Check the wallet audit before retrying.',updated_at=now() WHERE id=${order.id}`; return json({error:'Refund requires manual review; check the wallet audit.'},409); }
     await client.query('BEGIN');
     await client.query('UPDATE flight_prizes SET stock=stock+1 WHERE id=$1',[order.prize_id]);
    }
    await client.query('UPDATE flight_redemptions SET status=$2,message=$3,tracking=$4,updated_at=now() WHERE id=$1',[order.id,body.status,String(body.message || '').slice(0,2000),String(body.tracking || '').slice(0,300)]);
    await client.query('COMMIT');
    return json({saved:true});
   } catch(e) { await client.query('ROLLBACK'); throw e; } finally {client.release();}
  }
  if(body.action !== 'redeem') return json({error:'Unknown action.'},400);
  if(!Number.isSafeInteger(body.expected_cost) || body.expected_cost < 1) return json({error:'Refresh the checkout to confirm the coin cost.'},400);
  const shipping = body.shipping;
  const required = ['name','email','address','city','postal','country'];
  if(!shipping || required.some(key => typeof shipping[key] !== 'string' || !shipping[key].trim() || shipping[key].length > 200) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shipping.email)) return json({error:'Complete your name, email, and shipping address.'},400);
  const cleanShipping = Object.fromEntries([...required,'address2','region','phone'].map(k=>[k,String(shipping[k] || '').trim().slice(0,200)]));
  if(!/^[0-9a-f-]{36}$/i.test(body.id || '')) return json({error:'Invalid request ID.'},400);
  const client = await db.pool.connect();
  let order;
  try {
   await client.query('BEGIN');
   const {rows:[existing]} = await client.query('SELECT * FROM flight_redemptions WHERE id=$1',[body.id]);
   if(existing) {await client.query('ROLLBACK'); return existing.user_id === user.id ? json({order:existing}) : json({error:'Invalid request ID.'},409);}
   const {rows:[prize]} = await client.query('UPDATE flight_prizes SET stock=stock-1 WHERE id=$1 AND points_cost=$2 AND enabled AND stock>0 RETURNING *',[body.prize_id,body.expected_cost]);
   if(!prize) {await client.query('ROLLBACK'); return json({error:'This prize is unavailable or its coin cost changed. Refresh checkout to continue.'},409);}
   const result = await client.query('INSERT INTO flight_redemptions(id,user_id,prize_id,prize_title,coins,shipping) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[body.id,user.id,prize.id,prize.title,prize.points_cost,JSON.stringify(cleanShipping)]);
   order=result.rows[0];
   await client.query('COMMIT');
  } catch(e) {await client.query('ROLLBACK'); throw e;} finally {client.release();}
  // Compare-and-swap prevents a purchase from overwriting a concurrent bet or cashout.
  const service = createAdminClient();
  const {data:wallet,error:walletError} = await service.from('pidgeot_wallets').select('balance').eq('user_id',user.id).single();
  let paid = false;
  if(!walletError && wallet && Number(wallet.balance) >= Number(order.coins)) {
   const {data,error} = await service.from('pidgeot_wallets').update({balance:Number(wallet.balance)-Number(order.coins),updated_at:new Date().toISOString()}).eq('user_id',user.id).eq('balance',wallet.balance).select('balance');
   if(error) {
    await db.sql`UPDATE flight_redemptions SET message='Coin payment needs manual review. Please contact the admin.',updated_at=now() WHERE id=${order.id}`;
    return json({error:'Payment needs review. Check My redemptions before trying again.'},409);
   }
   paid=!!data?.length;
  }
  if(!paid) {
   const c=await db.pool.connect();
   try {await c.query('BEGIN');await c.query("UPDATE flight_redemptions SET status='failed',message='Coins were not charged. Insufficient balance or wallet changed; please try again.',updated_at=now() WHERE id=$1",[order.id]);await c.query('UPDATE flight_prizes SET stock=stock+1 WHERE id=$1',[order.prize_id]);await c.query('COMMIT');} catch(e){await c.query('ROLLBACK');throw e;} finally{c.release();}
   return json({error:'Insufficient coins or your wallet changed. Please refresh and try again.'},409);
  }
  await db.sql`UPDATE flight_redemptions SET status='pending',message='Request received. Awaiting admin approval.',updated_at=now() WHERE id=${order.id}`;
  return json({submitted:true});
 } catch {return json({error:'The request could not finish. Check My redemptions before trying again.'},503);}
}
