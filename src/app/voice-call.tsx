import React, { useCallback, useEffect, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts, Spacing } from "../constants/theme";
import { useCall } from "../contexts/CallContext";

export default function VoiceCallScreen() {
  const { name: paramPeerName, avatar: paramPeerAvatar } = useLocalSearchParams<{
    id: string;
    name: string;
    avatar: string;
  }>();

  const router = useRouter();

  const {
    callStatus,
    callError,
    timeLeft,
    isMuted,
    isSpeakerOn,
    peerName: contextPeerName,
    peerAvatar: contextPeerAvatar,
    hasLiked,
    peerLiked,
    endCall,
    toggleMute,
    toggleSpeaker,
    sendLikeMessage
  } = useCall();

  const peerName = contextPeerName || paramPeerName;
  const peerAvatar = contextPeerAvatar || paramPeerAvatar;

  // Animation state
  const [pulseAnim] = useState(() => new Animated.Value(1));

  // Pulse animation for ringing/connecting
  const startPulseAnimation = useCallback(() => {
    pulseAnim.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.8,
          duration: 2000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulseAnimation = useCallback(() => {
    pulseAnim.stopAnimation();
  }, [pulseAnim]);

  // Handle pulse animation lifecycle based on callStatus
  useEffect(() => {
    if (callStatus === "ringing" || callStatus === "connecting") {
      startPulseAnimation();
    } else {
      stopPulseAnimation();
    }
  }, [callStatus, startPulseAnimation, stopPulseAnimation]);

  // Navigate back when call returns to idle (either rejected/ended or finished delay)
  useEffect(() => {
    if (callStatus === "idle") {
      try {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)");
        }
      } catch (e) {
        console.warn("Router navigation error:", e);
      }
    }
  }, [callStatus, router]);

  // Get status subtext
  const getStatusText = () => {
    switch (callStatus) {
      case "initializing":
        return "Bağlantı Kuruluyor...";
      case "ringing":
        return "Çalıyor...";
      case "connecting":
        return "Bağlanıyor...";
      case "connected":
        return "Sesli Arama Aktif";
      case "disconnected":
        return callError || "Arama sonlandırıldı";
      case "rejected":
        return "Arama Reddedildi";
      case "no_answer":
        return "Cevap Yok";
      case "busy":
        return "Kullanıcı Meşgul";
      default:
        return "";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: "#0D1728" }]}>
      <SafeAreaView style={StyleSheet.absoluteFill} edges={["top", "bottom"]}>
        {/* Top Header */}
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={16} color="#10B981" />
          <Text style={styles.secureText}>
            Napan · Sesli görüşme
          </Text>
        </View>

        {/* Main Avatar and Pulse View */}
        <View style={styles.centerContainer}>
          <View style={styles.avatarWrapper}>
            {(callStatus === "ringing" || callStatus === "connecting") && (
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    borderColor: "#10B981",
                    transform: [{ scale: pulseAnim }],
                    opacity: pulseAnim.interpolate({
                      inputRange: [1, 1.8],
                      outputRange: [0.6, 0],
                    }),
                  },
                ]}
              />
            )}
            <Image
              source={peerAvatar ? { uri: peerAvatar } : require("../../assets/images/place-holder.png")}
              style={styles.avatar}
              contentFit="cover"
            />
          </View>

          <Text style={styles.peerName}>{peerName}</Text>
          <Text style={styles.statusText}>
            {getStatusText()}
          </Text>

          {peerLiked && (
            <View style={styles.likedBadge}>
              <Ionicons name="heart" size={16} color="#F08A80" />
              <Text style={styles.likedBadgeText}>Seni Beğendi!</Text>
            </View>
          )}

          {callStatus === "connected" && (
            <View style={styles.timerContainer}>
              <Text style={styles.timerValue}>
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
              </Text>
            </View>
          )}
        </View>

        {/* Action Buttons Toolbar */}
        <View style={styles.toolbar}>
          {/* Speaker Toggle */}
          <TouchableOpacity
            style={[
              styles.toolBtn,
              isSpeakerOn && { backgroundColor: "rgba(255, 255, 255, 0.2)" }
            ]}
            onPress={toggleSpeaker}
            disabled={callStatus === "disconnected" || callStatus === "rejected" || callStatus === "no_answer"}
          >
            <Ionicons
              name={isSpeakerOn ? "volume-high" : "volume-mute-outline"}
              size={24}
              color="#FFFFFF"
            />
            <Text style={styles.toolBtnText}>Hoparlör</Text>
          </TouchableOpacity>

          {/* Mute Toggle */}
          <TouchableOpacity
            style={[
              styles.toolBtn,
              isMuted && { backgroundColor: "rgba(255, 255, 255, 0.2)" }
            ]}
            onPress={toggleMute}
            disabled={callStatus === "disconnected" || callStatus === "rejected" || callStatus === "no_answer"}
          >
            <Ionicons
              name={isMuted ? "mic-off" : "mic-outline"}
              size={24}
              color={isMuted ? "#EF4444" : "#FFFFFF"}
            />
            <Text style={styles.toolBtnText}>Sessiz</Text>
          </TouchableOpacity>

          {/* Like Button */}
          <TouchableOpacity
            style={[
              styles.toolBtn,
              hasLiked && { backgroundColor: "rgba(255, 77, 103, 0.25)" }
            ]}
            onPress={sendLikeMessage}
            disabled={hasLiked || callStatus !== "connected"}
          >
            <Ionicons
              name={hasLiked ? "heart" : "heart-outline"}
              size={24}
              color={hasLiked ? "#F08A80" : "#FFFFFF"}
            />
            <Text style={styles.toolBtnText}>
              {hasLiked ? "Beğenildi" : "Beğen"}
            </Text>
          </TouchableOpacity>

          {/* Hangup Button (Red) */}
          <TouchableOpacity style={styles.hangupBtn} onPress={endCall}>
            <Ionicons name="call" size={26} color="#FFFFFF" style={{ transform: [{ rotate: "135deg" }] }} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: Spacing.four,
  },
  secureText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    fontFamily: Fonts.body,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.four,
  },
  avatarWrapper: {
    position: "relative",
    width: 150,
    height: 150,
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  pulseRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
  },
  peerName: {
    fontSize: 26,
    fontWeight: "bold",
    fontFamily: Fonts.heading,
    color: "#FFFFFF",
  },
  statusText: {
    fontSize: 15,
    fontFamily: Fonts.body,
    color: "rgba(255,255,255,0.7)",
  },
  timerContainer: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    marginTop: Spacing.two,
  },
  timerValue: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: Fonts.heading,
    color: "#FFFFFF",
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.six,
    width: "100%",
  },
  toolBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  toolBtnText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: "#FFFFFF",
  },
  hangupBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#AA423C",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  likedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 77, 103, 0.25)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
    marginTop: Spacing.one,
  },
  likedBadgeText: {
    color: "#F08A80",
    fontSize: 13,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
});