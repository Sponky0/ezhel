import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Fonts } from '@/constants/theme';
import { LicenseErrorType } from '@/hooks/useLicenseCheck';

interface LicenseBlockerScreenProps {
  errorType: LicenseErrorType;
  onRetry: () => void;
  retrying?: boolean;
}

export default function LicenseBlockerScreen({ errorType, onRetry, retrying = false }: LicenseBlockerScreenProps) {
  const getErrorDetails = () => {
    switch (errorType) {
      case 'expired':
        return {
          icon: 'time-outline' as const,
          iconColor: '#F59E0B', // Amber
          title: 'Değerlendirme Süresi Doldu',
          description: 'Bu uygulamanın demo kullanım süresi sona ermiştir. Sunumu gerçekleştiren yönetici veya geliştirici ile iletişime geçiniz.',
        };
      case 'inactive':
        return {
          icon: 'lock-closed-outline' as const,
          iconColor: '#EF4444', // Red
          title: 'Demo Erişimi Durduruldu',
          description: 'Bu demo sürümüne erişim uzaktan durdurulmuştur. Devam etmek için lütfen yöneticinizle iletişime geçiniz.',
        };
      case 'offline_required':
        return {
          icon: 'wifi-outline' as const,
          iconColor: '#3B82F6', // Blue
          title: 'İnternet Bağlantısı Gerekli',
          description: 'Lisans doğrulaması yapılamadı. Güvenliğiniz için uygulamanın en azından ilk açılışta veya belirli aralıklarla internete bağlı olması gerekmektedir.',
        };
      case 'integrity_failed':
        return {
          icon: 'alert-circle-outline' as const,
          iconColor: '#EF4444', // Red
          title: 'Güvenlik İhlali Tespit Edildi',
          description: 'Uygulama bütünlüğü bozulmuş veya lisanssız kopyalanmış olabilir. Güvenlik protokolleri gereği erişim engellenmiştir.',
        };
      case 'device_compromised':
        return {
          icon: 'shield-outline' as const,
          iconColor: '#DC2626', // Deep Red
          title: 'Güvensiz Cihaz Tespit Edildi',
          description: 'Bu cihaz root edilmiş veya bir emülatör üzerinde çalıştırılıyor. Güvenlik protokolleri gereği uygulama erişimi engellenmiştir.',
        };
      default:
        return {
          icon: 'alert-circle-outline' as const,
          iconColor: '#EF4444', // Red
          title: 'Güvenlik İhlali Tespit Edildi',
          description: 'Uygulama bütünlüğü bozulmuş veya lisanssız kopyalanmış olabilir. Güvenlik protokolleri gereği erişim engellenmiştir.',
        };
    }
  };

  const details = getErrorDetails();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Glow effect background */}
        <View style={[styles.glow, { backgroundColor: details.iconColor + '15' }]} />
        
        {/* Icon */}
        <View style={[styles.iconWrapper, { borderColor: details.iconColor + '40', backgroundColor: details.iconColor + '0D' }]}>
          <Ionicons name={details.icon} size={64} color={details.iconColor} />
        </View>

        {/* Text Details */}
        <Text style={styles.title}>{details.title}</Text>
        <Text style={styles.description}>{details.description}</Text>

        {/* Action Button */}
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: details.iconColor }]} 
          onPress={onRetry}
          disabled={retrying}
        >
          {retrying ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={20} color="#FFFFFF" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Yeniden Dene</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>Napan Secure Shield v1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C1014',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#121620',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1C212E',
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    height: 150,
    borderRadius: 75,
    filter: 'blur(40px)' as any, // React Native doesn't support filter blur natively, but we define it nicely
  },
  iconWrapper: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: Fonts.heading,
    color: '#F5F5F7',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    fontFamily: Fonts.body,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    flexDirection: 'row',
    height: 52,
    width: '100%',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: Fonts.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  footer: {
    marginTop: 24,
    fontSize: 11,
    color: '#3A3A3C',
    fontFamily: Fonts.mono,
  },
});
