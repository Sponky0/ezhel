import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Text, TouchableOpacity, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri, useCaching: false }, player => { player.play(); });
  return <VideoView player={player} nativeControls style={{ flex: 1 }} contentFit="contain" />;
}
export default function MessageMedia({ message }: { message: { id: string; sender_id: string; media_kind?: string; media_mode?: string; media_source?: string; media_opened_at?: string | null } }) {
  const { user } = useAuth(); const [uri, setUri] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const lock = useRef(false);
  const fileRef = useRef<string | null>(null); const active = useRef(true); const [redeemed, setRedeemed] = useState(false);
  const close = () => { setUri(null); if (fileRef.current) { void FileSystem.deleteAsync(fileRef.current, { idempotent: true }); fileRef.current = null; } };
  useEffect(() => { active.current = true; return () => { active.current = false; if (fileRef.current) void FileSystem.deleteAsync(fileRef.current, { idempotent: true }); }; }, []);
  const onceRecipient = message.media_mode === 'once' && message.sender_id !== user?.id;
  const open = async () => {
    if (lock.current || (onceRecipient && (message.media_opened_at || redeemed))) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const { data, error } = await supabase.functions.invoke('read-message-media', { body: { messageId: message.id } });
      if (error || !data?.base64) throw Error('İçerik açılamıyor. Tek gösterimlik içerik daha önce açılmış olabilir.');
      if (onceRecipient) setRedeemed(true);
      let nextUri: string;
      if (Platform.OS === 'web') nextUri = `data:${data.mime};base64,${data.base64}`;
      else {
        const extension = data.kind === 'video' ? 'mp4' : 'jpg';
        const path = `${FileSystem.cacheDirectory}private-${message.id}.${extension}`;
        await FileSystem.writeAsStringAsync(path, data.base64, { encoding: FileSystem.EncodingType.Base64 });
        if (!active.current) { await FileSystem.deleteAsync(path, { idempotent: true }); return; }
        fileRef.current = path; nextUri = path;
      }
      if (active.current) setUri(nextUri);
    } catch (e: any) { if (active.current) setError(e.message); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  };
  return <View style={{ gap: 6 }}><TouchableOpacity disabled={busy || !!(onceRecipient && (message.media_opened_at || redeemed))} onPress={() => { void open(); }}>
    <Text style={{ color: '#a6bfff', padding: 12 }}>{message.media_kind === 'video' ? '▶ Video' : '▧ Fotoğraf'} · {message.media_mode === 'once' ? (message.media_opened_at || redeemed ? 'Görüntülendi' : 'Tek gösterimlik') : 'Görüntüle'}</Text>
    <Text style={{ color: '#9ba8bf', fontSize: 11 }}>{message.media_source === 'camera' ? 'Anlık' : 'Galeriden paylaşıldı'}</Text>
  </TouchableOpacity>{busy && <ActivityIndicator />}{!!error && <Text style={{ color: '#ff9999' }}>{error}</Text>}
    <Modal visible={!!uri} onRequestClose={close}><View style={{ flex: 1, backgroundColor: '#000' }}>
      <TouchableOpacity onPress={close} style={{ padding: 28 }}><Text style={{ color: '#fff' }}>Kapat</Text></TouchableOpacity>
      {uri && (message.media_kind === 'video' ? <Video uri={uri} /> : <Image source={{ uri }} style={{ flex: 1 }} resizeMode="contain" />)}
    </View></Modal>
  </View>;
}
