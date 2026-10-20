import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ActionModal } from './ActionModal';

type Summary = { followers: number; following: number; likes: number; is_following: boolean; has_instagram: boolean; instagram_cost: number };
export function SocialPanel({ userId }: { userId: string }) {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('social_summary', { p_user_id: userId });
    if (!error) setSummary(data);
  }, [userId]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  if (!user || !summary) return null;
  const follow = async () => {
    if (busy) return; setBusy(true);
    try {
      const result = summary.is_following
        ? await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', userId)
        : await supabase.from('follows').insert({ follower_id: user.id, following_id: userId });
      if (result.error) throw result.error;
      await load();
    } catch (error: any) { ActionModal.show({ title: 'İşlem tamamlanamadı', message: error.message }); }
    finally { setBusy(false); }
  };
  const instagram = () => ActionModal.show({ title: 'Instagram hesabı',
    message: user.id === userId ? 'Kendi Instagram hesabınızı açın.' : `İlk erişim ${summary.instagram_cost} elmas. Daha önce açtıysanız tekrar ücret alınmaz. Devam edilsin mi?`,
    buttons: [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Görüntüle', onPress: async () => {
      if (busy) return; setBusy(true);
      try {
        const { data, error } = await supabase.rpc('unlock_instagram', { p_owner_id: userId });
        if (error) throw error;
        if (typeof data !== 'string' || !data.startsWith('https://www.instagram.com/')) throw Error('Bağlantı geçersiz.');
        await refreshProfile(); await Linking.openURL(data);
      } catch (error: any) { ActionModal.show({ title: 'Instagram açılamadı', message: error.message }); }
      finally { setBusy(false); }
    } }],
  });
  return <View style={{ padding: 12, gap: 12, backgroundColor: '#182032', borderRadius: 16, margin: 12 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
      {(['followers', 'following', 'likes'] as const).map((key, i) => <TouchableOpacity key={key} disabled={key === 'likes'}
        onPress={() => router.push({ pathname: '/social', params: { id: userId, list: key } })}>
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>{summary[key]}</Text>
        <Text style={{ color: '#b9c5dd' }}>{['Takipçi', 'Takip', 'Beğeni'][i]}</Text>
      </TouchableOpacity>)}
    </View>
    {user.id !== userId && <TouchableOpacity disabled={busy} onPress={follow}><Text style={{ color: '#b49cff', textAlign: 'center' }}>{summary.is_following ? 'Takibi bırak' : 'Takip et'}</Text></TouchableOpacity>}
    {summary.has_instagram && <TouchableOpacity disabled={busy} onPress={instagram}><Text style={{ color: '#ff9dd2', textAlign: 'center' }}>Instagram hesabını görüntüle</Text></TouchableOpacity>}
    {busy && <ActivityIndicator />}
  </View>;
}

export function InstagramEditor() {
  const { user } = useAuth();
  const [handle, setHandle] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!user) return;
    void supabase.from('instagram_accounts').select('handle').eq('user_id', user.id).maybeSingle().then(({ data }) => { if (data) setHandle(data.handle); });
  }, [user]);
  const save = async () => {
    if (!user || saving) return;
    const clean = handle.trim().replace(/^https:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '').replace(/^@/, '');
    if (clean && !/^[A-Za-z0-9_.]{1,30}$/.test(clean)) { ActionModal.show({ title: 'Geçersiz Instagram hesabı', message: 'Yalnızca Instagram kullanıcı adını girin.' }); return; }
    setSaving(true);
    try {
      const { error } = clean ? await supabase.from('instagram_accounts').upsert({ user_id: user.id, handle: clean }) : await supabase.from('instagram_accounts').delete().eq('user_id', user.id);
      if (error) throw error;
      ActionModal.show({ title: 'Kaydedildi', message: 'Instagram hesabınıza ilk erişim elmas karşılığında açılır. Adresiniz public profil verisine eklenmez.' });
    } catch (error: any) { ActionModal.show({ title: 'Kaydedilemedi', message: error.message }); }
    finally { setSaving(false); }
  };
  return <View style={{ gap: 12, padding: 16, backgroundColor: '#182032', borderRadius: 16, marginVertical: 12 }}><Text style={{ color: '#fff' }}>Instagram hesabı (isteğe bağlı)</Text>
    <Text style={{ color: '#aab5cc' }}>Kaydederek hesabınıza ücretli erişim sunmayı kabul edersiniz. İstediğiniz zaman boş bırakıp kaldırabilirsiniz.</Text>
    <TextInput accessibilityLabel="Instagram kullanıcı adı" autoCapitalize="none" value={handle} onChangeText={setHandle} placeholder="kullanici_adi" placeholderTextColor="#888" style={{ backgroundColor: '#25304a', color: '#fff', padding: 14, borderRadius: 12 }} />
    <TouchableOpacity disabled={saving} onPress={save}><Text style={{ color: '#b49cff' }}>{saving ? 'Kaydediliyor…' : 'Instagram hesabını kaydet / kaldır'}</Text></TouchableOpacity>
  </View>;
}
