/**
 * Güvenlik yardımcı fonksiyonları
 * - Root / Emulator tespiti
 * - Login brute force koruması (throttling)
 * - Input sanitizasyonu
 */

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// 1. ROOT / EMULATOR TESPİTİ
// ============================================================

/**
 * Emülatör üzerinde çalışıp çalışmadığını kontrol eder.
 * expo-device kütüphanesini kullanır.
 */
export function isEmulator(): boolean {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;
  return !Device.isDevice;
}

/**
 * Android cihazın root edilmiş olup olmadığını basit dosya kontrolü ile tespit eder.
 * Not: Bu kontrol %100 güvenilir değildir, gelişmiş root gizleme araçlarını
 * (Magisk Hide vb.) atlayabilir. Ancak temel bir güvenlik katmanı sağlar.
 */
export async function isDeviceRooted(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    // React Native'de dosya sistemi kontrolü için expo-file-system kullanıyoruz
    const suspiciousPaths = [
      '/system/app/Superuser.apk',
      '/system/xbin/su',
      '/system/bin/su',
      '/sbin/su',
      '/data/local/xbin/su',
      '/data/local/bin/su',
      '/system/sd/xbin/su',
      '/system/bin/failsafe/su',
      '/data/local/su',
      '/su/bin/su',
    ];

    for (const path of suspiciousPaths) {
      try {
        const info = await FileSystem.getInfoAsync(`file://${path}`);
        if (info.exists) return true;
      } catch {
        // Dosya erişim hatası — root değil veya erişim engellendi
      }
    }

    return false;
  } catch {
    return false;
  }
}

export type SecurityCheckResult = {
  isSecure: boolean;
  isRooted: boolean;
  isEmulated: boolean;
};

/**
 * Tam güvenlik kontrolü çalıştırır.
 * Geliştirme modunda bypass edilebilir (dev bypass flag'i ile).
 * 
 * @param enforceLock true ise emülatör/root tespit edildiğinde uygulamayı kilitler
 */
export async function performSecurityCheck(): Promise<SecurityCheckResult> {
  const emulated = isEmulator();
  const rooted = await isDeviceRooted();

  return {
    isSecure: !emulated && !rooted,
    isRooted: rooted,
    isEmulated: emulated,
  };
}

/**
 * __DEV__ modundayken güvenlik kontrolünü bypass etmek için kullanılır.
 * Sadece geliştirme aşamasında aktiftir.
 */
export function isDevMode(): boolean {
  return __DEV__;
}

// ============================================================
// 2. LOGIN BRUTE FORCE KORUMASI (THROTTLING)
// ============================================================

const LOGIN_ATTEMPTS_KEY = '@rancha_login_attempts';
const LOGIN_LOCKOUT_KEY = '@rancha_login_lockout_until';

interface LoginAttemptData {
  count: number;
  lastAttemptAt: number;
}

// Artan bekleme süreleri (saniye): 1. hata=0, 3. hata=5sn, 5. hata=15sn, 7+=60sn
const THROTTLE_TIERS = [
  { maxAttempts: 3, delaySec: 0 },
  { maxAttempts: 5, delaySec: 5 },
  { maxAttempts: 7, delaySec: 15 },
  { maxAttempts: 10, delaySec: 30 },
  { maxAttempts: Infinity, delaySec: 60 },
];

const LOCKOUT_THRESHOLD = 10;       // 10 başarısız deneme → 15 dk kilitleme
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 dakika
const ATTEMPT_RESET_MS = 30 * 60 * 1000;    // 30 dakika sonra sayaç sıfırlanır

/**
 * Mevcut login deneme sayısını ve kilitleme durumunu döndürür.
 */
