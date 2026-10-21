import { Text, View } from 'react-native';
import { Colors, Fonts } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';
export function Brand({ compact = false }: { compact?: boolean }) {
  const colors = Colors[useColorScheme()];
  return <View accessibilityLabel="Napan" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <View style={{ width: 29, height: 27 }} accessible={false}>
      <View style={{ position: 'absolute', top: 2, left: 0, width: 19, height: 19, borderRadius: 10, borderBottomLeftRadius: 3, backgroundColor: colors.primary }} />
      <View style={{ position: 'absolute', bottom: 0, right: 0, width: 15, height: 15, borderRadius: 8, borderBottomRightRadius: 3, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.background }} />
    </View>
    {!compact && <Text style={{ color: colors.text, fontFamily: Fonts.heading, fontSize: 23, letterSpacing: -0.7 }}>Napan</Text>}
  </View>;
}
