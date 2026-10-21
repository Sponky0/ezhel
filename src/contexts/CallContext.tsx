import { createCallSignaling } from '../lib/callSignaling';
import { withTimeout } from '../lib/async';
import { ActionModal } from '../components/ActionModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isPeerConnected } from '../lib/callConnection';
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { startVoiceAudio, setVoiceSpeaker, stopVoiceAudio } from '../lib/callAudio';
import { findOrCreateConversation } from '../lib/conversations';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';
import { requestId } from '../lib/requestId';
import { getIceServers } from '../lib/turn';

// Conditional WebRTC imports
let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let mediaDevices: any;

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


interface IncomingCall {
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  roomName: string;
}

interface CallContextType {
  callError: string | null;
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [incomingCall, setIncomingCallState] = useState<IncomingCall | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<
    "idle" | "initializing" | "ringing" | "connecting" | "connected" | "disconnected" | "rejected" | "no_answer" | "busy"
  >("idle");
  const [timeLeft, setTimeLeft] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const callEpochRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const activeRoomRef = useRef<string | null>(null);
  const incomingCallRef = useRef<IncomingCall | null>(null);
  const activeCallIdRef = useRef<string | null>(null);

  const setIncomingCall = useCallback((call: IncomingCall | null) => {
    if (call && (activeCallIdRef.current || incomingCallRef.current?.roomName === call.roomName)) return;
    incomingCallRef.current = call; setIncomingCallState(call);
  }, []);

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
        if (activeRoomRef.current === payload.payload?.roomName || incomingCallRef.current?.roomName === payload.payload?.roomName) return;
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
  }, [user?.id, setIncomingCall]);

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

  const setupWebRTC = async (epoch: number) => {
    try {
      await startVoiceAudio('direct');

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
    const generatedRoomName = customRoomName || `signaling:${sortedIds[0]}_${sortedIds[1]}:${requestId()}`;
    const epoch = ++callEpochRef.current;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setCallError(null);
    activeRoomRef.current = generatedRoomName;
    setRoomName(generatedRoomName);

    try {
      const pc = await setupWebRTC(epoch);
      const channel = supabase.channel(generatedRoomName, { config: { broadcast: { ack: true } } });
      signalingChannelRef.current = channel;
      const negotiation = createCallSignaling({
        pc, channel, caller: callerMode,
        description: data => new RTCSessionDescription(data), candidate: data => new RTCIceCandidate(data),
        onConnecting: () => { if (connected) return; if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current); setCallStatus("connecting"); },
        onError: error => { failCall(error.message); },

      });

      let connected = false;
      const connectionTimeout = setTimeout(() => {
        if (pcRef.current !== pc || connected) return;
        failCall('Ses bağlantısı kurulamadı. TURN erişimi veya ağ kısıtlaması olabilir; farklı ağla tekrar deneyin.');
      }, 45000);
      const observeConnection = () => {
        if (pcRef.current !== pc) return;
        if (isPeerConnected(pc.connectionState, pc.iceConnectionState)) {
          if (connected) return;
          connected = true;
          negotiation.connected();
          clearTimeout(connectionTimeout);
          if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
          setCallStatus("connected");
          startCallTimer();
        } else if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
          clearTimeout(connectionTimeout);
          setCallStatus("disconnected");
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

      let invited = false;
      channel.subscribe((subStatus: any) => {
        if (subStatus === "SUBSCRIBED") {
          negotiation.subscribed();
          if (callerMode && !invited) {
            invited = true;
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
          }
        } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
          negotiation.disconnected(); failCall('Arama sinyal sunucusuna bağlanılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
        }
      });
    } catch (err) {
      if (epoch !== callEpochRef.current) return;
      failCall(err instanceof Error ? err.message : "Arama kurulamadı.");
    }
  };

  const cleanupCall = () => {
    const epoch = ++callEpochRef.current;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    // Clear timers
    if (timerRef.current) clearInterval(timerRef.current);
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);

    setHasLiked(false);
    setPeerLiked(false);

    void stopVoiceAudio('direct').catch(error => console.warn('Call audio cleanup failed:', error));

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
    resetTimerRef.current = setTimeout(() => {
      if (callEpochRef.current !== epoch) return;
      activeCallIdRef.current = null;
      setActiveCallId(null);
      setCallStatus("idle");
      setPeerName(null);
      setPeerAvatar(null);
      setIsCaller(false);
      activeRoomRef.current = null;
      setRoomName(null);
    }, 2000);
  };

  const failCall = (message: string) => {
    setCallError(message); setCallStatus('disconnected');
    ActionModal.show({ title: 'Arama kurulamadı', message }); cleanupCall();
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
    try {
      await setVoiceSpeaker(nextSpeakerState);
    } catch (error) {
      setIsSpeakerOn(!nextSpeakerState);
      console.warn('Speaker routing failed:', error);
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
    if (!incomingCallRef.current) return;
    const call = incomingCallRef.current;
    incomingCallRef.current = null;
    setIncomingCall(null);
    activeCallIdRef.current = call.callerId;
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
    if (!incomingCallRef.current) return;
    const call = incomingCallRef.current;
    incomingCallRef.current = null;
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
    if (!user || activeCallIdRef.current) return;
    activeCallIdRef.current = targetUserId;

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
      callError,
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

      {incomingCall && (
        <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, borderRadius: 18, backgroundColor: colors.backgroundElement, padding: 16, elevation: 30, zIndex: 2000 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{incomingCall.callerName} · Gelen sesli arama</Text>
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 14 }}>
            <TouchableOpacity onPress={rejectCall}><Text style={{ color: '#ff7777', padding: 8 }}>Reddet</Text></TouchableOpacity>
            <TouchableOpacity onPress={acceptCall}><Text style={{ color: '#59e795', padding: 8 }}>Cevapla</Text></TouchableOpacity>
          </View>
        </View>
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