export async function getLoginThrottleState(): Promise<{
  isLocked: boolean;
  lockoutRemainingMs: number;
  requiredDelayMs: number;
  attemptCount: number;
}> {
  try {
    // Kilitleme kontrolü
    const lockoutStr = await AsyncStorage.getItem(LOGIN_LOCKOUT_KEY);
    if (lockoutStr) {
      const lockoutUntil = parseInt(lockoutStr, 10);
      const now = Date.now();
      if (now < lockoutUntil) {
        return {
          isLocked: true,
          lockoutRemainingMs: lockoutUntil - now,
          requiredDelayMs: 0,
          attemptCount: LOCKOUT_THRESHOLD,
        };
      } else {
        // Kilitleme süresi dolmuş, temizle
        await AsyncStorage.multiRemove([LOGIN_LOCKOUT_KEY, LOGIN_ATTEMPTS_KEY]);
      }
    }

    // Deneme sayısı kontrolü
    const attemptsStr = await AsyncStorage.getItem(LOGIN_ATTEMPTS_KEY);
    if (!attemptsStr) {
      return { isLocked: false, lockoutRemainingMs: 0, requiredDelayMs: 0, attemptCount: 0 };
    }

    const data: LoginAttemptData = JSON.parse(attemptsStr);
    
    // 30 dakika geçtiyse sayaç sıfırla
    if (Date.now() - data.lastAttemptAt > ATTEMPT_RESET_MS) {
      await AsyncStorage.removeItem(LOGIN_ATTEMPTS_KEY);
      return { isLocked: false, lockoutRemainingMs: 0, requiredDelayMs: 0, attemptCount: 0 };
    }

    // Uygun bekleme süresini hesapla
    let delaySec = 0;
    for (const tier of THROTTLE_TIERS) {
      if (data.count < tier.maxAttempts) {
        delaySec = tier.delaySec;
        break;
      }
      delaySec = tier.delaySec;
    }

    return {
      isLocked: false,
      lockoutRemainingMs: 0,
      requiredDelayMs: delaySec * 1000,
      attemptCount: data.count,
    };
  } catch {
    return { isLocked: false, lockoutRemainingMs: 0, requiredDelayMs: 0, attemptCount: 0 };
  }
}

/**
 * Başarısız login denemesini kaydeder.
 * 10 başarısız denemeden sonra 15 dakika kilitleme uygular.
 */
export async function recordFailedLoginAttempt(): Promise<void> {
  try {
    const attemptsStr = await AsyncStorage.getItem(LOGIN_ATTEMPTS_KEY);
    let data: LoginAttemptData = attemptsStr
      ? JSON.parse(attemptsStr)
      : { count: 0, lastAttemptAt: Date.now() };

    // 30 dakika geçtiyse sıfırla
    if (Date.now() - data.lastAttemptAt > ATTEMPT_RESET_MS) {
      data = { count: 0, lastAttemptAt: Date.now() };
    }

    data.count += 1;
    data.lastAttemptAt = Date.now();

    await AsyncStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(data));

    // Kilitleme eşiğine ulaşıldıysa
    if (data.count >= LOCKOUT_THRESHOLD) {
      const lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      await AsyncStorage.setItem(LOGIN_LOCKOUT_KEY, lockoutUntil.toString());
    }
  } catch (err) {
    console.error('Login attempt recording failed:', err);
  }
}

/**
 * Başarılı login sonrası sayaçları sıfırlar.
 */
export async function resetLoginAttempts(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([LOGIN_ATTEMPTS_KEY, LOGIN_LOCKOUT_KEY]);
  } catch {
    // Sessizce başarısız olabilir
  }
}

// ============================================================
// 3. INPUT SANİTİZASYONU
// ============================================================

/**
 * HTML/script tag'lerini temizler.
 * React Native'de XSS riski düşük olsa da web target ve veritabanı güvenliği için önemlidir.
 */
export function sanitizeText(input: string): string {
  if (!input) return '';
  
  return input
    // Script ve HTML tag'lerini kaldır
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    // Null byte'ları kaldır
    .replace(/\0/g, '')
    // Kontrol karakterlerini kaldır (tab ve newline hariç)
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

/**
 * Kullanıcı adını sanitize eder.
 * Sadece harf, rakam, alt çizgi ve tire karakterlerine izin verir.
 */
export function sanitizeUsername(input: string): string {
  if (!input) return '';
  return input
    .replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF]/g, '')
    .trim()
    .substring(0, 20);
}

/**
 * Mesaj içeriğini sanitize eder.
 * HTML taglerini temizler ve maksimum uzunluğu 2000 karakterle sınırlar.
 */
export function sanitizeMessage(input: string): string {
  if (!input) return '';
  return sanitizeText(input).substring(0, 2000);
}

/**
 * Bio metnini sanitize eder.
 * HTML taglerini temizler ve maksimum uzunluğu 500 karakterle sınırlar.
 */
export function sanitizeBio(input: string): string {
  if (!input) return '';
  return sanitizeText(input).substring(0, 500);
}
