import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const auth = request.headers.get('authorization') || '';
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return reply({ error: 'Authentication required' }, 401);
  try {
    const { messageId } = await request.json();
    if (typeof messageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) return reply({ error: 'Invalid message' }, 400);
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await service.rpc('claim_message_media', { p_message_id: messageId, p_user_id: user.id });
    if (error || !data) return reply({ error: 'İçerik görüntülenemiyor veya daha önce açılmış.' }, 403);
    const { data: file, error: downloadError } = await service.storage.from('private_chat').download(data.path);
    if (downloadError || !file) return reply({ error: 'Dosya alınamadı.' }, 404);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return reply({ base64: btoa(binary), mime: file.type, kind: data.kind, mode: data.mode });
  } catch { return reply({ error: 'Geçersiz istek.' }, 400); }
});
