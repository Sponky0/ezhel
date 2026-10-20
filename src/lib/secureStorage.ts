import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
// At most 400 Unicode code points (1600 UTF-8 bytes); never split a surrogate pair.
const chunkSize = 400;
type Manifest = { generation: string; count: number };
async function manifest(key: string): Promise<Manifest | null> {
  const raw = await SecureStore.getItemAsync(`${key}.manifest`);
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (!/^[a-z0-9]+$/.test(value.generation) || !Number.isInteger(value.count) || value.count < 1 || value.count > 100) throw new Error('Oturum kaydı okunamadı.');
  return value;
}
const keys = (key: string, data: Manifest) => Array.from({ length: data.count }, (_, i) => `${key}.${data.generation}.${i}`);
export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    const data = await manifest(key);
    if (data) {
      const parts = await Promise.all(keys(key, data).map(key => SecureStore.getItemAsync(key)));
      if (parts.some(value => value === null)) throw new Error('Oturum kaydı eksik. Tekrar giriş yapın.');
      return parts.join('');
    }
    const secure = await SecureStore.getItemAsync(key);
    if (secure !== null) return secure;
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) await secureStorageAdapter.setItem(key, legacy);
    return legacy;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); return; }
    const old = await manifest(key);
    const characters = Array.from(value);
    const parts = Array.from({ length: Math.ceil(characters.length / chunkSize) || 1 }, (_, i) => characters.slice(i * chunkSize, (i + 1) * chunkSize).join(''));
    const next = { generation: Date.now().toString(36) + Math.random().toString(36).slice(2, 10), count: parts.length };
    if (next.count > 100) throw new Error('Oturum kaydı çok büyük.');
    const nextKeys = keys(key, next);
    // Publish only after the complete new encrypted generation has been written.
    try {
      // Wait for every write before cleaning a failed generation.
      const writes = await Promise.allSettled(nextKeys.map((name, i) => SecureStore.setItemAsync(name, parts[i])));
      const failed = writes.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      await SecureStore.setItemAsync(`${key}.manifest`, JSON.stringify(next));
    } catch (error) {
      await Promise.allSettled(nextKeys.map(name => SecureStore.deleteItemAsync(name)));
      throw error;
    }
    await Promise.allSettled([SecureStore.deleteItemAsync(key), AsyncStorage.removeItem(key), ...(old ? keys(key, old).map(name => SecureStore.deleteItemAsync(name)) : [])]);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.localStorage.removeItem(key); return; }
    const old = await manifest(key);
    await Promise.all([SecureStore.deleteItemAsync(key), SecureStore.deleteItemAsync(`${key}.manifest`), AsyncStorage.removeItem(key), ...(old ? keys(key, old).map(name => SecureStore.deleteItemAsync(name)) : [])]);
  },
};
