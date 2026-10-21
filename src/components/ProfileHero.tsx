import { Image } from 'expo-image';
import { Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Fonts } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';
export default function ProfileHero({ name, uri, bio, verified, onEdit }: { name: string; uri?: string | null; bio?: string | null; verified?: boolean; onEdit: () => void }) {
  const colors = Colors[useColorScheme()];
  return <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: colors.backgroundElement, borderWidth: 1, borderColor: colors.border, marginTop: 8 }}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Profil bilgilerini düzenle" onPress={onEdit} activeOpacity={0.9}>
      <Image source={uri ? { uri } : require('../../assets/images/place-holder.png')} style={{ width: '100%', aspectRatio: 1.28 }} contentFit="cover" />
    </TouchableOpacity>
    <View style={{ padding: 20, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: colors.text, fontFamily: Fonts.heading, fontSize: 27, letterSpacing: -0.6 }}>{name}</Text>{verified && <Ionicons accessibilityLabel="E-posta doğrulandı" name="checkmark-circle" size={20} color={colors.accent} />}</View>
      {!!bio && <Text style={{ color: colors.textSecondary, fontFamily: Fonts.body, fontSize: 15, lineHeight: 23 }}>{bio}</Text>}
      <TouchableOpacity accessibilityRole="button" onPress={onEdit} style={{ minHeight: 46, borderRadius: 12, backgroundColor: colors.backgroundSelected, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}><Ionicons name="create-outline" size={18} color={colors.text} /><Text style={{ color: colors.text, fontFamily: Fonts.bodyMedium }}>Profili düzenle</Text></TouchableOpacity>
    </View>
  </View>;
}
