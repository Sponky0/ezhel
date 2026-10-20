import { withTimeout } from '../lib/async';
import { detachPushRegistration } from '../lib/pushRegistration';
import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { getLoginThrottleState, recordFailedLoginAttempt, resetLoginAttempts, sanitizeUsername } from '../utils/security';
import { initRevenueCat, resetUserSession } from '../lib/revenuecat';

WebBrowser.maybeCompleteAuthSession();

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  role: 'user' | 'admin';
  is_vip: boolean;
  vip_until: string | null;
  is_online: boolean;
  banned_at: string | null;
  bio: string | null;
  phone_number: string | null;
  is_verified: boolean;
  email_verified_at?: string | null;
  edit_version?: number;
  language?: string | null;
  country?: string | null;
  age?: number | null;
  hobbies?: string[] | null;
  gender?: 'male' | 'female' | null;
  diamonds?: number;
  notification_new_matches?: boolean;
  notification_messages?: boolean;
  notification_calls?: boolean;
  notification_campaigns?: boolean;
  is_highlighted?: boolean;
  highlighted_until?: string | null;
  privacy_show_online?: boolean;
  privacy_show_in_searches?: boolean;
  privacy_show_read_receipts?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  retryAuth: () => void;
  maintenanceMode: boolean;
  isLoginModalVisible: boolean;
  showCongratsModal: boolean;
  setShowCongratsModal: (val: boolean) => void;
  showLoginModal: () => void;
  hideLoginModal: () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signInWithFirebaseUid: (uid: string) => Promise<{ error: any }>;
  signInWithUsernameAndPin: (username: string, pin: string) => Promise<{ error: any }>;
  signInWithEmailOrUsername: (emailOrUsername: string, passwordSecret: string) => Promise<{ error: any }>;
  signUpWithOnboarding: (params: {
    username: string;
    email: string;
    passwordSecret: string;
    country: string;
    language: string;
    gender: 'male' | 'female' | null;
    hobbies: string[];
    age: number | null;
  }) => Promise<{ error: any; confirmationRequired?: boolean }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const authEpochRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);
  const profileVersionRef = useRef(0);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [isLoginModalVisible, setLoginModalVisible] = useState(false);
  const [showCongratsModal, setShowCongratsModal] = useState(false);

  const showLoginModal = useCallback(() => {
    setLoginModalVisible(true);
  }, []);

  const hideLoginModal = useCallback(() => {
    setLoginModalVisible(false);
  }, []);

  // Profile creation belongs to the auth trigger. Never upsert role or mutable
  // draft fields from an auth callback, and never hold Supabase's auth lock here.
  const refreshProfile = useCallback(async (userId?: string) => {
    const id = userId || activeUserIdRef.current;
    if (!id) return;
    const version = ++profileVersionRef.current;
    const { data, error } = await withTimeout(supabase.from('profiles').select('*').eq('id', id).single());
    if (error || !data) throw new Error(error?.message || 'Profil yüklenemedi. Tekrar deneyin.');
    if (version === profileVersionRef.current && activeUserIdRef.current === id) {
      setProfile(previous => previous?.id === id && (previous.edit_version || 0) > (data.edit_version || 0) ? previous : data);
    }
  }, []);

  const ensureAuth = useCallback(async () => {
    setLoading(true); setAuthError(null);
    const epoch = authEpochRef.current;
    try {
      const { data, error } = await withTimeout(supabase.auth.getSession());
      if (error) throw error;
      if (epoch !== authEpochRef.current) return;
      activeUserIdRef.current = data.session?.user.id ?? null;
      setSession(data.session); setUser(data.session?.user ?? null);
      if (data.session) {
        await withTimeout(refreshProfile(data.session.user.id));
        void initRevenueCat(data.session.user.id);
      } else setProfile(null);
      void supabase.from('system_settings').select('value').eq('key', 'maintenance_mode').maybeSingle()
        .then(({ data }) => { if (data) setMaintenanceMode(data.value === 'true'); });
    } catch (error) {
      if (epoch === authEpochRef.current) setAuthError(error instanceof Error ? error.message : 'Oturum yüklenemedi.');
    } finally { if (epoch === authEpochRef.current) setLoading(false); }
  }, [refreshProfile]);
  const ensureAuthRef = useRef(ensureAuth);
  const refreshProfileRef = useRef(refreshProfile);
  useEffect(() => { ensureAuthRef.current = ensureAuth; refreshProfileRef.current = refreshProfile; });
  useEffect(() => {
    let active = true;
    const pending = new Set<ReturnType<typeof setTimeout>>();
    const timer = setTimeout(() => { void ensureAuthRef.current(); }, 0);
    // Supabase holds its auth lock during this callback. Never await another
    // Supabase request inside it: that deadlocks session initialization.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEpochRef.current++;
      activeUserIdRef.current = nextSession?.user.id ?? null;
      profileVersionRef.current++;
      setAuthError(null); setSession(nextSession); setUser(nextSession?.user ?? null);
      if (!nextSession) { setProfile(null); setLoading(false); return; }
      const task = setTimeout(() => {
        pending.delete(task);
        if (!active || activeUserIdRef.current !== nextSession.user.id) return;
        void withTimeout(refreshProfileRef.current(nextSession.user.id))
          .catch(error => { if (active && activeUserIdRef.current === nextSession.user.id) setAuthError(error.message); })
          .finally(() => { if (active && activeUserIdRef.current === nextSession.user.id) setLoading(false); });
      }, 0);
      pending.add(task);
    });

    void supabase.from('system_settings').select('value').eq('key', 'maintenance_mode').maybeSingle()
      .then(({ data }) => { if (active && data) setMaintenanceMode(data.value === 'true'); });

    // Subscribe to system_settings changes for real-time maintenance mode updates
    const settingsChannel = supabase
      .channel('system_settings_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        (payload) => {
          if (payload.new && (payload.new as any).key === 'maintenance_mode') {
            setMaintenanceMode((payload.new as any).value === 'true');
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      for (const task of pending) clearTimeout(task);
      subscription.unsubscribe();
      supabase.removeChannel(settingsChannel);
      clearTimeout(timer);
    };
    // Sadece mount'ta bir kez kur (callback'ler ref üzerinden güncel tutuluyor).
  }, []);

  // Listen for realtime profile changes (e.g. diamonds, VIP status)
  useEffect(() => {
    if (!user?.id) return;

    const profileChannel = supabase
      .channel(`profile_realtime_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new) {
            const incoming = payload.new as Profile;
            setProfile(previous => previous?.id === incoming.id && (previous.edit_version || 0) > (incoming.edit_version || 0) ? previous : incoming);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [user?.id]);

  // Update profile
  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: 'No user signed in' };

    try {
      const version = ++profileVersionRef.current;
      const { data, error } = await supabase.from('profiles').update(updates).eq('id', user.id).select('*').single();
      if (!error && data && version === profileVersionRef.current && activeUserIdRef.current === user.id) setProfile(previous => previous && previous.id === data.id && (previous.edit_version || 0) > (data.edit_version || 0) ? previous : data);
      return { error };
    } catch (err) {
      console.error('Error updating profile:', err);
      return { error: err };
    }
  };

  // Sign in using verified Firebase UID
  const signInWithFirebaseUid = async (_uid: string) => ({ error: new Error('Lütfen e-posta adresinizle giriş yapın. Telefon giriş köprüsü kaldırıldı.') });

  // Sign in using username and 6-digit PIN (with brute force protection)
  const signInWithUsernameAndPin = async (username: string, pin: string) => {
    const cleanUsername = sanitizeUsername(username);
    if (!cleanUsername || cleanUsername.length < 3) {
      return { error: new Error('Kullanıcı adı en az 3 karakter olmalıdır.') };
    }
    if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
      return { error: new Error('PIN kodu 6 haneli bir sayı olmalıdır.') };
    }

    // Brute force koruması: Throttle kontrolü
    const throttleState = await getLoginThrottleState();
    if (throttleState.isLocked) {
      const minutesLeft = Math.ceil(throttleState.lockoutRemainingMs / 60000);
      return { error: new Error(`Çok fazla başarısız deneme. Lütfen ${minutesLeft} dakika sonra tekrar deneyin.`) };
    }
    if (throttleState.requiredDelayMs > 0) {
      const secondsLeft = Math.ceil(throttleState.requiredDelayMs / 1000);
      return { error: new Error(`Lütfen ${secondsLeft} saniye bekleyip tekrar deneyin.`) };
    }

    const email = `${cleanUsername.toLowerCase()}@anon.randomchat.app`;
    const password = `${pin}_pincode`;

    try {
      // 1. Try to sign in
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        await recordFailedLoginAttempt();
        return { error: new Error('Kullanıcı adı veya PIN kodu hatalı.') };
      }

      // Başarılı giriş — sayaçları sıfırla
      await resetLoginAttempts();
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        await refreshProfile(data.session.user.id);
      }
      return { error: null };
    } catch (err) {
      await recordFailedLoginAttempt();
      return { error: err };
    }
  };

  const signInWithEmailOrUsername = async (emailOrUsername: string, passwordSecret: string) => {
    let email = emailOrUsername.trim();
    
    // E-posta formatı kontrolü, eğer değilse kullanıcı adından e-postayı çöz
    if (!email.includes('@')) {
      const cleanUsername = sanitizeUsername(emailOrUsername);
      const { data, error: rpcError } = await supabase.rpc('get_email_by_username', {
        p_username: cleanUsername
      });
      
      if (rpcError || !data) {
        if (rpcError) console.error('Error resolving username to email:', rpcError);
        return { error: new Error('Giriş başarısız. E-posta / kullanıcı adı veya şifre hatalı.') };
      }
      
      email = data;
    }
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: passwordSecret,
      });
      
      if (error) {
        return { error };
      }
      
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        await refreshProfile(data.session.user.id);
      }
      return { error: null };
    } catch (err) {
      console.error('Sign in unexpected error:', err);
      return { error: err };
    }
  };

  const signUpWithOnboarding = async (params: {
    username: string;
    email: string;
    passwordSecret: string;
    country: string;
    language: string;
    gender: 'male' | 'female' | null;
    hobbies: string[];
    age: number | null;
  }) => {
    const cleanUsername = sanitizeUsername(params.username);
    if (!cleanUsername || cleanUsername.length < 3) {
      return { error: new Error('Kullanıcı adı en az 3 karakter olmalıdır.') };
    }
    
    // Kullanıcı adının benzersizliğini kontrol et
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();
      
    if (existingProfile) {
      return { error: new Error('Bu kullanıcı adı zaten alınmış.') };
    }
    
    try {
      // 1. Kaydı oluştur
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: params.email,
        password: params.passwordSecret,
        options: {
          data: {
            username: cleanUsername,
            country: params.country, language: params.language, gender: params.gender,
            age: params.age, hobbies: params.hobbies,
          }
        }
      });
      
      if (signUpError) {
        return { error: signUpError };
      }
      
      if (!data.session) return { error: null, confirmationRequired: true };

      const targetUser = data.user || data.session?.user;
      if (!targetUser) {
        return { error: new Error('Kayıt oluşturuldu fakat oturum açılamadı.') };
      }
      
      // PostgreSQL tetikleyicisinin profili oluşturmasını bekle ve güncelle
      let retries = 5;
      let profileUpdated = false;
      while (retries > 0) {
        const { data: checkProf } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', targetUser.id)
          .maybeSingle();
          
        if (checkProf) {
          // Profil alanlarını güncelle
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              country: params.country,
              language: params.language,
              gender: params.gender,
              hobbies: params.hobbies,
              age: params.age
            })
            .eq('id', targetUser.id);
            
          if (updateError) {
            console.error('Failed to update onboarding profile:', updateError);
            return { error: updateError };
          }
          profileUpdated = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
        retries--;
      }
      
      if (!profileUpdated) {
        return { error: new Error('Profil kaydı veritabanında bulunamadı. Lütfen tekrar deneyin.') };
      }
      
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        await refreshProfile(data.session.user.id);
      }
      
      return { error: null };
    } catch (err) {
      console.error('Sign up unexpected error:', err);
      return { error: err };
    }
  };

  // Sign out
  const signOut = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Revoke the server device binding before destroying the authenticated session.
      await withTimeout(detachPushRegistration(user.id));
      const { error } = await withTimeout(supabase.auth.signOut({ scope: 'local' }));
      if (error) throw error;
      activeUserIdRef.current = null; profileVersionRef.current++;
      setSession(null); setUser(null); setProfile(null);
      void resetUserSession();
    } finally { setLoading(false); }
  };

  // Delete Account (Apple App Store Guideline 5.1.1(v) compliance)
  const deleteAccount = async () => {
    if (!user) return { error: new Error('Oturum açmış kullanıcı bulunamadı.') };
    setLoading(true);
    try {
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw error;

      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      setLoading(false);
      return { error: null };
    } catch (err) {
      console.error('Delete account error:', err);
      setLoading(false);
      return { error: err };
    }
  };

  // Sign in with Google (OAuth)
  const signInWithGoogle = async () => {
    try {
      const redirectUrl = Linking.createURL('/');
      console.log('Google Auth Redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: Platform.OS !== 'web',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('Supabase Google OAuth error:', error);
        return { error };
      }

      if (Platform.OS !== 'web' && data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (result.type === 'success' && result.url) {
          const { queryParams } = Linking.parse(result.url);
          if (queryParams?.access_token && queryParams?.refresh_token) {
            const { error: setSessionErr } = await supabase.auth.setSession({
              access_token: queryParams.access_token as string,
              refresh_token: queryParams.refresh_token as string,
            });
            if (setSessionErr) return { error: setSessionErr };
          } else if (queryParams?.code) {
            const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(queryParams.code as string);
            if (exchangeErr) return { error: exchangeErr };
          }
        }
      }
      return { error: null };
    } catch (err: any) {
      console.error('Unexpected Google Sign-In error:', err);
      return { error: err };
    }
  };

  // Online status management (presence check)
  useEffect(() => {
    if (!user) return;

    // Mark online
    const markOnline = async (online: boolean) => {
      try {
        await supabase
          .from('profiles')
          .update({
            is_online: online,
            last_active_at: new Date().toISOString(),
          })
          .eq('id', user.id);
      } catch (err) {
        console.error('Error updating online status:', err);
      }
    };

    markOnline(true);

    // Update last_active_at every 2 minutes
    const interval = setInterval(() => {
      markOnline(true);
    }, 120000);

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        markOnline(true);
      } else {
        markOnline(false);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      clearInterval(interval);
      subscription.remove();
      markOnline(false);
    };
  }, [user]);

  const value = {
    user,
    session,
    profile,
    loading,
    authError,
    retryAuth: () => { void ensureAuthRef.current(); },
    maintenanceMode,
    isLoginModalVisible,
    showCongratsModal,
    setShowCongratsModal,
    showLoginModal,
    hideLoginModal,
    refreshProfile,
    updateProfile,
    signOut,
    deleteAccount,
    signInWithGoogle,
    signInWithFirebaseUid,
    signInWithUsernameAndPin,
    signInWithEmailOrUsername,
    signUpWithOnboarding,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
