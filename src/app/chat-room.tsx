import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColorScheme } from "../hooks/use-color-scheme";
import { ActionModal } from "@/components/ActionModal";
import { Image as ExpoImage } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { useUnreadMessages } from "../contexts/UnreadMessagesContext";
import { uploadFile } from "../lib/storage";
import { supabase } from "../lib/supabase";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
  deleted_at: string | null;
}

export default function ChatRoomScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, showLoginModal, refreshProfile } = useAuth();
  const { startCall } = useCall();
  const { markConversationRead, setActiveConversationId } = useUnreadMessages();
  const router = useRouter();
  const searchParams = useLocalSearchParams();
  const conversationId = searchParams.id as string;
  const recipientName = searchParams.name as string;

  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  // Redirect guests back and show login modal
  useEffect(() => {
    if (!user) {
      router.back();
      showLoginModal();
    }
  }, [router, showLoginModal, user]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [recipientProfile, setRecipientProfile] = useState<{
    username: string;
    avatar_url: string | null;
    is_online: boolean;
    privacy_show_read_receipts?: boolean;
  } | null>(null);
  const [recipientLastReadAt, setRecipientLastReadAt] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [giftModalVisible, setGiftModalVisible] = useState(false);
  const [giftAmount, setGiftAmount] = useState<number>(0);
  const [customGiftAmount, setCustomGiftAmount] = useState("");
  const [sendingGift, setSendingGift] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!conversationId) return;

    setActiveConversationId(conversationId);
    markConversationRead(conversationId);

    return () => {
      setActiveConversationId(null);
    };
  }, [conversationId, markConversationRead, setActiveConversationId]);

  // Fetch recipient details and check block status
  useEffect(() => {
    const fetchRecipientAndBlocks = async () => {
      if (!user || !conversationId) return;

      try {
        // Find recipient user_id and last_read_at
        const { data: participants, error } = await supabase
          .from("conversation_participants")
          .select("user_id, last_read_at")
          .eq("conversation_id", conversationId)
          .neq("user_id", user.id)
          .single();

        if (error) throw error;

        if (participants) {
          const recId = participants.user_id;
          setRecipientId(recId);
          setRecipientLastReadAt(participants.last_read_at);

          // Profil ve engel sorgularını paralel çalıştır (ikisi de recId'ye bağlı).
          const [profileRes, blockRes] = await Promise.all([
            supabase
              .from("profiles")
              .select("username, avatar_url, is_online, privacy_show_read_receipts")
              .eq("id", recId)
              .single(),
            supabase
              .from("blocks")
              .select("id")
              .or(
                `and(blocker_id.eq.${user.id},blocked_id.eq.${recId}),and(blocker_id.eq.${recId},blocked_id.eq.${user.id})`,
              ),
          ]);

          if (!profileRes.error && profileRes.data) {
            setRecipientProfile(profileRes.data);
          }

          if (blockRes.data && blockRes.data.length > 0) {
            setIsBlocked(true);
          }
        }
      } catch (err) {
        console.error("Error in fetchRecipientAndBlocks:", err);
      }
    };

    fetchRecipientAndBlocks();
  }, [user, conversationId]);

  // Fetch Message History
  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;

    try {
      // Son 50 mesajı çek (tüm geçmiş yerine): created_at desc + limit, sonra ters çevir.
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, content, media_url, created_at, deleted_at",
        )
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      // Eskiden yeniye doğru göstermek için ters çevir.
      setMessages((data || []).slice().reverse());
      setLoading(false);

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      console.error("Error fetching messages:", err);
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMessages();
    }, 0);

    // Subscribe to real-time message changes for this conversation
    const channelId = `room:${conversationId}:${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as Message;
            // Only add if not deleted
            if (!newMsg.deleted_at) {
              setMessages((prev) => {
                // Prevent duplicates
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
              if (newMsg.sender_id !== user?.id) {
                markConversationRead(conversationId);
              }
              setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
              }, 100);
            }
          } else if (payload.eventType === "UPDATE") {
            const updatedMsg = payload.new as Message;
            if (updatedMsg.deleted_at) {
              // Remove soft deleted messages from UI
              setMessages((prev) => prev.filter((m) => m.id !== updatedMsg.id));
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedParticipant = payload.new as any;
          if (updatedParticipant.user_id !== user?.id) {
            setRecipientLastReadAt(updatedParticipant.last_read_at);
          }
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchMessages, markConversationRead, user?.id]);

  // Send Text Message
  const handleSend = async () => {
    if (!inputText.trim() || !user || !conversationId) return;
    if (isBlocked) {
      ActionModal.show({
        title: "Engellendi",
        message: "Bu kullanıcı ile aranızda bir engelleme bulunuyor.",
        type: "warning",
      });
      return;
    }

    const textToSend = inputText.trim();
    setInputText("");
    setSending(true);

    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: textToSend,
      });

      if (error) throw error;
    } catch (err) {
      console.error("Send message error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Mesaj gönderilemedi.",
        type: "error",
      });
    } finally {
      setSending(false);
    }
  };

  // Send Photo Message
  const handleSendPhoto = async () => {
    if (!user || !conversationId) return;
    if (isBlocked) {
      ActionModal.show({
        title: "Engellendi",
        message: "Bu kullanıcı ile aranızda bir engelleme bulunuyor.",
        type: "warning",
      });
      return;
    }

    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        ActionModal.show({
          title: "İzin Gerekli",
          message: "Galeriye erişmek için izin vermelisiniz.",
          type: "warning",
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSending(true);
        const imageUri = result.assets[0].uri;
        const fileExt = imageUri.split(".").pop() || "jpg";
        const fileName = `chat_${conversationId}_${Date.now()}.${fileExt}`;

        // Upload
        const publicUrl = await uploadFile("chat_media", fileName, imageUri);

        // Save message record
        const { error } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: user.id,
          media_url: publicUrl,
        });

        if (error) throw error;
      }
    } catch (err) {
      console.error("Send photo error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Fotoğraf gönderilemedi.",
        type: "error",
      });
    } finally {
      setSending(false);
    }
  };

  // Delete Message (Soft Delete)
  const handleDeleteMessage = (messageId: string) => {
    ActionModal.show({
      title: "Mesajı Sil",
      message: "Bu mesajı silmek istiyor musunuz? (Sadece sizin arayüzünüzden silinecek, admin panelinde kayıtlı kalacaktır.)",
      type: "warning",
      buttons: [
        { text: "İptal", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("messages")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", messageId);

              if (error) throw error;

              // Local state update in case trigger delay
              setMessages((prev) => prev.filter((m) => m.id !== messageId));
            } catch (err) {
              console.error("Delete message error:", err);
              ActionModal.show({
                title: "Hata",
                message: "Mesaj silinemedi.",
                type: "error",
              });
            }
          },
        },
      ],
    });
  };

  // Block User Flow
  const handleBlockUser = () => {
    if (!recipientId || !user) return;

    ActionModal.show({
      title: "Kullanıcıyı Engelle",
      message: `${recipientProfile?.username || recipientName} adlı kullanıcıyı engellemek istediğinize emin misiniz? Birbirinize mesaj gönderemezsiniz.`,
      type: "warning",
      buttons: [
        { text: "İptal", style: "cancel" },
        {
          text: "Engelle",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase.from("blocks").insert({
                blocker_id: user.id,
                blocked_id: recipientId,
              });

              if (error) throw error;

              ActionModal.show({
                title: "Başarılı",
                message: "Kullanıcı engellendi.",
                type: "success",
              });
              setIsBlocked(true);
              router.back();
            } catch (err) {
              console.error("Block error:", err);
              ActionModal.show({
                title: "Hata",
                message: "Engelleme işlemi başarısız.",
                type: "error",
              });
            }
          },
        },
      ],
    });
  };

  // Report User Flow
  const handleReportUser = () => {
    if (!recipientId || !user) return;

    ActionModal.prompt({
      title: "Şikayet Et",
      message: "Lütfen şikayet nedeninizi kısaca yazın:",
      onSubmit: async (reason) => {
        if (!reason || !reason.trim()) {
          ActionModal.show({
            title: "Hata",
            message: "Şikayet nedeni boş bırakılamaz.",
            type: "error",
          });
          return;
        }

        try {
          const { error } = await supabase.from("reports").insert({
            reporter_id: user.id,
            reported_id: recipientId,
            reason: reason.trim(),
          });

          if (error) throw error;

          ActionModal.show({
            title: "Teşekkürler",
            message: "Şikayetiniz alındı. Moderatör ekibimiz en kısa sürede inceleyecektir.",
            type: "success",
          });
        } catch (err) {
          console.error("Report error:", err);
          ActionModal.show({
            title: "Hata",
            message: "Şikayet iletilemedi.",
            type: "error",
          });
        }
      },
    });
  };

  // Voice Call Action
  const handleVoiceCall = () => {
    if (!recipientId) return;
    if (isBlocked) {
      ActionModal.show({
        title: "Engellendi",
        message: "Engellenmiş bir kullanıcı ile sesli arama gerçekleştiremezsiniz.",
        type: "error",
      });
      return;
    }
    startCall(recipientId, recipientProfile?.username || recipientName, recipientProfile?.avatar_url || null);
  };

  // Header Options Menu
  const handleShowOptions = () => {
    ActionModal.show({
      title: "Seçenekler",
      message: "Yapmak istediğiniz işlemi seçin:",
      type: "info",
      buttons: [
        { text: "İptal", style: "cancel" },
        { text: "Kullanıcıyı Şikayet Et", onPress: handleReportUser },
        { text: "Kullanıcıyı Engelle", style: "destructive", onPress: handleBlockUser },
      ],
    });
  };

  // Gift Press Action
  const handleGiftPress = () => {
    if (!user) {
      ActionModal.show({
        title: "Giriş Yapın",
        message: "Hediye göndermek için giriş yapmanız gerekmektedir.",
        type: "warning",
      });
      return;
    }
    setGiftAmount(0);
    setCustomGiftAmount("");
    setGiftModalVisible(true);
  };

  const handleSendGift = async () => {
    if (giftAmount <= 0) {
      ActionModal.show({
        title: "Hata",
        message: "Lütfen göndermek istediğiniz elmas miktarını seçin.",
        type: "error",
      });
      return;
    }
    const myDiamonds = profile?.diamonds ?? 0;
    if (myDiamonds < giftAmount) {
      ActionModal.show({
        title: "Yetersiz Bakiye",
        message: `Bakiyeniz: ${myDiamonds} elmas. Daha fazla elmas satın almak için profilinize gidin.`,
        type: "warning",
        buttons: [
          { text: "Tamam", style: "cancel" },
        ],
      });
      return;
    }

    setSendingGift(true);
    try {
      const { error } = await supabase.rpc("send_diamond_gift", {
        recipient_id: recipientId,
        amount: giftAmount,
      });
      if (error) throw error;

      // Send a gift message in the chat
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user!.id,
        content: `🎁 Hediye: ${giftAmount} Elmas gönderildi!`,
      });

      await refreshProfile();
      setGiftModalVisible(false);
      setGiftAmount(0);
      setCustomGiftAmount("");

      ActionModal.show({
        title: (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: colors.text }}>Hediye Gönderildi</Text>
            <Ionicons name="diamond" size={20} color="#A855F7" />
          </View>
        ),
        message: `${recipientProfile?.username || recipientName} kullanıcısına ${giftAmount} elmas gönderildi!`,
        type: "success",
      });
    } catch (err: any) {
      console.error("Send gift error:", err);
      ActionModal.show({
        title: "Hata",
        message: err.message || "Hediye gönderilemedi.",
        type: "error",
      });
    } finally {
      setSendingGift(false);
    }
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id;

    if (!isMe) {
      // Incoming message (from recipient)
      return (
        <View style={styles.incomingMessageRow}>
          <ExpoImage
            source={recipientProfile?.avatar_url ? { uri: recipientProfile.avatar_url } : require("../../assets/images/place-holder.png")}
            style={styles.messageAvatar}
            contentFit="cover"
          />

          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.incomingBubbleContainer}
          >
            <View
              style={[
                styles.msgBubble,
                styles.incomingBubble,
                { backgroundColor: scheme === "dark" ? "#242526" : "#E4E6EB" }
              ]}
            >
              {item.media_url ? (
                <TouchableOpacity activeOpacity={0.9} onPress={() => setSelectedImageUri(item.media_url)}>
                  <Image source={{ uri: item.media_url }} style={styles.msgImage} />
                </TouchableOpacity>
              ) : item.content?.startsWith("🎁 Hediye:") ? (
                <View style={{ alignItems: "center", paddingVertical: 4 }}>
                  <Ionicons name="diamond" size={28} color="#A855F7" />
                  <Text style={{ color: "#A855F7", fontWeight: "bold", fontSize: 15, marginTop: 4 }}>
                    {item.content?.replace("🎁 ", "")}
                  </Text>
                </View>
              ) : item.content?.startsWith("🎬 Güncellemene cevap:") ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}>
                  <Ionicons name="film-outline" size={16} color={colors.text} />
                  <Text style={[styles.incomingMsgText, { color: colors.text }]}>
                    {item.content?.replace("🎬 ", "")}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.incomingMsgText, { color: colors.text }]}>
                  {item.content}
                </Text>
              )}
              <Text style={[styles.incomingMsgTime, { color: colors.textSecondary }]}>
                {new Date(item.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    // Outgoing message (from me)
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={() => handleDeleteMessage(item.id)}
        style={styles.outgoingBubbleContainer}
      >
        <View style={[styles.msgBubble, styles.outgoingBubble, { backgroundColor: colors.primary }]}>
          {item.media_url ? (
            <TouchableOpacity activeOpacity={0.9} onPress={() => setSelectedImageUri(item.media_url)}>
              <Image source={{ uri: item.media_url }} style={styles.msgImage} />
            </TouchableOpacity>
          ) : item.content?.startsWith("🎁 Hediye:") ? (
            <View style={{ alignItems: "center", paddingVertical: 4 }}>
              <Ionicons name="diamond" size={28} color="#FFD700" />
              <Text style={{ color: "#FFD700", fontWeight: "bold", fontSize: 15, marginTop: 4 }}>
                {item.content?.replace("🎁 ", "")}
              </Text>
            </View>
          ) : item.content?.startsWith("🎬 Güncellemene cevap:") ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}>
              <Ionicons name="film-outline" size={16} color="#FFF" />
              <Text style={styles.outgoingMsgText}>
                {item.content?.replace("🎬 ", "")}
              </Text>
            </View>
          ) : (
            <Text style={styles.outgoingMsgText}>{item.content}</Text>
          )}
          <View style={{ flexDirection: "row", alignSelf: "flex-end", alignItems: "center", gap: 3, marginTop: 3 }}>
            <Text style={{ fontSize: 9, color: "rgba(255, 255, 255, 0.7)", fontFamily: Fonts.body }}>
              {new Date(item.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </Text>
            {recipientLastReadAt && new Date(item.created_at) <= new Date(recipientLastReadAt) ? (
              <Ionicons 
                name="checkmark-done" 
                size={14} 
                color={
                  (profile?.privacy_show_read_receipts !== false) && 
                  (recipientProfile?.privacy_show_read_receipts !== false)
                    ? "#38BDF8"
                    : "rgba(255, 255, 255, 0.6)"
                } 
              />
            ) : (
              <Ionicons name="checkmark" size={14} color="rgba(255, 255, 255, 0.6)" />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => recipientId && router.push(`/user-profile?id=${recipientId}`)}
          style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
        >
          {/* Header Profile Photo */}
          <View style={{ position: "relative" }}>
            <ExpoImage
              source={recipientProfile?.avatar_url ? { uri: recipientProfile.avatar_url } : require("../../assets/images/place-holder.png")}
              style={styles.headerAvatar}
              contentFit="cover"
            />
            {recipientProfile?.is_online && !isBlocked && (
              <View style={[styles.headerOnlineBadge, { backgroundColor: colors.online, borderColor: colors.background }]} />
            )}
          </View>

          <View style={styles.headerInfo}>
            <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>
              {recipientProfile?.username || recipientName}
            </Text>
            <Text
              style={[
                styles.statusText,
                {
                  color: isBlocked
                    ? "#EF4444"
                    : recipientProfile?.is_online
                    ? colors.online
                    : colors.textSecondary,
                },
              ]}
            >
              {isBlocked ? "Engellendi" : recipientProfile?.is_online ? "Aktif" : "Çevrimdışı"}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleVoiceCall}
            style={styles.voiceCallButton}
          >
            <Ionicons name="call" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShowOptions}
            style={styles.headerMenuButton}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={22}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Message List & Input Bar inside KeyboardAvoidingView */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.list}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}

        <View
          style={[
            styles.inputBarContainer,
            {
              borderTopColor: colors.border,
              paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
            },
          ]}
        >
          {/* Camera Button */}
          <TouchableOpacity
            onPress={handleSendPhoto}
            style={styles.attachmentButton}
            disabled={isBlocked || sending}
          >
            <Ionicons
              name="camera"
              size={24}
              color={colors.primary}
            />
          </TouchableOpacity>

          {/* Gift Button */}
          <TouchableOpacity
            onPress={handleGiftPress}
            style={styles.giftButton}
            disabled={isBlocked || sending}
          >
            <Ionicons
              name="gift"
              size={24}
              color="#A855F7"
            />
          </TouchableOpacity>

          {/* Pill-shaped Input Container */}
          <View
            style={[
              styles.inputContainer,
              {
                backgroundColor: scheme === "dark" ? "#1C212E" : "#F2F4F7",
              },
            ]}
          >
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                },
              ]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Mesaj yazın..."
              placeholderTextColor={colors.textSecondary}
              multiline
              editable={!isBlocked && !sending}
            />
          </View>

          {/* Send Button */}
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            disabled={!inputText.trim() || sending || isBlocked}
          >
            {sending ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons 
                name="send" 
                size={22} 
                color={!inputText.trim() || isBlocked ? (scheme === "dark" ? "#444" : "#ccc") : colors.primary} 
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Diamond Gift Modal */}
      <Modal
        visible={giftModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setGiftModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <View
            style={{
              backgroundColor: colors.backgroundElement,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              paddingBottom: Math.max(insets.bottom, 16) + 20,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: "bold" }}>
                <Ionicons name="gift" size={20} color="#A855F7" /> Hediye Gönder
              </Text>
              <TouchableOpacity onPress={() => setGiftModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16, backgroundColor: scheme === "dark" ? "#1E1B3A" : "#F3F0FF", borderRadius: 12, padding: 12 }}>
              <ExpoImage
                source={recipientProfile?.avatar_url ? { uri: recipientProfile.avatar_url } : require("../../assets/images/place-holder.png")}
                style={{ width: 40, height: 40, borderRadius: 20 }}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "bold", fontSize: 15 }}>
                  {recipientProfile?.username || recipientName}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="diamond" size={14} color="#A855F7" />
                <Text style={{ color: "#A855F7", fontWeight: "bold" }}>
                  Bakiye: {profile?.diamonds ?? 0}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {[5, 10, 50, 100].map((amount) => (
                <TouchableOpacity
                  key={amount}
                  onPress={() => { setGiftAmount(amount); setCustomGiftAmount(""); }}
                  style={{
                    flex: 1,
                    minWidth: "22%",
                    backgroundColor: giftAmount === amount ? "#A855F7" : (scheme === "dark" ? "#1E1B3A" : "#F3F0FF"),
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: giftAmount === amount ? "#A855F7" : "#A855F730",
                  }}
                >
                  <Ionicons name="diamond" size={18} color={giftAmount === amount ? "#FFF" : "#A855F7"} />
                  <Text style={{ color: giftAmount === amount ? "#FFF" : colors.text, fontWeight: "bold", fontSize: 14, marginTop: 2 }}>
                    {amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={{ backgroundColor: colors.background, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16 }}
              placeholder="Özel miktar girin..."
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={customGiftAmount}
              onChangeText={(t) => {
                setCustomGiftAmount(t);
                const num = parseInt(t);
                if (!isNaN(num) && num > 0) setGiftAmount(num);
                else setGiftAmount(0);
              }}
            />

            <TouchableOpacity
              onPress={handleSendGift}
              disabled={sendingGift || giftAmount <= 0}
              style={{
                backgroundColor: giftAmount > 0 ? "#A855F7" : "#A855F750",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                opacity: sendingGift ? 0.6 : 1,
              }}
            >
              {sendingGift ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "bold" }}>
                  {giftAmount > 0 ? (
                    <>
                      <Ionicons name="gift" size={16} color="#FFF" /> {giftAmount} Elmas Gönder
                    </>
                  ) : (
                    "Miktar Seçin"
                  )}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full-Screen Image Viewer Modal */}
      <Modal
        visible={!!selectedImageUri}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedImageUri(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.95)",
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => setSelectedImageUri(null)}
        >
          {selectedImageUri && (
            <ExpoImage
              source={{ uri: selectedImageUri }}
              style={{ width: "100%", height: "100%" }}
              contentFit="contain"
            />
          )}
          <TouchableOpacity
            style={{
              position: "absolute",
              top: insets.top > 0 ? insets.top + 10 : 20,
              right: 20,
              backgroundColor: "rgba(0,0,0,0.5)",
              width: 40,
              height: 40,
              borderRadius: 20,
              justifyContent: "center",
              alignItems: "center",
            }}
            onPress={() => setSelectedImageUri(null)}
          >
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.two,
    paddingVertical: 10,
    borderBottomWidth: 1.5,
  },
  backButton: {
    padding: Spacing.two,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: Spacing.two,
  },
  headerOnlineBadge: {
    position: "absolute",
    bottom: -1,
    right: 6,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
  },
  headerInfo: {
    flex: 1,
    justifyContent: "center",
  },
  headerName: {
    fontSize: 15,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  statusText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  voiceCallButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  headerMenuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  incomingMessageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 8,
    alignSelf: "flex-start",
    maxWidth: "80%",
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: Spacing.two,
  },
  incomingBubbleContainer: {
    flex: 1,
  },
  outgoingBubbleContainer: {
    marginBottom: 8,
    alignSelf: "flex-end",
    maxWidth: "80%",
  },
  msgBubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
  },
  incomingBubble: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
  },
  outgoingBubble: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 18,
  },
  incomingMsgText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: Fonts.body,
  },
  outgoingMsgText: {
    fontSize: 15,
    lineHeight: 20,
    color: "#FFFFFF",
    fontFamily: Fonts.body,
  },
  msgImage: {
    width: 200,
    height: 200,
    borderRadius: 14,
  },
  incomingMsgTime: {
    fontSize: 9,
    marginTop: 3,
    alignSelf: "flex-end",
    fontFamily: Fonts.body,
  },
  outgoingMsgTime: {
    fontSize: 9,
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 3,
    alignSelf: "flex-end",
    fontFamily: Fonts.body,
  },
  inputBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderTopWidth: 1.5,
  },
  attachmentButton: {
    padding: 8,
  },
  giftButton: {
    padding: 8,
    marginRight: 4,
  },
  inputContainer: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginRight: Spacing.two,
    minHeight: 38,
    maxHeight: 100,
    justifyContent: "center",
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? 8 : 4,
    fontSize: 15,
    fontFamily: Fonts.body,
    maxHeight: 80,
  },
  sendButton: {
    padding: 8,
  },
});
