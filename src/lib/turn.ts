import { supabase } from './supabase';
import { withTimeout } from './async';
type IceServer = { urls: string | string[]; username?: string; credential?: string };
let cached: { userId: string; iceServers: IceServer[]; expiresAt: number } | null = null;
let pending: { userId: string; work: Promise<IceServer[]> } | null = null;
export async function getIceServers(): Promise<IceServer[]> {
  const { data: { session }, error } = await withTimeout(supabase.auth.getSession(), 8000);
  if (error || !session) throw Error('Arama için yeniden giriş yapın.');
  const userId = session.user.id;
  if (cached?.userId === userId && Date.now() + 60000 < cached.expiresAt) return cached.iceServers;
  if (pending?.userId === userId) return pending.work;
  const work = (async () => {
    const { data, error } = await withTimeout(supabase.functions.invoke<{ iceServers: IceServer[]; expiresAt: number }>('turn-credentials'), 8000);
    if (error) throw Error('Arama sunucusundan erişim bilgisi alınamadı. TURN fonksiyonunu ve oturumunuzu kontrol edin.');
    const servers = data?.iceServers;
    const relay = servers?.some(server => (Array.isArray(server.urls) ? server.urls : [server.urls]).some(url => /^turns?:/.test(url)) && !!server.username && !!server.credential);
    if (!relay || !data || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now() + 10000) throw Error('Arama sunucusu geçerli TURN bilgisi döndürmedi.');
    cached = { userId, iceServers: servers!, expiresAt: data.expiresAt };
    return servers!;
  })();
  pending = { userId, work };
  try { return await work; } finally { if (pending?.work === work) pending = null; }
}
