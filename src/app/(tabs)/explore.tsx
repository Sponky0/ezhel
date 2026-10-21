import { createCallSignaling } from '../../lib/callSignaling';
import { withTimeout } from '../../lib/async';
import { isPeerConnected } from '../../lib/callConnection';
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { startVoiceAudio, setVoiceSpeaker, stopVoiceAudio } from "../../lib/callAudio";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { ActionModal } from "@/components/ActionModal";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { AppIcons } from "../../constants/icons";
import { Colors, Fonts, Spacing, BottomTabInset } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { findOrCreateConversation } from "../../lib/conversations";
import { supabase } from "../../lib/supabase";
import { getIceServers } from "../../lib/turn";

// Conditional WebRTC configuration
let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let mediaDevices: any;

if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webrtc = require("react-native-webrtc");
    RTCPeerConnection = webrtc.RTCPeerConnection;
    RTCSessionDescription = webrtc.RTCSessionDescription;
    RTCIceCandidate = webrtc.RTCIceCandidate;
    mediaDevices = webrtc.mediaDevices;
  } catch {
    console.warn(
      "react-native-webrtc could not be loaded. This is expected in Expo Go. Use a development build for WebRTC.",
    );
    // Mocks for safety
    RTCPeerConnection = class {};
    RTCSessionDescription = class {};
    RTCIceCandidate = class {};
    mediaDevices = {
      getUserMedia: () =>
        Promise.reject(new Error("WebRTC not supported in Expo Go")),
    };
  }
} else {
  if (typeof window !== "undefined") {
    RTCPeerConnection = window.RTCPeerConnection;
    RTCSessionDescription = window.RTCSessionDescription;
    RTCIceCandidate = window.RTCIceCandidate;
    mediaDevices = navigator.mediaDevices;
  } else {
    // Mocks for server-side pre-rendering (SSR)
    RTCPeerConnection = class {};
    RTCSessionDescription = class {};
    RTCIceCandidate = class {};
    mediaDevices = {
      getUserMedia: () =>
        Promise.reject(new Error("WebRTC not supported during SSR")),
    };
  }
}

interface MatchedUser {
  id: string;
  username: string;
  avatar_url: string | null;
  is_vip: boolean;
  is_bot?: boolean;
}

