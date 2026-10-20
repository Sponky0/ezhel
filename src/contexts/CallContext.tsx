import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, PermissionsAndroid } from 'react-native';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { setAudioModeAsync } from 'expo-audio';
import { findOrCreateConversation } from '../lib/conversations';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Fonts, Spacing } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';
import { getIceServers } from '../lib/turn';

// Conditional WebRTC imports
let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let mediaDevices: any;
let InCallManager: any;

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    InCallManager = require('react-native-incall-manager').default;
  } catch (err) {
    console.warn('InCallManager could not be imported:', err);
  }
}

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webrtc = require('react-native-webrtc');
    RTCPeerConnection = webrtc.RTCPeerConnection;
    RTCSessionDescription = webrtc.RTCSessionDescription;
    RTCIceCandidate = webrtc.RTCIceCandidate;
    mediaDevices = webrtc.mediaDevices;
  } catch {
    console.warn('WebRTC not supported in this environment');
    RTCPeerConnection = class {};
    RTCSessionDescription = class {};
    RTCIceCandidate = class {};
    mediaDevices = {
      getUserMedia: () => Promise.reject(new Error('WebRTC mock')),
    };
  }
} else {
  if (typeof window !== 'undefined') {
    RTCPeerConnection = window.RTCPeerConnection;
    RTCSessionDescription = window.RTCSessionDescription;
    RTCIceCandidate = window.RTCIceCandidate;
    mediaDevices = navigator.mediaDevices;
  } else {
    RTCPeerConnection = class {};
    RTCSessionDescription = class {};
    RTCIceCandidate = class {};
    mediaDevices = {
      getUserMedia: () => Promise.reject(new Error('WebRTC mock')),
    };
  }
}

const requestBluetoothPermission = async () => {
  if (Platform.OS === 'android' && Platform.Version >= 31) {
    try {
      const isGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      );
      if (isGranted) return true;

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        {
          title: 'Bluetooth İzni',
          message: 'Sesin kablosuz kulaklığa yönlendirilmesi için Bluetooth izni gerekiyor.',
          buttonNeutral: 'Daha Sonra Sor',
          buttonNegative: 'İptal',
          buttonPositive: 'Tamam',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Bluetooth permission check/request error:', err);
      return false;
    }
  }
  return true;
};

interface IncomingCall {
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  roomName: string;
}

interface CallContextType {
  activeCallId: string | null;
  callStatus: "idle" | "initializing" | "ringing" | "connecting" | "connected" | "disconnected" | "rejected" | "no_answer" | "busy";
  timeLeft: number;
  isMuted: boolean;
  isSpeakerOn: boolean;
  peerName: string | null;
  peerAvatar: string | null;
  isCaller: boolean;
  roomName: string | null;
  hasLiked: boolean;
  peerLiked: boolean;
  startCall: (targetUserId: string, targetUsername: string, targetAvatar: string | null) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  sendLikeMessage: () => Promise<void>;
  setIncomingCall: (incomingCall: IncomingCall | null) => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<
    "idle" | "initializing" | "ringing" | "connecting" | "connected" | "disconnected" | "rejected" | "no_answer" | "busy"
  >("idle");
  const [timeLeft, setTimeLeft] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [hasLiked, setHasLiked] = useState(false);
  const [peerLiked, setPeerLiked] = useState(false);

