import { getStore } from '@netlify/blobs';
import { maxUploadBytes } from '@/lib/prize-image';
import { getAuthenticatedClient } from '@/lib/supabase/api-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
 const auth = await getAuthenticatedClient(request);
 if(auth.response) return auth.response;
 const {data:admin} = await auth.supabase.rpc('pidgeot_is_admin');
 if(admin !== true) return Response.json({error:'Admin access required.'},{status:403});
 try {
  const form = await request.formData(); const file = form.get('image');
  const types = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
  if(!(file instanceof File) || !types[file.type] || file.size > maxUploadBytes || !file.size) return Response.json({error:'Choose a JPG, PNG, WebP or GIF up to 3 MB. Larger photos must be optimized before upload.'},{status:400});
  const id = `${crypto.randomUUID()}.${types[file.type]}`;
  await getStore({name:'prize-images',consistency:'strong'}).set(id,await file.arrayBuffer());
  return Response.json({url:`/api/prize-images?id=${id}`});
 } catch {return Response.json({error:'Image upload failed. Please try again.'},{status:503});}
}
export async function GET(request: Request) {
 const id = new URL(request.url).searchParams.get('id') || '';
 if(!/^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(id)) return new Response('Not found',{status:404});
 try {
  const data = await getStore({name:'prize-images',consistency:'strong'}).get(id,{type:'arrayBuffer'});
  if(!data) return new Response('Not found',{status:404});
  const types = {jpg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};
  return new Response(data,{headers:{'Content-Type':types[id.split('.').pop()!], 'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
 } catch {return new Response('Image unavailable',{status:503});}
}
