import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { secureStorageAdapter } from './secureStorage';

// Polyfill WebSocket for Node.js SSR environments to prevent crashing during build
if (typeof globalThis.WebSocket === 'undefined') {
  class DummyWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    onopen = null;
    onclose = null;
    onerror = null;
    onmessage = null;
    readyState = 3;
    close() {}
    send() {}
  }
  (globalThis as any).WebSocket = DummyWebSocket;
}

// Auth token'ları şifrelenmiş SecureStore üzerinden saklanır
// (Android: EncryptedSharedPreferences, iOS: Keychain, Web: localStorage fallback)
const customStorage = secureStorageAdapter;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials are missing. Please ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Olay seli (event flood) durumunda istemciyi throttle ederek aşırı
  // yeniden render / işlem yükünü sınırla.
  realtime: {
    params: {
      eventsPerSecond: 5,
    },
  },
});

// Realtime and auth auto-refresh management based on AppState
AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
