import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Alert, Platform } from 'react-native';
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
  }) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [isLoginModalVisible, setLoginModalVisible] = useState(false);
  const [showCongratsModal, setShowCongratsModal] = useState(false);

  const showLoginModal = useCallback(() => {
    setLoginModalVisible(true);
  }, []);

  const hideLoginModal = useCallback(() => {
    setLoginModalVisible(false);
  }, []);

  // Force refresh session when token is expired
  const forceRefreshSession = useCallback(async (): Promise<boolean> => {
    try {
      console.log('Attempting to manually refresh expired session...');
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('Failed to manually refresh session:', error);
        // Refresh token failed/expired as well. Must sign out.
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        Alert.alert(
          'Oturum Süresi Doldu',
          'Oturum süreniz dolduğu için çıkış yapıldı. Lütfen tekrar giriş yapın.',
          [{ text: 'Tamam' }]
        );
        return false;
      }
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error in forceRefreshSession:', err);
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      Alert.alert(
        'Oturum Süresi Doldu',
        'Oturum süreniz dolduğu için çıkış yapıldı. Lütfen tekrar giriş yapın.',
        [{ text: 'Tamam' }]
      );
      return false;
    }
  }, []);

  // Function to load/refresh the user profile from database
  const refreshProfile = useCallback(async (userId?: string) => {
    const id = userId || user?.id;
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        if (error.code === 'PGRST116') {
          // Profile missing (e.g. initial Google OAuth sign-in)
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user) {
            const meta = userData.user.user_metadata || {};
            const generatedUsername = meta.full_name || meta.name || userData.user.email?.split('@')[0] || `user_${id.substring(0, 6)}`;
            const avatarUrl = meta.avatar_url || meta.picture || null;

            const { data: newProfile, error: createError } = await supabase
              .from('profiles')
              .upsert({
                id: id,
                username: generatedUsername,
                avatar_url: avatarUrl,
                role: 'user',
              }, { onConflict: 'id' })
              .select('*')
              .single();

            if (!createError && newProfile) {
              setProfile(newProfile);
              return;
            }
          }
        }
        if (error.message?.includes('JWT expired') || error.code === 'PGRST303') {
          const refreshed = await forceRefreshSession();
          if (refreshed) {
            // Retry once
            const { data: retryData, error: retryError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', id)
              .single();
            if (!retryError) {
              setProfile(retryData);
            } else {
              console.error('Error fetching profile after retry:', retryError);
            }
          }
        }
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    }
  }, [user?.id, forceRefreshSession]);

  // Sign in anonymously if no session exists
  const ensureAuth = useCallback(async () => {
    try {
      // Fetch maintenance mode state
      const { data: maintData, error: maintError } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .maybeSingle();
      if (!maintError && maintData) {
        setMaintenanceMode(maintData.value === 'true');
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (currentSession) {
        const isExpired = currentSession.expires_at 
          ? currentSession.expires_at < Math.floor(Date.now() / 1000) + 10
          : false;

        if (isExpired) {
          console.log('Session is expired on startup, refreshing...');
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !refreshData.session) {
            console.error('Failed to refresh expired session on startup, signing out...');
            await supabase.auth.signOut();
            setSession(null);
            setUser(null);
            setProfile(null);
            setLoading(false);
            Alert.alert(
              'Oturum Süresi Doldu',
              'Oturum süreniz dolduğu için çıkış yapıldı. Lütfen tekrar giriş yapın.',
              [{ text: 'Tamam' }]
            );
            return;
          } else {
            setSession(refreshData.session);
            setUser(refreshData.session.user);
            await refreshProfile(refreshData.session.user.id);
            setLoading(false);
            return;
          }
        }

        setSession(currentSession);
        setUser(currentSession.user);
        await Promise.all([
          refreshProfile(currentSession.user.id),
          initRevenueCat(currentSession.user.id),
        ]);
        setLoading(false);
      } else {
        // Oturum yok, kullanıcının giriş yapması bekleniyor
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    } catch (err) {
      console.error('Auth initialization error:', err);
      setLoading(false);
    }
  }, [refreshProfile]);

  // En güncel callback'leri ref'te tut; böylece aşağıdaki abonelik effect'i
  // her auth değişiminde (user?.id değişince) yeniden abone olmak zorunda kalmaz.
  const ensureAuthRef = useRef(ensureAuth);
  const refreshProfileRef = useRef(refreshProfile);

  useEffect(() => {
    ensureAuthRef.current = ensureAuth;
    refreshProfileRef.current = refreshProfile;
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      ensureAuthRef.current();
    }, 0);

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          await refreshProfileRef.current(newSession.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

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
            setProfile(payload.new as Profile);
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
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (!error) {
        await refreshProfile();
      }
      return { error };
    } catch (err) {
      console.error('Error updating profile:', err);
      return { error: err };
    }
  };

  // Sign in using verified Firebase UID
  const signInWithFirebaseUid = async (uid: string) => {
    const email = `${uid.toLowerCase()}@gmail.com`;
    // Firebase UID is already secure and unique. We append a short salt to keep it below Supabase's 72-char limit.
    const password = `${uid}_rcsalt`;
    
    try {
      // 1. Try to sign in
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // 2. If user doesn't exist, sign up
        if (error.message?.includes('Invalid login credentials') || error.status === 400) {
          console.log('User not found, registering new profile...');
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
          });

          if (signUpError) {
            console.error('Supabase Sign Up error:', signUpError);
            return { error: signUpError };
          }

          if (signUpData.session) {
            setSession(signUpData.session);
            setUser(signUpData.session.user);
            // Wait a brief moment for PostgreSQL trigger to create profiles row
            setTimeout(async () => {
              await refreshProfile(signUpData.session!.user.id);
            }, 1000);
            return { error: null };
          } else {
            // Fallback: Try signing in immediately
            const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            if (retryError) {
              return { error: retryError };
            }
            if (retryData.session) {
              setSession(retryData.session);
              setUser(retryData.session.user);
              await refreshProfile(retryData.session.user.id);
            }
            return { error: null };
          }
        } else {
          console.error('Supabase Sign In error:', error);
          return { error };
        }
      }

      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        await refreshProfile(data.session.user.id);
      }
      return { error: null };
    } catch (err) {
      console.error('Supabase Phone Auth Bridge unexpected error:', err);
      return { error: err };
    }
  };

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
          }
        }
      });
      
      if (signUpError) {
        return { error: signUpError };
      }
      
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
    setLoading(true);
    await resetUserSession();
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setLoading(false);
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
