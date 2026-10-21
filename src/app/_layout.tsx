import ForegroundBanner from '../components/ForegroundBanner';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationProvider, Stack, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CallProvider, useCall } from '@/contexts/CallContext';
import { UnreadMessagesProvider } from '@/contexts/UnreadMessagesContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import LoginScreen from '../components/LoginScreen';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Fonts, Colors } from '@/constants/theme';
import { ActionModalRoot } from '@/components/ActionModal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppThemeProvider } from '@/contexts/ThemeContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications } from '@/hooks/use-notifications';
import { useLicenseCheck } from '@/hooks/useLicenseCheck';
import LicenseBlockerScreen from '@/components/LicenseBlockerScreen';

SplashScreen.preventAutoHideAsync();

function AppContent() {
  const { checking: licenseChecking, retrying: licenseRetrying, isValid: isLicenseValid, errorType: licenseErrorType, recheck: recheckLicense } = useLicenseCheck();
  const {
    user,
    loading,
    authError, retryAuth,
    profile,
    maintenanceMode,
    isLoginModalVisible,
    hideLoginModal,
    showCongratsModal,
    setShowCongratsModal
  } = useAuth();
  const scheme = useColorScheme();
  const pathname = usePathname();
  const router = useRouter();
  const { callStatus, peerName, endCall } = useCall();
  const insets = useSafeAreaInsets();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  // Register push notifications when user is authenticated
  useNotifications();

  if (licenseChecking) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isLicenseValid && licenseErrorType) {
    return (
      <LicenseBlockerScreen
        errorType={licenseErrorType}
        onRetry={recheckLicense}
        retrying={licenseRetrying}
      />
    );
  }

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (authError) return <View style={styles.loadingContainer}><Text style={{ color: '#fff', padding: 20 }}>{authError}</Text><TouchableOpacity onPress={retryAuth}><Text style={{ color: '#aa99ff' }}>Tekrar dene</Text></TouchableOpacity></View>;

  // Maintenance mode redirect (Non-admins only)
  if (maintenanceMode && profile?.role !== 'admin') {
    return (
      <View style={[styles.maintenanceContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.maintenanceIconWrapper, { backgroundColor: colors.vip + '1A' }]}>
          <Ionicons name="hammer-outline" size={60} color={colors.vip} />
        </View>
        <Text style={[styles.maintenanceText, { color: colors.text }]}>
          Sistem Bakımdadır <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Text>
        <Text style={[styles.maintenanceSubText, { color: colors.textSecondary }]}>
          Sizlere daha iyi bir deneyim sunmak için uygulamamızı kısa süreliğine bakıma aldık. Lütfen daha sonra tekrar deneyin.
        </Text>
      </View>
    );
  }

  if (profile?.banned_at) {
    return (
      <View style={[styles.bannedContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.bannedText, { color: '#EF4444' }]}>Hesabınız askıya alınmıştır.</Text>
        <Text style={[styles.bannedSubText, { color: colors.textSecondary }]}>
          Kullanım kuralları ihlal edildiği için bu hesaba erişim engellendi.
        </Text>
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const showActiveCallBanner = callStatus !== 'idle' && callStatus !== 'disconnected' && callStatus !== 'rejected' && callStatus !== 'busy' && callStatus !== 'no_answer' && pathname !== '/voice-call';

  return (
    <>
      <AnimatedSplashOverlay />
      <ForegroundBanner />
      {showActiveCallBanner && (
        <TouchableOpacity
          style={[styles.activeCallBanner, { top: insets.top > 0 ? insets.top + 8 : 16 }]}
          onPress={() => {
            router.push('/voice-call');
          }}
          activeOpacity={0.9}
        >
          <View style={styles.activeCallBannerLeft}>
            <Ionicons name="call" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.activeCallText} numberOfLines={1}>
              {peerName} ile aktif arama ({callStatus === 'connected' ? 'Bağlandı' : 'Aranıyor...'})
            </Text>
          </View>
          <TouchableOpacity style={styles.endCallButtonSmall} onPress={endCall} hitSlop={12}>
            <Ionicons name="close-circle" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat-room"
          options={{
            headerShown: false,
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen
          name="user-profile"
          options={{
            headerShown: false,
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen
          name="admin"
          options={{
            headerShown: false,
            animation: 'slide_from_bottom'
          }}
        />
        <Stack.Screen
          name="voice-call"
          options={{
            headerShown: false,
            animation: 'fade'
          }}
        />
      </Stack>

      <Modal
        visible={isLoginModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={hideLoginModal}
      >
        <LoginScreen onClose={hideLoginModal} />
      </Modal>

      <Modal
        visible={showCongratsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCongratsModal(false)}
      >
        <CongratsModalContent onClose={() => setShowCongratsModal(false)} />
      </Modal>
    </>
  );
}

function CongratsModalContent({ onClose }: { onClose: () => void }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <View style={styles.congratsOverlay}>
      <View style={[styles.congratsCard, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
        <View style={styles.congratsEmojiContainer}>
          <MaterialCommunityIcons name="party-popper" size={48} color={colors.primary} />
          <Ionicons name="happy-outline" size={48} color={colors.vip} />
        </View>
        <Text style={[styles.congratsTitle, { color: colors.text }]}>
          Tebrikler! <Ionicons name="sparkles" size={24} color="#FBBF24" />
        </Text>
        <Text style={[styles.congratsSubtitle, { color: colors.textSecondary }]}>
          Kaydınız başarıyla tamamlandı. Aramıza hoş geldiniz!
        </Text>
        <Text style={[styles.congratsDescription, { color: colors.textSecondary }]}>
          Profiliniz oluşturuldu. Şimdi yeni insanlarla tanışmaya ve anonim olarak sohbet etmeye başlayabilirsiniz.
        </Text>

        <TouchableOpacity
          style={[styles.congratsButton, { backgroundColor: colors.action }]}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Text style={styles.congratsButtonText}>Hadi Başlayalım!</Text>
          <Ionicons name="rocket-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AppContentWithNavigationTheme() {
  const scheme = useColorScheme();
  return (
    <NavigationProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <UnreadMessagesProvider>
        <CallProvider>
          <AppContent />
          <ActionModalRoot />
        </CallProvider>
      </UnreadMessagesProvider>
    </NavigationProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <AuthProvider>
          <AppContentWithNavigationTheme />
        </AuthProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}


const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D1728',
  },
  bannedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D1728',
    padding: 20,
  },
  bannedText: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: Fonts.heading,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 10,
  },
  bannedSubText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  maintenanceContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D1728',
    padding: 30,
    gap: 15,
  },
  maintenanceIconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  maintenanceText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  maintenanceSubText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  activeCallBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1EBEA5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  activeCallBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  activeCallText: {
    color: '#FFFFFF',
    fontFamily: Fonts.heading,
    fontSize: 14,
    flex: 1,
  },
  endCallButtonSmall: {
    padding: 4,
  },
  congratsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 14, 26, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  congratsCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  congratsEmojiContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  congratsEmoji: {
    fontSize: 48,
  },
  congratsEmoji2: {
    fontSize: 48,
  },
  congratsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: Fonts.heading,
    textAlign: 'center',
    marginBottom: 12,
  },
  congratsSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.bodyMedium,
    textAlign: 'center',
    marginBottom: 8,
  },
  congratsDescription: {
    fontSize: 13,
    fontFamily: Fonts.body,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 28,
  },
  congratsButton: {
    width: '100%',
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  congratsButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
  },
});
