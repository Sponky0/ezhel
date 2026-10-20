import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { InstagramEditor, SocialPanel } from '../components/SocialPanel';
import { ActionModal } from '../components/ActionModal';
export default function SocialScreen() {
  const { user } = useAuth(); const router = useRouter(); const params = useLocalSearchParams<{ id?: string; list?: string }>();
  const id = params.id || user?.id; const mode = params.list || 'settings';
  const [hasMore, setHasMore] = useState(false);
  const [rows, setRows] = useState<{ id: string; username: string }[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async (offset = 0) => {
    if (!user || !id) { setLoading(false); return; } setLoading(true); setError('');
    try {
      if (mode === 'blocked' || mode === 'settings') {
        const { data, error } = await supabase.rpc('blocked_accounts'); if (error) throw error; setRows(data || []); setHasMore(false);
      } else {
        const followers = mode === 'followers';
        const { data, error } = await supabase.from('follows').select(followers ? 'person:profiles!follows_follower_id_fkey(id,username)' : 'person:profiles!follows_following_id_fkey(id,username)').eq(followers ? 'following_id' : 'follower_id', id).order(followers ? 'follower_id' : 'following_id').range(offset, offset + 49);
        if (error) throw error; const page = (data || []).map((row: any) => row.person).filter(Boolean); setRows(previous => offset ? [...previous, ...page.filter((item: any) => !previous.some(p => p.id === item.id))] : page); setHasMore((data || []).length === 50);
      }
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [id, mode, user]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  const unblock = async (blockedId: string) => {
    const { error } = await supabase.from('blocks').delete().eq('blocker_id', user!.id).eq('blocked_id', blockedId);
    if (error) ActionModal.show({ title: 'Engel kaldırılamadı', message: error.message }); else await load();
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#101726' }}>
    <TouchableOpacity onPress={() => router.back()} style={{ padding: 18 }}><Text style={{ color: '#fff' }}>‹ Geri</Text></TouchableOpacity>
    {!user ? <Text style={{ color: '#fff', padding: 20 }}>Lütfen giriş yapın.</Text> : <FlatList data={rows} keyExtractor={item => item.id}
      ListHeaderComponent={<View><Text style={{ color: '#fff', fontSize: 22, padding: 16 }}>{mode === 'followers' ? 'Takipçiler' : mode === 'following' ? 'Takip edilenler' : 'Gizlilik ve profil bağlantıları'}</Text>
        {id && mode === 'settings' && <><SocialPanel userId={id} /><InstagramEditor /></>}
        {(mode === 'settings' || mode === 'blocked') && <Text style={{ color: '#fff', padding: 16 }}>Engellenen hesaplar</Text>}
        {!!error && <Text style={{ color: '#ff9393', padding: 16 }}>{error}</Text>}{loading && <ActivityIndicator />}</View>}
      renderItem={({ item }) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 18 }}><TouchableOpacity disabled={mode === 'settings' || mode === 'blocked'} onPress={() => router.push({ pathname: '/user-profile', params: { id: item.id } })}><Text style={{ color: '#fff' }}>{item.username}</Text></TouchableOpacity>
        {(mode === 'settings' || mode === 'blocked') && <TouchableOpacity onPress={() => unblock(item.id)}><Text style={{ color: '#b49cff' }}>Engeli kaldır</Text></TouchableOpacity>}</View>}
      ListFooterComponent={hasMore ? <TouchableOpacity disabled={loading} onPress={() => { void load(rows.length); }} style={{ padding: 18 }}><Text style={{ color: '#b49cff' }}>Daha fazla göster</Text></TouchableOpacity> : null}
      ListEmptyComponent={!loading && !error ? <Text style={{ color: '#aab5cc', padding: 18 }}>Henüz kayıt yok.</Text> : null} />}
  </SafeAreaView>;
}
