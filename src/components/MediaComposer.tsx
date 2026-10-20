import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { requestId } from '../lib/requestId';
import { getAssetExtension } from '../lib/media';
import { uploadFile } from '../lib/storage';

function ComposerButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) { return <TouchableOpacity disabled={disabled} onPress={onPress} style={{ padding: 14, backgroundColor: '#27324b', borderRadius: 12, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: '#fff' }}>{label}</Text></TouchableOpacity>; }

export default function MediaComposer({ conversationId, storyId, onClose, onSent }: {
  conversationId: string; storyId?: string; onClose: () => void; onSent: () => void;
}) {
  const { user } = useAuth();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [source, setSource] = useState<'gallery' | 'camera'>('gallery');
  const [mode, setMode] = useState<'keep' | 'once'>('keep');
  const lock = useRef(false);
  const pending = useRef<{ id: string; path: string; uploaded: boolean } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const pick = async (origin: 'gallery' | 'camera', video = false) => {
    setError('');
    try {
      const permission = origin === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw Error('Kamera veya galeri izni gerekli.');
      const result = origin === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: video ? ['videos'] : ['images'], quality: 0.7, videoMaxDuration: 30 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 });
      if (!result.canceled) { pending.current = null; setAsset(result.assets[0]); setSource(origin); }
    } catch (e: any) { setError(e.message); }
  };
  const send = async () => {
    if (!asset || !user || lock.current) return;
    if ((asset.fileSize || 0) > 15 * 1024 * 1024) { setError('En fazla 15 MB dosya gönderilebilir.'); return; }
    lock.current = true; setAttempted(true); setBusy(true); setError('');
    if (!pending.current) { const id = requestId(); pending.current = { id, path: `${user.id}/${id}.${getAssetExtension(asset)}`, uploaded: false }; }
    const item = pending.current;
    try {
      if (!item.uploaded) { await uploadFile('private_chat', item.path, asset.uri, true); item.uploaded = true; }
      const { error } = await supabase.rpc('send_private_media', {
        p_conversation_id: conversationId, p_object_path: item.path, p_kind: asset.type === 'video' ? 'video' : 'image',
        p_mode: mode, p_source: source, p_request_id: item.id, p_story_id: storyId || null,
      });
      if (error) throw error;
      onSent(); onClose();
    } catch (e: any) {
      // Do not delete on ambiguous transport errors: the server may have committed.
      setError(e.message || 'Gönderilemedi. Konuşmayı kontrol edip yeniden deneyin.');
      if (!item.uploaded) console.warn('Media upload did not complete.');
    } finally { lock.current = false; setBusy(false); }
  };
  return <Modal transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}><View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#000b', padding: 24 }}><View style={{ padding: 20, backgroundColor: '#131c2e', borderRadius: 20, gap: 12 }}>
    <Text style={{ color: '#fff', fontSize: 20 }}>Fotoğraf veya video gönder</Text>
    <ComposerButton label="Galeriden seç" disabled={busy || attempted} onPress={() => { void pick('gallery'); }} />
    <ComposerButton label="Kamera · fotoğraf" disabled={busy || attempted} onPress={() => { void pick('camera'); }} />
    <ComposerButton label="Kamera · video" disabled={busy || attempted} onPress={() => { void pick('camera', true); }} />
    {asset && <><Text style={{ color: '#c6d2eb' }}>{asset.type === 'video' ? 'Video' : 'Fotoğraf'} seçildi · {source === 'gallery' ? 'Galeriden paylaşıldı' : 'Anlık'}</Text>
      <ComposerButton label={`${mode === 'once' ? '●' : '○'} Tek gösterimlik`} disabled={busy || attempted} onPress={() => setMode('once')} />
      <ComposerButton label={`${mode === 'keep' ? '●' : '○'} Sohbette tut`} disabled={busy || attempted} onPress={() => setMode('keep')} />
      <Text style={{ color: '#aab5cc' }}>Tek gösterimlik içerik yeniden açılamaz. Ekran görüntüsü alınmasını engellemez.</Text>
      <ComposerButton label={attempted ? 'Gönderimi tekrar dene' : 'Gönder'} disabled={busy} onPress={() => { void send(); }} /></>}
    {!!error && <Text style={{ color: '#ff9999' }}>{error}</Text>}{busy && <ActivityIndicator />}
    <ComposerButton label="Kapat" disabled={busy} onPress={onClose} />
  </View></View></Modal>;
}