  const [peerName, setPeerName] = useState<string | null>(null);
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);
  const [isCaller, setIsCaller] = useState(false);
  const [roomName, setRoomName] = useState<string | null>(null);

  // WebRTC & signaling refs
  const localStreamRef = useRef<any>(null);
  const pcRef = useRef<any>(null);
  const signalingChannelRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const ringTimeoutRef = useRef<any>(null);

  const userChannelRef = useRef<any>(null);
  const incomingCallRef = useRef<IncomingCall | null>(null);
  const activeCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    activeCallIdRef.current = activeCallId;
  }, [activeCallId]);

  useEffect(() => {
    if (!user?.id) {
      if (userChannelRef.current) {
        supabase.removeChannel(userChannelRef.current);
        userChannelRef.current = null;
      }
      const clearIncomingTimer = setTimeout(() => {
        setIncomingCall(null);
      }, 0);

      return () => clearTimeout(clearIncomingTimer);
    }

    // Subscribe to personal calls channel
    const channelName = `user_calls:${user.id}`;
    const channel = supabase.channel(channelName);
    userChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'call_incoming' }, (payload: any) => {
        // If already in a call, broadcast busy/rejected
        if (activeCallIdRef.current || incomingCallRef.current) {
          const sigChannel = supabase.channel(payload.payload.roomName);
          sigChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              sigChannel.send({
                type: 'broadcast',
                event: 'call_rejected',
                payload: { reason: 'busy' }
              });
              setTimeout(() => {
                supabase.removeChannel(sigChannel);
              }, 1000);
            }
          });
          return;
        }

        setIncomingCall({
          callerId: payload.payload.callerId,
          callerName: payload.payload.callerName,
          callerAvatar: payload.payload.callerAvatar,
          roomName: payload.payload.roomName,
        });
      })
      .on('broadcast', { event: 'call_cancelled' }, (payload: any) => {
        if (incomingCallRef.current?.callerId === payload.payload.callerId) {
          setIncomingCall(null);
        }
      });

    channel.subscribe();

    return () => {
      if (userChannelRef.current) {
        supabase.removeChannel(userChannelRef.current);
        userChannelRef.current = null;
      }
    };
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let subscription: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NativeEventEmitter, NativeModules } = require('react-native');
      if (NativeModules.InCallManager) {
        const emitter = new NativeEventEmitter(NativeModules.InCallManager);
        subscription = emitter.addListener('onAudioDeviceChanged', (data: any) => {
          console.log('CallContext: onAudioDeviceChanged event:', data);
          if (data && data.selectedAudioDevice) {
            setIsSpeakerOn(data.selectedAudioDevice === 'SPEAKER_PHONE');
          }
        });
      }
    } catch (error) {
      console.warn('Failed to register InCallManager onAudioDeviceChanged listener:', error);
    }

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  const setupWebRTC = async () => {
    try {
      if (Platform.OS !== "web") {
        // Request Bluetooth Connect permission for Android 12+
        await requestBluetoothPermission();

        try {
          if (InCallManager) {
            InCallManager.start({ media: 'audio', auto: true });
            InCallManager.setKeepScreenOn(true);
            InCallManager.setSpeakerphoneOn(false);
          } else {
            await setAudioModeAsync({
              shouldRouteThroughEarpiece: true, // Default to earpiece
              allowsRecording: true,
              playsInSilentMode: true,
              shouldPlayInBackground: true,
            });
          }
        } catch (e) {
          console.warn("Failed to set audio mode in setupWebRTC:", e);
        }
        await mediaDevices.enumerateDevices();
      }

      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      localStreamRef.current = stream;

      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      // Add local audio tracks to connection
      stream.getTracks().forEach((track: any) => {
        pc.addTrack(track, stream);
      });

      // Handle ICE Candidates
      pc.onicecandidate = (event: any) => {
        if (event.candidate && signalingChannelRef.current) {
          signalingChannelRef.current.send({
            type: "broadcast",
            event: "candidate",
            payload: event.candidate,
          });
        }
      };

      // Handle Remote Stream Audio
      pc.ontrack = (event: any) => {
        console.log("CallContext: Received remote audio track!");
      };

      return pc;
    } catch (err) {
      console.error("Failed to setup WebRTC in CallContext:", err);
      throw err;
    }
  };

  const startCallTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(0);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => prev + 1);
    }, 1000);
  };

  const sendPeerCallEvent = (peerId: string, event: "call_incoming" | "call_cancelled", payload: Record<string, unknown>) => {
    const peerCallChannel = supabase.channel(`user_calls:${peerId}`);

    peerCallChannel.subscribe((peerStatus) => {
      if (peerStatus === "SUBSCRIBED") {
        peerCallChannel.send({
          type: "broadcast",
          event,
          payload,
        });

        setTimeout(() => {
          supabase.removeChannel(peerCallChannel);
        }, 1000);
      }
    });
  };

  const setupSignaling = async (peerId: string, callerMode: boolean, customRoomName?: string) => {
    if (!user || !profile) return;

    const sortedIds = [user.id, peerId].sort();
    const generatedRoomName = customRoomName || `signaling:${sortedIds[0]}_${sortedIds[1]}`;
    setRoomName(generatedRoomName);

    try {
      const pc = await setupWebRTC();
      const channel = supabase.channel(generatedRoomName);
      signalingChannelRef.current = channel;

      channel
        .on("broadcast", { event: "join" }, async () => {
          if (callerMode && pc) {
            setCallStatus("connecting");
            // Caller initiates offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            channel.send({
              type: "broadcast",
              event: "offer",
              payload: offer,
            });
          }
        })
        .on("broadcast", { event: "offer" }, async ({ payload }: any) => {
          if (!callerMode && pc) {
            setCallStatus("connecting");
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            channel.send({
              type: "broadcast",
              event: "answer",
              payload: answer,
            });

            setCallStatus("connected");
            startCallTimer();
          }
        })
        .on("broadcast", { event: "answer" }, async ({ payload }: any) => {
          if (callerMode && pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            setCallStatus("connected");
            startCallTimer();
          }
        })
        .on("broadcast", { event: "candidate" }, async ({ payload }: any) => {
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(payload));
          }
        })
        .on("broadcast", { event: "call_rejected" }, ({ payload }: any) => {
          if (payload?.reason === "busy") {
            setCallStatus("busy");
          } else {
            setCallStatus("rejected");
          }
          cleanupCall();
        })
        .on("broadcast", { event: "disconnect" }, () => {
          setCallStatus("disconnected");
          cleanupCall();
        })
        .on("broadcast", { event: "like" }, () => {
          console.log("CallContext: Received like event from peer");
          setPeerLiked(true);
        });

      await channel.subscribe(async (subStatus: any) => {
        if (subStatus === "SUBSCRIBED") {
          if (callerMode) {
            setCallStatus("ringing");

            // Broadcast incoming call to peer
             sendPeerCallEvent(peerId, "call_incoming", {
              callerId: user.id,
              callerName: profile.username,
              callerAvatar: profile.avatar_url,
              roomName: generatedRoomName,
            });

            // Save call session to database to trigger push notification
            supabase
              .from("calls")
              .insert({
                caller_id: user.id,
                receiver_id: peerId,
                room_name: generatedRoomName,
              })
              .then(({ error }) => {
                if (error) {
                  console.error("Failed to insert call for push notification:", error);
                }
              });

            // Set 30s timeout for no answer
            if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
            ringTimeoutRef.current = setTimeout(() => {
              setCallStatus("no_answer");
              sendPeerCallEvent(peerId, "call_cancelled", { callerId: user.id });
              cleanupCall();
            }, 30000);
          } else {
            // Recipient sends join event
            channel.send({
              type: "broadcast",
              event: "join",
            });
          }
        }
      });
    } catch (err) {
      console.error("Failed to setup WebRTC signaling in CallContext:", err);
      setCallStatus("disconnected");
      cleanupCall();
    }
  };

  const cleanupCall = () => {
    // Clear timers
    if (timerRef.current) clearInterval(timerRef.current);
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);

    setHasLiked(false);
    setPeerLiked(false);

    // Reset audio mode
    if (Platform.OS !== "web") {
      try {
        if (InCallManager) {
          InCallManager.setKeepScreenOn(false);
          InCallManager.stop();
        } else {
          setAudioModeAsync({
            allowsRecording: false,
            shouldPlayInBackground: false,
            shouldRouteThroughEarpiece: false,
          });
        }
      } catch (e) {
        console.warn("Failed to reset audio mode in cleanupCall:", e);
      }
    }

    // Stop local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track: any) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping local track:", e);
        }
      });
      localStreamRef.current = null;
    }

    // Close PeerConnection
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {
        console.warn("Error closing peer connection:", e);
      }
      pcRef.current = null;
    }

    // Remove signaling channel
    if (signalingChannelRef.current) {
      supabase.removeChannel(signalingChannelRef.current);
      signalingChannelRef.current = null;
    }

    // Delay resetting status/activeId to allow screen to show end state
    setTimeout(() => {
      setActiveCallId(null);
      setCallStatus("idle");
      setPeerName(null);
      setPeerAvatar(null);
      setIsCaller(false);
      setRoomName(null);
    }, 2000);
  };

  const endCall = () => {
    if (signalingChannelRef.current) {
      signalingChannelRef.current.send({
        type: "broadcast",
        event: "disconnect",
      });
    }

    if (activeCallId && isCaller && (callStatus === "ringing" || callStatus === "initializing")) {
      sendPeerCallEvent(activeCallId, "call_cancelled", { callerId: user!.id });
    }

    setCallStatus("disconnected");
    cleanupCall();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track: any) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleSpeaker = async () => {
    const nextSpeakerState = !isSpeakerOn;
    setIsSpeakerOn(nextSpeakerState);
    console.log("CallContext: Speaker toggled:", nextSpeakerState);
    if (Platform.OS !== "web") {
      try {
        if (InCallManager) {
          InCallManager.setSpeakerphoneOn(nextSpeakerState);
        } else {
          await setAudioModeAsync({
            shouldRouteThroughEarpiece: !nextSpeakerState,
            allowsRecording: true,
            playsInSilentMode: true,
            shouldPlayInBackground: true,
          });
        }
      } catch (err) {
        console.error("Failed to set audio mode on speaker toggle:", err);
      }
    }
  };

  const sendLikeMessage = async () => {
    if (!user || !activeCallId) return;
    try {
      setHasLiked(true);

      const { conversationId } = await findOrCreateConversation(user.id, activeCallId);
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: "Seni beğendim! 💖",
      });

      if (error) throw error;

      if (signalingChannelRef.current) {
        signalingChannelRef.current.send({
          type: "broadcast",
          event: "like",
          payload: { senderId: user.id },
        });
      }
      console.log("CallContext: Like message sent and broadcasted");
    } catch (err) {
      console.error("CallContext: Failed to send like message:", err);
      setHasLiked(false);
    }
  };

  const acceptCall = () => {
    if (!incomingCall) return;
    const call = incomingCall;
    setIncomingCall(null);
    setActiveCallId(call.callerId);
    setPeerName(call.callerName);
    setPeerAvatar(call.callerAvatar);
    setIsCaller(false);
    setCallStatus("initializing");
    setTimeLeft(0);
    setIsMuted(false);
    setIsSpeakerOn(false);

    // Navigate to voice call screen
    router.push('/voice-call');

    // Setup signaling
    setupSignaling(call.callerId, false, call.roomName);
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    const call = incomingCall;
    setIncomingCall(null);
    
    // Send rejection signal
    const sigChannel = supabase.channel(call.roomName);
    sigChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        sigChannel.send({
          type: 'broadcast',
          event: 'call_rejected',
          payload: { reason: 'rejected' }
        });
        setTimeout(() => {
          supabase.removeChannel(sigChannel);
        }, 1000);
      }
    });
  };

  const startCall = (targetUserId: string, targetUsername: string, targetAvatar: string | null) => {
    if (!user) return;
    
    // Set call info
    setActiveCallId(targetUserId);
    setPeerName(targetUsername);
    setPeerAvatar(targetAvatar);
    setIsCaller(true);
    setCallStatus("initializing");
    setTimeLeft(0);
    setIsMuted(false);
    setIsSpeakerOn(false);

    // Navigate to voice call screen
    router.push('/voice-call');

    // Setup signaling
    setupSignaling(targetUserId, true);
  };

  return (
    <CallContext.Provider value={{ 
      activeCallId, 
      callStatus, 
      timeLeft, 
      isMuted, 
      isSpeakerOn, 
      peerName, 
      peerAvatar, 
      isCaller, 
      roomName, 
      hasLiked,
      peerLiked,
      startCall, 
      acceptCall, 
      rejectCall, 
      endCall, 
      toggleMute, 
      toggleSpeaker,
      sendLikeMessage,
      setIncomingCall
    }}>
      {children}
      
      {/* INCOMING CALL OVERLAY */}
      {incomingCall && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={rejectCall}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.backgroundElement, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={styles.callerContainer}>
                <Image
                  source={incomingCall.callerAvatar ? { uri: incomingCall.callerAvatar } : require('../../assets/images/place-holder.png')}
                  style={styles.avatar}
                  contentFit="cover"
                />
                <Text style={[styles.callerName, { color: colors.text }]}>
                  {incomingCall.callerName}
                </Text>
                <Text style={[styles.callType, { color: colors.textSecondary }]}>
                  Gelen Sesli Arama...
                </Text>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnReject]}
                  onPress={rejectCall}
                >
                  <Ionicons name="close-sharp" size={24} color="#FFFFFF" />
                  <Text style={styles.btnLabel}>Reddet</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.btnAccept]}
                  onPress={acceptCall}
                >
                  <Ionicons name="call" size={20} color="#FFFFFF" />
                  <Text style={styles.btnLabel}>Cevapla</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within CallProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 15, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    width: '90%',
    maxWidth: 340,
    borderRadius: 24,
    padding: Spacing.five,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  callerContainer: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: Spacing.three,
  },
  callerName: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: Fonts.heading,
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  callType: {
    fontSize: 14,
    fontFamily: Fonts.body,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: Spacing.four,
  },
  btn: {
    flex: 1,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnReject: {
    backgroundColor: '#EF4444',
  },
  btnAccept: {
    backgroundColor: '#1EBEA5',
  },
  btnLabel: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