export default function VoiceMatchScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  // Matchmaking states: 'idle' | 'searching' | 'connecting' | 'connected'
  const [status, setStatus] = useState<
    "idle" | "searching" | "connecting" | "connected"
  >("idle");

  // Dynamic tab bar display options
  useEffect(() => {
    if (status !== "idle") {
      navigation.setOptions({
        tabBarStyle: { display: "none" },
      });
    } else {
      navigation.setOptions({
        tabBarStyle: undefined,
      });
    }
    return () => {
      navigation.setOptions({
        tabBarStyle: undefined,
      });
    };
  }, [status, navigation]);

  const [matchedUser, setMatchedUser] = useState<MatchedUser | null>(null);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);

  // Call Timer & Limits
  const [timeLeft, setTimeLeft] = useState(180); // Default 3 mins
  const [callLimit, setCallLimit] = useState(180);
  const [matchesLeft, setMatchesLeft] = useState(5);
  const [, setMaxMatchesLimit] = useState(5);

  // Gender preference for matchmaking (VIP-only)
  const [genderPref, setGenderPref] = useState<"male" | "female" | null>(null);

  // Likes
  const [iLiked, setILiked] = useState<boolean>(false);
  const [theyLiked, setTheyLiked] = useState<boolean>(false);
  const [mutualFriend, setMutualFriend] = useState<boolean>(false);

  // Animation values
  const [pulseAnim] = useState(() => new Animated.Value(1));

  // WebRTC & Supabase Realtime Refs
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const matchmakingChannelRef = useRef<any>(null);
  const signalingChannelRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const callLimitRef = useRef<number>(180);
  const callEpochRef = useRef(0);
  const leavePendingRef = useRef<PromiseLike<{ error?: string }>>(Promise.resolve({}));
  const searchActiveRef = useRef(false);
  const matchSessionRef = useRef<string | null>(null);
  const matchPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<string>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Pulse wave animation for searching screen
  const startPulseAnimation = useCallback(() => {
    pulseAnim.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 2,
          duration: 1500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  // Gender preference (VIP-only). Normal kullanıcı dokununca VIP'e yönlendirilir.
  const handleSelectGenderPref = (value: "male" | "female") => {
    if (!profile?.is_vip) {
      ActionModal.show({
        title: (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#D5B075" }}>VIP Özelliği</Text>
            <MaterialCommunityIcons name="crown" size={20} color="#D5B075" />
          </View>
        ),
        message: "Cinsiyet tercihiyle eşleşme yalnızca VIP üyelere özeldir.",
        type: "warning",
        buttons: [
          { text: "İptal", style: "cancel" },
          { text: "VIP Ol", onPress: () => router.push("/profile") },
        ],
      });
      return;
    }
    setGenderPref((prev) => (prev === value ? null : value));
  };

  // Load Limits & Configuration
  const loadLimits = useCallback(async () => {
    if (!user) return;
    try {
      const isNonVip = !!profile && !profile.is_vip;

      // 3 sorguyu paralel çalıştır (ardışık await yerine).
      const [limitRes, maxLimitRes, matchRes] = await Promise.all([
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", "voice_chat_limit")
          .single(),
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", "daily_match_limit")
          .maybeSingle(),
        isNonVip
          ? supabase
              .from("daily_matches")
              .select("*")
              .eq("user_id", user.id)
              .single()
          : Promise.resolve({ data: null }),
      ]);

      const limitData = limitRes.data;
      if (limitData) {
        const val = parseInt(limitData.value);
        callLimitRef.current = val;
        setCallLimit(val);
        if (statusRef.current === "idle" || statusRef.current === "searching") {
          setTimeLeft(val);
        }
      }

      // Fetch dynamic daily match limit
      let maxDailyLimit = 5;
      if (maxLimitRes.data) {
        maxDailyLimit = parseInt(maxLimitRes.data.value) || 5;
      }
      setMaxMatchesLimit(maxDailyLimit);

      // Daily match limit for current user
      if (isNonVip) {
        const matchData = matchRes.data as any;

        if (matchData) {
          // If date is different, reset matches used
          const today = new Date().toISOString().split("T")[0];
          if (matchData.last_match_date !== today) {
            await supabase
              .from("daily_matches")
              .update({ matches_used: 0, last_match_date: today })
              .eq("user_id", user.id);
            setMatchesLeft(maxDailyLimit);
          } else {
            setMatchesLeft(Math.max(0, maxDailyLimit - matchData.matches_used));
          }
        }
      }
    } catch (err) {
      console.error("Error loading limits:", err);
    }
  }, [user, profile]);

  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        loadLimits();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [user, profile, loadLimits]);

  // Cleanup WebRTC & Channels
  const cleanupCall = useCallback(() => {
    callEpochRef.current++;
    if (matchPollRef.current) clearTimeout(matchPollRef.current);
    if (searchActiveRef.current || matchSessionRef.current) leavePendingRef.current = supabase.rpc('leave_voice_match', { p_session_id: matchSessionRef.current }).then(({ error }) => error ? { error: error.message } : {});
    searchActiveRef.current = false; matchSessionRef.current = null;
    // Clear Timer
    if (timerRef.current) clearInterval(timerRef.current);

    // Close WebRTC
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop local stream audio track
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track: any) => track.stop());
      localStreamRef.current = null;
    }

    void stopVoiceAudio('random').catch(error => console.warn('Call audio cleanup failed:', error));

    setIsSpeakerOn(false);

    // Leave channels
    if (signalingChannelRef.current) {
      supabase.removeChannel(signalingChannelRef.current);
      signalingChannelRef.current = null;
    }

    if (matchmakingChannelRef.current) {
      supabase.removeChannel(matchmakingChannelRef.current);
      matchmakingChannelRef.current = null;
    }

    setStatus("idle");
    setMatchedUser(null);
    setILiked(false);
    setTheyLiked(false);
    setMutualFriend(false);
    setTimeLeft(callLimitRef.current);
  }, [setIsSpeakerOn]);

  // Use Effect for unmount cleanup
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  const toggleSpeaker = async () => {
    const nextSpeakerState = !isSpeakerOn;
    setIsSpeakerOn(nextSpeakerState);
    try {
      await setVoiceSpeaker(nextSpeakerState);
    } catch (error) {
      setIsSpeakerOn(!nextSpeakerState);
      console.warn('Speaker routing failed:', error);
    }
  };

  // Setup WebRTC and audio capturing
  const setupWebRTC = async (epoch: number) => {
    try {
      await startVoiceAudio('random');

      const stream = await withTimeout(Promise.resolve(mediaDevices.getUserMedia({ audio: true, video: false })).then((value: any) => {
        if (epoch !== callEpochRef.current) { value.getTracks().forEach((t: any) => t.stop()); throw Error('Arama iptal edildi.'); }
        return value;
      }), 15000);

      localStreamRef.current = stream;

      const iceServers = await withTimeout(getIceServers(), 10000);
      if (epoch !== callEpochRef.current) throw Error('Arama iptal edildi.');
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      // Add local audio tracks to connection
      stream.getTracks().forEach((track: any) => {
        pc.addTrack(track, stream);
      });

      // Handle Remote Stream Audio
      pc.ontrack = (event: any) => {
        // Stream automatically outputs audio on modern WebRTC.
        console.log("Received remote audio track!");
      };

      return pc;
    } catch (err) {
      console.error("Failed to setup WebRTC:", err);
      throw err;
    }
  };

  // Start Call Timer
  const startCallTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          ActionModal.show({
            title: "Görüşme Bitti",
            message: "Görüşme süre sınırına ulaşıldı.",
            type: "warning",
          });
          cleanupCall();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [cleanupCall]);

  // Setup Signaling Channel between two matched users
  const setupSignaling = async (
    myId: string,
    peerId: string,
    isCaller: boolean,
    sessionId: string,
    sessionRoom: string,
  ) => {
    setStatus("connecting");
    const roomName = sessionRoom;

    let matchId: string | null = sessionId;
    const epoch = ++callEpochRef.current;
    const pc = await setupWebRTC(epoch);
    const channel = supabase.channel(roomName, { config: { broadcast: { ack: true } } });
    signalingChannelRef.current = channel;
const negotiation = createCallSignaling({
        pc, channel, caller: isCaller,
        description: data => new RTCSessionDescription(data), candidate: data => new RTCIceCandidate(data),
        onConnecting: () => { if (!connected) setStatus("connecting"); },
        onError: error => { ActionModal.show({ title: "Arama kurulamadı", message: error.message }); cleanupCall(); },
offerData: matchId ? { matchId } : {}, onOffer: payload => { matchId = payload.matchId || null; },
      });

    let connected = false;
    const connectionTimeout = setTimeout(() => {
      if (pcRef.current !== pc || connected) return;
      ActionModal.show({ title: 'Ses bağlantısı kurulamadı', message: 'TURN erişimi veya ağ kısıtlaması olabilir. Farklı ağla tekrar deneyin.' });
      cleanupCall();
    }, 45000);
    const observeConnection = () => {
      if (pcRef.current !== pc) return;
      if (isPeerConnected(pc.connectionState, pc.iceConnectionState)) {
        if (connected) return;
        connected = true;
        negotiation.connected();
        clearTimeout(connectionTimeout);
        setStatus("connected");
        startCallTimer();
        if (matchId) void supabase.rpc('confirm_match', { p_peer_id: peerId, p_match_id: matchId }).then(({ error }) => {
          if (error) console.warn('Match confirmation failed:', error.message); else void loadLimits();
        });
      } else if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
        clearTimeout(connectionTimeout);
        console.warn("WebRTC disconnected before media was established");
        cleanupCall();
      }
    };
    pc.onconnectionstatechange = observeConnection;
    pc.oniceconnectionstatechange = observeConnection;
    const closeConnection = pc.close.bind(pc);
    pc.close = () => {
      clearTimeout(connectionTimeout);
      negotiation.close();
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      closeConnection();
    };

    channel
      .on("broadcast", { event: "like" }, () => {
        setTheyLiked(true);
      })
      .on("broadcast", { event: "friendship_created" }, () => {
        setMutualFriend(true);
      })
      .on("broadcast", { event: "disconnect" }, () => {
        ActionModal.show({
          title: "Bağlantı Kesildi",
          message: "Karşı taraf görüşmeyi sonlandırdı.",
          type: "warning",
        });
        cleanupCall();
      });

    channel.subscribe((channelStatus: string) => {
      if (channelStatus === 'SUBSCRIBED') negotiation.subscribed();
      else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
        negotiation.disconnected(); ActionModal.show({ title: 'Arama kurulamadı', message: 'Sinyal sunucusuna bağlanılamadı. Tekrar deneyin.' }); cleanupCall();
      }
    });

  };

  // Allocate one server-authorized pair; clients cannot select different peers.
  const handleStartMatch = async () => {
    if (!user || !profile) return;

    // Check matches remaining if not VIP
    if (!profile.is_vip && matchesLeft <= 0) {
      ActionModal.show({
        title: (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#D5B075" }}>Eşleşme Hakkınız Bitti</Text>
            <MaterialCommunityIcons name="crown" size={20} color="#D5B075" />
          </View>
        ),
        message: "Günlük 5 ücretsiz eşleşme hakkınızı tamamladınız. Sınırsız arama için VIP üye olun!",
        type: "warning",
        buttons: [
          { text: "Kapat", style: "cancel" },
          { text: "VIP Ol", onPress: () => router.push("/profile") },
        ],
      });
      return;
    }

    setStatus("searching");
    startPulseAnimation();

    if (searchActiveRef.current) return;
    searchActiveRef.current = true;
    const searchEpoch = ++callEpochRef.current;
    const poll = async () => {
      let allocatedSession: string | null = null;
      if (!searchActiveRef.current || callEpochRef.current !== searchEpoch) return;
      try {
        const left = await withTimeout(leavePendingRef.current, 8000);
        if (left.error) throw Error('Önceki görüşme sunucuda kapatılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
        if (!searchActiveRef.current || callEpochRef.current !== searchEpoch) return;
        const { data, error } = await withTimeout(supabase.rpc('join_voice_match', { p_gender_pref: genderPref || null }), 10000);
        if (error) throw error;
        if (!searchActiveRef.current || callEpochRef.current !== searchEpoch) return;
        if (data?.status === 'matched' && data.peer && data.sessionId && data.room) {
          allocatedSession = data.sessionId; searchActiveRef.current = false; matchSessionRef.current = data.sessionId;
          setMatchedUser(data.peer);
          await setupSignaling(user.id, data.peer.id, data.caller, data.sessionId, data.room);
        } else matchPollRef.current = setTimeout(() => { void poll(); }, 2000);
      } catch (error: any) {
        if (allocatedSession ? (matchSessionRef.current !== allocatedSession || callEpochRef.current !== searchEpoch + 1) : callEpochRef.current !== searchEpoch) return;
        ActionModal.show({ title: 'Eşleşme kurulamadı', message: error.message || 'Bağlantınızı kontrol edip tekrar deneyin.' }); cleanupCall();
      }
    };
    void poll();
  };

  // Skip Match (Geç)
  const handleSkip = () => {
    if (signalingChannelRef.current) {
      signalingChannelRef.current.send({
        type: "broadcast",
        event: "disconnect",
        payload: {},
      });
    }
    cleanupCall();
    // Start searching again
    handleStartMatch();
  };

  // Close Call (Kapat)
  const handleDisconnect = () => {
    if (signalingChannelRef.current) {
      signalingChannelRef.current.send({
        type: "broadcast",
        event: "disconnect",
        payload: {},
      });
    }
    cleanupCall();
  };

  // Like current partner (Beğen)
  const handleLike = async () => {
    if (!user || !matchedUser) return;
    if (iLiked) return;

    setILiked(true);

    if (!signalingChannelRef.current) return;

    // 1. Broadcast like event
    await signalingChannelRef.current.send({
      type: "broadcast",
      event: "like",
      payload: {},
    });

    // 2. If both liked, create direct conversation (friendship)
    if (theyLiked) {
      setMutualFriend(true);

      // Caller handles inserting friendship to avoid duplicate database operations
      const isCaller = user.id < matchedUser.id;
      if (isCaller) {
        try {
          await findOrCreateConversation(
            user.id,
            matchedUser.id,
          );

          // Broadcast friendship confirmation
          signalingChannelRef.current.send({
            type: "broadcast",
            event: "friendship_created",
            payload: {},
          });
        } catch (err) {
          console.error("Error creating friend connection:", err);
        }
      }
    }
  };

  const contentPaddingBottom = status === "idle"
    ? BottomTabInset
    : (insets.bottom > 0 ? insets.bottom : Spacing.five);

  const isDark = scheme === "dark";
  const progressWidth = `${(timeLeft / callLimit) * 100}%`;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* Custom Header */}
      <View style={styles.customHeader}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTextTitle, { color: colors.text }]}>Sesli Eşleşme</Text>
          <View style={styles.headerRightActions}>
            {!profile?.is_vip ? (
              <View style={[styles.limitsBadge, { backgroundColor: colors.vip + "20" }]}>
                <Text style={[styles.limitsText, { color: colors.vip }]}>
                  Kalan Hak: {matchesLeft}/5
                </Text>
              </View>
            ) : (
              <View style={[styles.limitsBadge, { backgroundColor: colors.vip + "20" }]}>
                <Text style={[styles.limitsText, { color: colors.vip }]}>
                  <MaterialCommunityIcons name="crown" size={14} color={colors.vip} /> Sınırsız
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* IDLE VIEW */}
      {status === "idle" && (
        <View style={[styles.content, { paddingBottom: contentPaddingBottom }]}>
          <View style={styles.idleIllustrationWrap}>
            <View style={[styles.circleIllustration, { backgroundColor: isDark ? "#23304A" : "#ECEFF4" }]}>
              <Ionicons name="mic" size={48} color={colors.primary} />
            </View>
          </View>

          <Text style={[styles.idleTitle, { color: colors.text }]}>
            Bir ses, yeni bir sohbet.
          </Text>
          <Text style={[styles.idleDesc, { color: colors.textSecondary }]}>
            Kendine bir sohbet arası ver. Uygun biriyle sesli tanış.
          </Text>

          {/* Gender preference (VIP-only) */}
          <Text style={[styles.genderPrefLabel, { color: colors.textSecondary }]}>
            Cinsiyet Tercihi {!profile?.is_vip ? (
              <MaterialCommunityIcons name="crown" size={14} color={colors.vip} />
            ) : (
              ""
            )}
          </Text>
          <View style={styles.genderRow}>
            {([
              { value: "female", label: "Kadın", icon: AppIcons.female },
              { value: "male", label: "Erkek", icon: AppIcons.male },
            ] as const).map((opt) => {
              const active = genderPref === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.genderPill,
                    {
                      backgroundColor: active
                        ? colors.primary + "20"
                        : colors.backgroundElement,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => handleSelectGenderPref(opt.value)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={18}
                    color={active ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.genderPillText,
                      { color: active ? colors.primary : colors.text },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: colors.action }]}
            onPress={handleStartMatch}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="mic-outline" size={22} color={colors.onPrimary} />
              <Text style={[styles.mainButtonText, { color: colors.onPrimary }]}>Sohbete başla</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* SEARCHING VIEW */}
      {status === "searching" && (
        <View style={[styles.content, { paddingBottom: contentPaddingBottom }]}>
          <View style={styles.animationContainer}>
            {/* Multiple staggered rings */}
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  borderColor: colors.primary,
                  transform: [{ scale: pulseAnim }],
                  opacity: pulseAnim.interpolate({
                    inputRange: [1, 2],
                    outputRange: [0.6, 0],
                  }),
                },
              ]}
            />
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  borderColor: colors.primary,
                  transform: [{ scale: Animated.multiply(pulseAnim, 0.75) }],
                  opacity: pulseAnim.interpolate({
                    inputRange: [1, 2],
                    outputRange: [0.4, 0],
                  }),
                },
              ]}
            />
            <View style={[styles.radarCenter, { backgroundColor: colors.action }]}>
              <Ionicons name="infinite" size={36} color={isDark ? "#000" : "#FFF"} />
            </View>
          </View>

          <Text style={[styles.matchingTitle, { color: colors.text }]}>
            Eşleşme aranıyor...
          </Text>
          <Text style={[styles.matchingDesc, { color: colors.textSecondary }]}>
            Sizinle sohbet etmek isteyen biriyle eşleştiriliyorsunuz.
          </Text>

          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: "#EF4444" }]}
            onPress={handleDisconnect}
          >
            <Text style={styles.cancelButtonText}>Vazgeç</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CONNECTING VIEW */}
      {status === "connecting" && (
        <View style={[styles.content, { paddingBottom: contentPaddingBottom }]}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text
            style={[
              styles.matchingTitle,
              { color: colors.text, marginTop: Spacing.four },
            ]}
          >
            Bağlantı Kuruluyor...
          </Text>
          <Text style={[styles.matchingDesc, { color: colors.textSecondary }]}>
            Ses kanalları yapılandırılıyor.
          </Text>
        </View>
      )}

      {/* CONNECTED CALL ROOM VIEW */}
      {status === "connected" && matchedUser && (
        <View style={styles.callWrapper}>
          {/* Full Screen Blurred Avatar Background */}
          <View style={styles.blurBgContainer}>
            <Image
              source={matchedUser.avatar_url ? { uri: matchedUser.avatar_url } : require("../../../assets/images/place-holder.png")}
              style={styles.blurBgImage}
              contentFit="cover"
            />
            <BlurView intensity={Platform.OS === "ios" ? 60 : 85} tint="dark" style={StyleSheet.absoluteFill} />
          </View>

          {/* Time Limit Countdown Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressTrack, { backgroundColor: "rgba(255, 255, 255, 0.15)" }]}>
              <View style={[styles.progressFill, { width: progressWidth as any, backgroundColor: colors.action }]} />
            </View>
            <Text style={styles.countdownText}>
              Görüşme Süresi: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
            </Text>
          </View>

          {/* Center Call Card */}
          <View style={styles.centerCallCard}>
            <TouchableOpacity 
              activeOpacity={0.9} 
              onPress={() => router.push(`/user-profile?id=${matchedUser.id}`)}
              style={styles.avatarCallFrame}
            >
              <Image
                source={matchedUser.avatar_url ? { uri: matchedUser.avatar_url } : require("../../../assets/images/place-holder.png")}
                style={styles.callAvatar}
                contentFit="cover"
              />
              {matchedUser.is_vip && (
                <View style={styles.callVipLabel}>
                  <Text style={styles.callVipLabelText}>
                    <MaterialCommunityIcons name="crown" size={10} color="#FFFFFF" /> VIP
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            
            <Text style={styles.callUsername}>{matchedUser.username}</Text>
            <Text style={styles.callStatusSub}>Ses bağlantısı aktif</Text>
          </View>

          {/* Mutual Likes notifications */}
          <View style={styles.notificationWrapper}>
            {mutualFriend ? (
              <View style={[styles.mutualNotification, { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "#10B981" }]}>
                <Ionicons name="chatbubbles" size={18} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={[styles.mutualText, { color: "#10B981" }]}>
                  Eşleştiniz! Artık mesajlaşabilirsiniz.
                </Text>
              </View>
            ) : iLiked ? (
              <View style={[styles.likeNotification, { backgroundColor: "rgba(255, 255, 255, 0.1)", borderColor: "rgba(255, 255, 255, 0.2)" }]}>
                <Ionicons name="heart" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                <Text style={[styles.likeText, { color: "#FFFFFF" }]}>
                  Beğenildi. Karşı tarafın tepkisi bekleniyor...
                </Text>
              </View>
            ) : null}
          </View>

          {/* Circular control buttons at the bottom */}
          <View
            style={[
              styles.callActionsContainer,
              { marginBottom: insets.bottom > 0 ? insets.bottom + 8 : Spacing.four },
            ]}
          >
            {/* Speaker Toggle */}
            <TouchableOpacity
              style={[
                styles.actionRoundBtn,
                {
                  backgroundColor: isSpeakerOn ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.1)",
                },
              ]}
              onPress={toggleSpeaker}
            >
              <Ionicons
                name={isSpeakerOn ? "volume-high" : "volume-mute-outline"}
                size={24}
                color="#FFFFFF"
              />
            </TouchableOpacity>

            {/* Skip/Next */}
            <TouchableOpacity style={[styles.actionRoundBtn, { backgroundColor: "#F59E0B" }]} onPress={handleSkip}>
              <Ionicons name="play-forward" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Like/Heart */}
            <TouchableOpacity
              style={[
                styles.actionRoundBtn,
                {
                  backgroundColor: iLiked ? "rgba(255, 255, 255, 0.2)" : "#EF4444",
                },
              ]}
              onPress={handleLike}
              disabled={iLiked}
            >
              <Ionicons name={iLiked ? "heart" : "heart-outline"} size={26} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Disconnect/End call */}
            <TouchableOpacity style={[styles.actionRoundBtn, { backgroundColor: "#EF4444" }]} onPress={handleDisconnect}>
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  customHeader: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.two,
  },
  headerTextTitle: {
    fontSize: 26,
    fontFamily: Fonts.headingBlack,
    fontWeight: "bold",
    flex: 1,
    marginLeft: Spacing.two,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  limitsBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  limitsText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Fonts.bodyMedium,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.five,
    paddingBottom: BottomTabInset,
  },
  idleIllustrationWrap: {
    marginBottom: Spacing.five,
  },
  circleIllustration: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  idleTitle: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: Spacing.two,
    fontFamily: Fonts.heading,
  },
  idleDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.five,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.body,
  },
  genderPrefLabel: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Fonts.bodyMedium,
    textTransform: "uppercase",
    marginBottom: Spacing.two,
    letterSpacing: 0.5,
  },
  genderRow: {
    flexDirection: "row",
    gap: Spacing.two,
    width: "80%",
    maxWidth: 300,
    marginBottom: Spacing.five,
  },
  genderPill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  genderPillText: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: Fonts.bodyMedium,
  },
  mainButton: {
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    width: "80%",
    maxWidth: 300,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  mainButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  animationContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 200,
    height: 200,
    position: "relative",
    marginBottom: Spacing.five,
  },
  pulseRing: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
  },
  radarCenter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  matchingTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: Spacing.one,
    fontFamily: Fonts.heading,
  },
  matchingDesc: {
    fontSize: 14,
    marginBottom: Spacing.five,
    fontFamily: Fonts.body,
    textAlign: "center",
    paddingHorizontal: Spacing.three,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  cancelButtonText: {
    color: "#EF4444",
    fontWeight: "bold",
    fontSize: 14,
    fontFamily: Fonts.bodyMedium,
  },
  callWrapper: {
    flex: 1,
    position: "relative",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.five,
  },
  blurBgContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: -1,
  },
  blurBgImage: {
    width: "100%",
    height: "100%",
  },
  progressContainer: {
    width: "80%",
    alignItems: "center",
    marginTop: Spacing.two,
  },
  progressTrack: {
    height: 6,
    width: "100%",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  countdownText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    fontWeight: "700",
    marginTop: 8,
  },
  centerCallCard: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCallFrame: {
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  callAvatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: "#45BD62",
  },
  callVipLabel: {
    position: "absolute",
    bottom: -6,
    alignSelf: "center",
    backgroundColor: "#F59E0B",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  callVipLabelText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
  },
  callUsername: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
    fontFamily: Fonts.heading,
    marginTop: 18,
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  callStatusSub: {
    color: "#45BD62",
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    fontWeight: "600",
    marginTop: 4,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  notificationWrapper: {
    width: "80%",
    minHeight: 48,
    justifyContent: "center",
  },
  mutualNotification: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  mutualText: {
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  likeNotification: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  likeText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: Fonts.bodyMedium,
  },
  callActionsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    marginBottom: Spacing.four,
  },
  actionRoundBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});
