/**
 * SecureStore tabanlı depolama adapter'ı
 * Supabase auth token'ları ve hassas verileri şifrelenmiş olarak saklar.
 * 
 * - Android: EncryptedSharedPreferences (AES-256)
 * - iOS: Keychain
 * - Web: localStorage fallback (SecureStore web'de desteklenmez)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Supabase client için uyumlu storage adapter.
 * Native platformlarda SecureStore, web'de localStorage kullanır.
 */
export const secureStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return null;
      return window.localStorage.getItem(key);
    }

    try {
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      console.warn('SecureStore getItem failed:', err);
      return AsyncStorage.getItem(key);
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(key, value);
      return;
    }

    try {
      await SecureStore.setItemAsync(key, value);
    } catch (err) {
      console.warn('SecureStore setItem failed:', err);
      // SecureStore değer boyutu sınırına takılırsa AsyncStorage'a düş
      // (Supabase session token'ları büyük olabilir)
      try {
        await AsyncStorage.setItem(key, value);
      } catch {
        // Son çare: sessizce başarısız ol
      }
    }
  },

  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(key);
      return;
    }

    try {
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      console.warn('SecureStore removeItem failed:', err);
      await AsyncStorage.removeItem(key);
    }
  },
};
