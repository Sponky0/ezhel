import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Colors, Fonts } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ActionModal } from './ActionModal';

type Summary = { followers: number; super_messages: number; likes: number; is_following: boolean; has_instagram: boolean; instagram_cost: number };
export function SocialPanel({ userId }: { userId: string }) {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const colors = Colors[useColorScheme()];
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('social_summary', { p_user_id: userId });
    if (!error) setSummary(data);
  }, [userId]);
  useFocusEffect(useCallback(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]));
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
  return <View style={{ width: '100%', padding: 16, gap: 12, backgroundColor: colors.backgroundElement, borderRadius: 18, borderWidth: 1, borderColor: colors.border, marginVertical: 16 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
      {(['followers', 'super_messages', 'likes'] as const).map((key, i) => <TouchableOpacity key={key} disabled={key !== 'followers'}
        onPress={() => router.push({ pathname: '/social', params: { id: userId, list: key } })}>
        <Text style={{ color: colors.text, textAlign: 'center', fontFamily: Fonts.heading, fontSize: 23, marginBottom: 5 }}>{summary[key]}</Text>
        <Text style={{ color: colors.textSecondary, fontFamily: Fonts.body, fontSize: 12 }}>{['Takipçiler', 'Süper mesaj', 'Beğeni'][i]}</Text>
      </TouchableOpacity>)}
    </View>
    {user.id !== userId && <TouchableOpacity disabled={busy} onPress={follow}><Text style={{ color: colors.primary, textAlign: 'center', fontFamily: Fonts.bodyMedium, padding: 12 }}>{summary.is_following ? 'Takibi bırak' : 'Takip et'}</Text></TouchableOpacity>}
    {summary.has_instagram && <TouchableOpacity disabled={busy} onPress={instagram}><Text style={{ color: colors.accent, textAlign: 'center', fontFamily: Fonts.bodyMedium, padding: 12 }}>Instagram hesabını görüntüle</Text></TouchableOpacity>}
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
  return <View style={{ gap: 12, padding: 16, backgroundColor: '#172237', borderRadius: 16, marginVertical: 12 }}><Text style={{ color: '#fff' }}>Instagram hesabı (isteğe bağlı)</Text>
    <Text style={{ color: '#aab5cc' }}>Kaydederek hesabınıza ücretli erişim sunmayı kabul edersiniz. İstediğiniz zaman boş bırakıp kaldırabilirsiniz.</Text>
    <TextInput accessibilityLabel="Instagram kullanıcı adı" autoCapitalize="none" value={handle} onChangeText={setHandle} placeholder="kullanici_adi" placeholderTextColor="#888" style={{ backgroundColor: '#23304A', color: '#fff', padding: 14, borderRadius: 12 }} />
    <TouchableOpacity disabled={saving} onPress={save}><Text style={{ color: '#BCADDC' }}>{saving ? 'Kaydediliyor…' : 'Instagram hesabını kaydet / kaldır'}</Text></TouchableOpacity>
  </View>;
}
