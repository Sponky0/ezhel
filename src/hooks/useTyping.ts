import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
export function useTyping(conversationId: string, userId?: string) {
  const [typing, setTyping] = useState<{ conversation: string; active: boolean } | null>(null); const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSent = useRef(0); const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!conversationId || !userId) return;
    let timer: ReturnType<typeof setTimeout>; let ready = false;
    const channel = supabase.channel(`typing:${conversationId}`, { config: { private: true } }).on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload.userId === userId) return;
      setTyping({ conversation: conversationId, active: payload.active === true }); clearTimeout(timer);
      timer = setTimeout(() => setTyping({ conversation: conversationId, active: false }), 4000);
    }).subscribe(status => { ready = status === 'SUBSCRIBED'; });
    channelRef.current = channel;
    return () => {
      if (ready) void channel.send({ type: 'broadcast', event: 'typing', payload: { userId, active: false } });
      clearTimeout(timer); if (stopTimer.current) clearTimeout(stopTimer.current);
      channelRef.current = null; void supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);
  const sendTyping = useCallback((active: boolean) => {
    const channel = channelRef.current;
    if (!channel || !userId) return;
    if (active && Date.now() - lastSent.current < 1200) return;
    lastSent.current = Date.now();
    void channel.send({ type: 'broadcast', event: 'typing', payload: { userId, active } });
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (active) stopTimer.current = setTimeout(() => { void channel.send({ type: 'broadcast', event: 'typing', payload: { userId, active: false } }); }, 2500);
  }, [userId]);
  return { peerTyping: typing?.conversation === conversationId && typing.active, sendTyping };
}
