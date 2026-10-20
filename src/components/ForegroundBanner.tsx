import { useEffect, useRef, useState } from 'react';
import { AppState, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useCall } from '../contexts/CallContext';
import { supabase } from '../lib/supabase';
export default function ForegroundBanner() {
  const { user, profile } = useAuth(); const { callStatus } = useCall();
  const pathname = usePathname(); const params = useLocalSearchParams(); const router = useRouter(); const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<{ id: string; conversation: string; sender: string; text: string; account: string } | null>(null);
  const state = useRef({ pathname, id: params.id, enabled: profile?.notification_messages !== false });
  useEffect(() => { state.current = { pathname, id: params.id, enabled: profile?.notification_messages !== false }; }, [pathname, params.id, profile?.notification_messages]);
  useEffect(() => {
    if (!user) return;
    let active = true; const seen = new Set<string>();
    const channel = supabase.channel(`foreground:${user.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async ({ new: row }: any) => {
      if (!active || row.sender_id === user.id || seen.has(row.id) || AppState.currentState !== 'active' || !state.current.enabled) return;
      if (state.current.pathname.includes('chat-room') && state.current.id === row.conversation_id) return;
      seen.add(row.id); if (seen.size > 100) seen.delete(seen.values().next().value!);
      const { data } = await supabase.from('profiles').select('username').eq('id', row.sender_id).maybeSingle();
      if (active) setNotice({ id: row.id, account: user.id, conversation: row.conversation_id, sender: data?.username || 'Yeni mesaj', text: row.private_media ? 'Medya gönderdi' : (row.content || 'Fotoğraf gönderdi') });
    }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [user]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(timer); }, [notice]);
  if (!notice || notice.account !== user?.id || callStatus !== 'idle') return null;
  return <TouchableOpacity accessibilityRole="button" onPress={() => { setNotice(null); router.push({ pathname: '/chat-room', params: { id: notice.conversation, name: notice.sender } }); }}
    style={{ position: 'absolute', zIndex: 1000, elevation: 20, top: insets.top + 8, left: 12, right: 12, backgroundColor: '#242b42', borderRadius: 14, padding: 16 }}>
    <Text style={{ color: '#fff', fontWeight: '700' }}>{notice.sender}</Text><Text style={{ color: '#c9d1e3' }} numberOfLines={2}>{notice.text}</Text>
  </TouchableOpacity>;
}
