const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const shipping={name:'Mira Vale',email:'mira@example.com',address:'14 Oak Lane',city:'York',postal:'YO1 7AA',country:'United Kingdom'};
const id='d1f214f0-cc12-4b7a-942e-5ce4f943fe11';
function setup({admin=false,existing=null,balance=100,updateError=null,updated=true,orderStatus='pending'}={}) {
 const statements=[],walletCalls=[],rpcCalls=[];
 const order={id,user_id:'user-a',prize_id:id,coins:40,status:orderStatus};
 const client={release(){},async query(sql,args){statements.push([sql,args]);if(sql.startsWith('SELECT * FROM flight_redemptions'))return {rows:existing?[existing]:sql.includes('FOR UPDATE')?[order]:[]};if(sql.startsWith('UPDATE flight_prizes')&&sql.includes('RETURNING'))return {rows:[{id,title:'Plush',points_cost:40}]};if(sql.startsWith('INSERT INTO flight_redemptions'))return {rows:[order]};return {rows:[]};}};
 const db={pool:{async connect(){return client;}},async sql(strings,...values){statements.push([strings.join('?'),values]);return [];}};
 const wallet={select(){return this;},eq(...a){walletCalls.push(a);return this;},single:async()=>({data:{balance},error:null}),update(value){walletCalls.push(['update',value]);return {...this,select:async()=>({data:updated?[{balance:balance-40}]:[],error:updateError})};}};
 const auth={user:{id:'user-a'},supabase:{async rpc(name,args){rpcCalls.push([name,args]);return {data:admin,error:null};}},response:null};
 const mocks={'@netlify/database':{getDatabase:()=>db},'next/server':{NextResponse:{json:(data,opts)=>Response.json(data,opts)}},'@/lib/supabase/api-auth':{getAuthenticatedClient:async()=>auth},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>wallet})}};
 const code=ts.transpileModule(fs.readFileSync('app/api/prizes/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const module={exports:{}};new Function('require','module','exports',code)(n=>mocks[n],module,module.exports);
 return {statements,walletCalls,rpcCalls,post:body=>module.exports.POST(new Request('https://example.com/api/prizes',{method:'POST',body:JSON.stringify(body)}))};
}
test('redemption requires shipping details before reserving stock or charging coins',async()=>{const s=setup();const r=await s.post({action:'redeem',id,prize_id:id,expected_cost:40,shipping:{name:'Mira'}});assert.equal(r.status,400);assert.equal(s.statements.length,0);assert.equal(s.walletCalls.length,0);});
test('redemption charges game coins with a conditional wallet update and persists pending status',async()=>{const s=setup();const r=await s.post({action:'redeem',id,prize_id:id,expected_cost:40,shipping});assert.equal(r.status,200);assert.equal(s.walletCalls.find(c=>c[0]==='update')[1].balance,60);assert.ok(s.walletCalls.some(c=>c[0]==='balance'&&c[1]===100));assert.ok(s.statements.some(c=>c[0].includes("status='pending'")));});
test('retries for the same request do not charge or reserve stock again',async()=>{const s=setup({existing:{id,user_id:'user-a',status:'pending'}});assert.equal((await s.post({action:'redeem',id,prize_id:id,expected_cost:40,shipping})).status,200);assert.equal(s.walletCalls.length,0);assert.ok(!s.statements.some(c=>c[0].startsWith('UPDATE flight_prizes')));});
test('insufficient coins return reserved stock and record failure',async()=>{const s=setup({balance:3});assert.equal((await s.post({action:'redeem',id,prize_id:id,expected_cost:40,shipping})).status,409);assert.ok(s.statements.some(c=>c[0].includes("status='failed'")));assert.ok(s.statements.some(c=>c[0].includes('stock=stock+1')));});
test('ambiguous wallet failures remain held for review without risking another debit',async()=>{const s=setup({updateError:{message:'timeout'}});assert.equal((await s.post({action:'redeem',id,prize_id:id,expected_cost:40,shipping})).status,409);assert.ok(s.statements.some(c=>c[0].includes('manual review')));assert.ok(!s.statements.some(c=>c[0].includes('stock=stock+1')));});
test('only admins can save prizes or review requests',async()=>{for(const action of ['save','review']){const s=setup();assert.equal((await s.post({action})).status,403);assert.equal(s.statements.length,0);}});
test('rejecting a pending request refunds coins once and restores stock',async()=>{const s=setup({admin:true});assert.equal((await s.post({action:'review',id,status:'rejected',message:'Sorry, unavailable.'})).status,200);const rpc=s.rpcCalls.find(c=>c[0]==='pidgeot_admin_adjust_balance');assert.equal(rpc[1].coin_delta,40);assert.equal(rpc[1].point_delta,0);assert.ok(s.statements.some(c=>c[0].includes('stock=stock+1')));});
test('completed requests cannot be rejected or refunded again',async()=>{const s=setup({admin:true,orderStatus:'rejected'});assert.equal((await s.post({action:'review',id,status:'rejected'})).status,409);assert.ok(!s.rpcCalls.some(c=>c[0]==='pidgeot_admin_adjust_balance'));});
