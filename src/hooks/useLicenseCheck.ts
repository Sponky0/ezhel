import { useState, useEffect, useCallback } from 'react';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { LicenseConfig } from '@/constants/LicenseConfig';
import { secureStorageAdapter } from '@/lib/secureStorage';
import { performSecurityCheck, isDevMode } from '@/utils/security';

export type LicenseErrorType = 'expired' | 'inactive' | 'offline_required' | 'integrity_failed' | 'device_compromised' | null;

export function useLicenseCheck() {
  const [checking, setChecking] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [isValid, setIsValid] = useState(true);
  const [errorType, setErrorType] = useState<LicenseErrorType>(null);
  const [trigger, setTrigger] = useState(0);

  const performCheck = useCallback(async (isManualRetry = false) => {
    if (isManualRetry) {
      setRetrying(true);
    } else {
      setChecking(true);
    }

    try {
      let isEmulatorBypassed = false;
      let securityResult = { isSecure: true, isRooted: false, isEmulated: false };

      // 0. Root/Emulator tespiti (geliştirme modunda atlanır)
      if (!isDevMode()) {
        securityResult = await performSecurityCheck();
        if (securityResult.isRooted) {
          console.warn('Güvenlik kontrolü başarısız (Cihaz Rooted):', securityResult);
          setIsValid(false);
          setErrorType('device_compromised');
          setChecking(false);
          setRetrying(false);
          return;
        }

        if (securityResult.isEmulated) {
          try {
            const cachedEmulatorBypass = await secureStorageAdapter.getItem('emulator_mode_active');
            if (cachedEmulatorBypass === 'true') {
              isEmulatorBypassed = true;
            }
          } catch (err) {
            console.log('Önbellekten emülatör ayarı okunamadı:', err);
          }
        }
      }

      // 1. Integrity check (Package name)
      const packageName = Constants.expoConfig?.android?.package;

      if (packageName && packageName !== LicenseConfig.EXPECTED_PACKAGE_NAME) {
        console.warn('Integrity check failed: package name mismatch');
        setIsValid(false);
        setErrorType('integrity_failed');
        setChecking(false);
        setRetrying(false);
        return;
      }

      const now = new Date();

      // 2. Server Check (Supabase)
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('key, value')
          .in('key', ['demo_license_active', 'demo_expiration_date', 'emulator_mode_active']);

        if (!error && data && data.length > 0) {
          const activeSetting = data.find(item => item.key === 'demo_license_active')?.value;
          const expirySetting = data.find(item => item.key === 'demo_expiration_date')?.value;
          const emulatorActiveSetting = data.find(item => item.key === 'emulator_mode_active')?.value;

          const isDemoActive = activeSetting === 'true';
          const serverExpiryDate = expirySetting ? new Date(expirySetting) : null;
          const isEmulatorAllowed = emulatorActiveSetting === 'true';

          // Emülatör izin durumunu önbelleğe al
          await secureStorageAdapter.setItem('emulator_mode_active', emulatorActiveSetting || 'false');

          if (securityResult.isEmulated && !isEmulatorAllowed) {
            console.warn('Emülatör kullanımı engellendi (Sunucu ayarı kapalı)');
            setIsValid(false);
            setErrorType('device_compromised');
            setChecking(false);
            setRetrying(false);
            return;
          }

          if (!isDemoActive) {
            setIsValid(false);
            setErrorType('inactive');
            setChecking(false);
            setRetrying(false);
            return;
          }

          if (serverExpiryDate && now > serverExpiryDate) {
            setIsValid(false);
            setErrorType('expired');
            setChecking(false);
            setRetrying(false);
            return;
          }

          // License is valid online! Update cache (şifrelenmiş depolama)
          await secureStorageAdapter.setItem(LicenseConfig.STORAGE_KEY_LAST_CHECK, now.toISOString());
          await secureStorageAdapter.setItem(LicenseConfig.STORAGE_KEY_OFFLINE_ALLOWED, 'true');
        } else {
          throw new Error('Database query unsuccessful');
        }
      } catch (dbError) {
        console.log('Online license check failed, falling back to cache:', dbError);

        const offlineExpiry = new Date(LicenseConfig.OFFLINE_EXPIRY_DATE);
        if (now > offlineExpiry) {
          console.warn('Local offline expiry date exceeded');
          setIsValid(false);
          setErrorType('expired');
          setChecking(false);
          setRetrying(false);
          return;
        }

        // Çevrimdışı durumda, emülatörde çalışıyorsa ve önbellekte izin yoksa engelle
        if (securityResult.isEmulated && !isEmulatorBypassed) {
          console.warn('Çevrimdışı emülatör engellendi (Önbellekte izin bulunamadı veya kapalı)');
          setIsValid(false);
          setErrorType('device_compromised');
          setChecking(false);
          setRetrying(false);
          return;
        }
        
        // 4. Offline validation using cached data (şifrelenmiş depolamadan okuma)
        const lastCheckStr = await secureStorageAdapter.getItem(LicenseConfig.STORAGE_KEY_LAST_CHECK);
        const offlineAllowed = await secureStorageAdapter.getItem(LicenseConfig.STORAGE_KEY_OFFLINE_ALLOWED);

        if (!lastCheckStr || offlineAllowed !== 'true') {
          setIsValid(false);
          setErrorType('offline_required');
          setChecking(false);
          setRetrying(false);
          return;
        }

        const lastCheck = new Date(lastCheckStr);
        const timeSinceLastCheck = now.getTime() - lastCheck.getTime();

        // Prevent time-tampering (clock set backward) or exceeding grace period
        if (timeSinceLastCheck < 0 || timeSinceLastCheck > LicenseConfig.GRACE_PERIOD_MS) {
          setIsValid(false);
          setErrorType('offline_required');
          setChecking(false);
          setRetrying(false);
          return;
        }
      }

      // All checks passed
      setIsValid(true);
      setErrorType(null);
    } catch (err) {
      console.error('License check error:', err);
      setIsValid(false);
      setErrorType('offline_required');
    } finally {
      setChecking(false);
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      performCheck(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [trigger, performCheck]);

  useEffect(() => {
    // Listen to realtime database updates to lock the app immediately
    const channel = supabase
      .channel('license-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'system_settings',
        },
        (payload) => {
          const key = payload.new?.key;
          const value = payload.new?.value;

          if (key === 'demo_license_active') {
            if (value !== 'true') {
              setIsValid(false);
              setErrorType('inactive');
            } else {
              setTrigger(prev => prev + 1);
            }
          } else if (key === 'demo_expiration_date') {
            const expiry = new Date(value);
            if (new Date() > expiry) {
              setIsValid(false);
              setErrorType('expired');
            } else {
              setTrigger(prev => prev + 1);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const recheck = useCallback(async () => {
    await performCheck(true);
  }, [performCheck]);

  return { checking, retrying, isValid, errorType, recheck };
}
