import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  TextInput,
} from "react-native";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { ActionModal } from "@/components/ActionModal";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import Swipeable from "react-native-gesture-handler/Swipeable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Fonts, Spacing, BottomTabInset } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useUnreadMessages } from "../../contexts/UnreadMessagesContext";
import { supabase } from "../../lib/supabase";

interface Participant {
  id: string;
  username: string;
  avatar_url: string | null;
  is_online: boolean;
}

interface Conversation {
  id: string;
  participant: Participant;
  lastMessage: {
    content: string | null;
    media_url: string | null;
    created_at: string | null;
    sender_id: string | null;
  } | null;
}

export default function ChatListScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];
  const { unreadByConversation, markConversationRead } = useUnreadMessages();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Realtime'da hızlı arama için bilinen konuşma id'lerini tut.
  const knownConvIdsRef = useRef<Set<string>>(new Set());
  // Bilinmeyen konuşma için tam yeniden çekmeyi debounce etmek üzere.
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep references to Swipeable instances to close them when needed
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const handleDeleteConversation = (conversationId: string) => {
    ActionModal.show({
      title: "Sohbeti Sil",
      message: "Bu sohbeti silmek istediğinize emin misiniz? Sohbet geçmişiniz tamamen silinecektir.",
      type: "warning",
      buttons: [
        {
          text: "Vazgeç",
          style: "cancel",
          onPress: () => {
            const ref = swipeableRefs.current.get(conversationId);
            if (ref) ref.close();
          },
        },
        {
          text: "Sil",
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            try {
              const { error } = await supabase
                .from("conversation_participants")
                .delete()
                .eq("conversation_id", conversationId)
                .eq("user_id", user.id);

              if (error) throw error;

              setConversations((prev) => prev.filter((c) => c.id !== conversationId));
              knownConvIdsRef.current.delete(conversationId);
            } catch (err) {
              console.error("Error deleting conversation:", err);
              ActionModal.show({
                title: "Hata",
                message: "Sohbet silinirken bir hata oluştu.",
                type: "error",
              });
              const ref = swipeableRefs.current.get(conversationId);
              if (ref) ref.close();
            }
          },
        },
      ],
    });
  };

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const username = conv.participant?.username?.toLowerCase() || "";
    const content = conv.lastMessage?.content?.toLowerCase() || "";
    return username.includes(query) || content.includes(query);
  });

  // Fetch active conversations
  const fetchConversations = useCallback(
    async (isRefresh = false) => {
      if (!user) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        // 1. Get all conversation IDs I am participating in
        const { data: myParticipants, error: partError } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", user.id);

        if (partError) throw partError;

        if (!myParticipants || myParticipants.length === 0) {
          setConversations([]);
          return;
        }

        const conversationIds = myParticipants.map(
          (p: any) => p.conversation_id,
        );
        knownConvIdsRef.current = new Set(conversationIds);

        // Fetch blocks bidirectionally
        const { data: blocksData } = await supabase
          .from("blocks")
          .select("blocker_id, blocked_id");
        
        const blockedUserIds = new Set<string>();
        if (blocksData) {
          blocksData.forEach((b: any) => {
            if (b.blocker_id === user.id) blockedUserIds.add(b.blocked_id);
            if (b.blocked_id === user.id) blockedUserIds.add(b.blocker_id);
          });
        }

        // 2. Get all participants of these conversations (excluding me).
        // Sadece ihtiyaç duyulan profil kolonları (profiles(*) yerine).
        const { data: allParticipants, error: allPartError } = await supabase
          .from("conversation_participants")
          .select(
            "conversation_id, user_id, profiles(id, username, avatar_url, is_online)",
          )
          .in("conversation_id", conversationIds)
          .neq("user_id", user.id);

        if (allPartError) throw allPartError;

        // 3. Her konuşmanın son mesajını TEK SEFERDE paralel çek (N+1 yerine).
        // Her sorgu idx_messages_active indeksiyle tek satır lookup'ı olur.
        const lastMsgResults = await Promise.all(
          (allParticipants || []).map((part: any) =>
            supabase
              .from("messages")
              .select("content, media_url, created_at, sender_id")
              .eq("conversation_id", part.conversation_id)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .then(({ data }) => ({
                conversationId: part.conversation_id,
                lastMsg: data && data.length > 0 ? data[0] : null,
              })),
          ),
        );
        const lastMsgByConv = new Map(
          lastMsgResults.map((r) => [r.conversationId, r.lastMsg]),
        );

        const conversationMap = new Map<string, Conversation>();
        for (const part of allParticipants || []) {
          const profile = part.profiles as any;
          if (!profile) continue; // Skip if profile is missing
          if (blockedUserIds.has(profile.id)) continue; // Skip blocked users!

          const lastMsg = lastMsgByConv.get(part.conversation_id) || null;
          const participantId = profile.id;

          const newConv: Conversation = {
            id: part.conversation_id,
            participant: {
              id: profile.id,
              username: profile.username,
              avatar_url: profile.avatar_url,
              is_online: profile.is_online,
            },
            lastMessage: lastMsg
              ? {
                  content: lastMsg.content,
                  media_url: lastMsg.media_url,
                  created_at: lastMsg.created_at,
                  sender_id: lastMsg.sender_id,
                }
              : null,
          };

          const existing = conversationMap.get(participantId);
          if (!existing) {
            conversationMap.set(participantId, newConv);
          } else {
            const existingTime = existing.lastMessage?.created_at
              ? new Date(existing.lastMessage.created_at).getTime()
              : 0;
            const newTime = newConv.lastMessage?.created_at
              ? new Date(newConv.lastMessage.created_at).getTime()
              : 0;

            if (newTime > existingTime) {
              conversationMap.set(participantId, newConv);
            }
          }
        }

        const conversationList = Array.from(conversationMap.values());

        // Sort conversations by last message timestamp (or creation if no messages)
        conversationList.sort((a, b) => {
          const timeA = a.lastMessage?.created_at
            ? new Date(a.lastMessage.created_at).getTime()
            : 0;
          const timeB = b.lastMessage?.created_at
            ? new Date(b.lastMessage.created_at).getTime()
            : 0;
          return timeB - timeA;
        });

        setConversations(conversationList);
      } catch (err) {
        console.error("Error fetching conversations:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        fetchConversations();
      }, 0);

      // Bilinmeyen konuşmalar için tam yeniden çekmeyi debounce eden yardımcı.
      const scheduleRefetch = () => {
        if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = setTimeout(() => {
          fetchConversations(false);
        }, 600);
      };

      // Subscribe to real-time messages to update the list dynamically.
      // Her mesajda tüm listeyi (N+1 ile) yeniden çekmek yerine, mesaj
      // bilinen bir konuşmaya aitse o satırı yerinde güncelle + yeniden sırala.
      const channelId = `public:messages_list_updates:${Math.random().toString(36).substring(7)}`;
      const channel = supabase
        .channel(channelId)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const msg = payload.new as any;
            if (!msg?.conversation_id) return;

            // Bu konuşma listemde yoksa (yeni eşleşme vb.) debounce'lu tam çek.
            if (!knownConvIdsRef.current.has(msg.conversation_id)) {
              scheduleRefetch();
              return;
            }

            // Bilinen konuşma: sadece son mesajı güncelle ve listeyi yeniden sırala.
            setConversations((prev) => {
              let found = false;
              const updated = prev.map((conv) => {
                if (conv.id !== msg.conversation_id) return conv;
                found = true;
                return {
                  ...conv,
                  lastMessage: {
                    content: msg.content ?? null,
                    media_url: msg.media_url ?? null,
                    created_at: msg.created_at ?? null,
                    sender_id: msg.sender_id ?? null,
                  },
                };
              });
              if (!found) return prev;
              updated.sort((a, b) => {
                const timeA = a.lastMessage?.created_at
                  ? new Date(a.lastMessage.created_at).getTime()
                  : 0;
                const timeB = b.lastMessage?.created_at
                  ? new Date(b.lastMessage.created_at).getTime()
                  : 0;
                return timeB - timeA;
              });
              return updated;
            });
          },
        )
        .subscribe();

      return () => {
        clearTimeout(timer);
        if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
        supabase.removeChannel(channel);
      };
    }
  }, [user, fetchConversations]);

  const handleRefresh = () => {
    fetchConversations(true);
  };

  const renderConversationItem = ({ item }: { item: Conversation }) => {
    const isMeLastSender = item.lastMessage?.sender_id === user?.id;
    const unreadCount = unreadByConversation[item.id] || 0;
    let previewText: ReactNode = "Henüz mesaj yok";

    if (item.lastMessage) {
      if (item.lastMessage.media_url) {
        previewText = isMeLastSender ? (
          <Text>
            Siz: <Ionicons name="camera-outline" size={12} color={unreadCount > 0 ? colors.text : colors.textSecondary} /> Fotoğraf
          </Text>
        ) : (
          <Text>
            <Ionicons name="camera-outline" size={12} color={unreadCount > 0 ? colors.text : colors.textSecondary} /> Fotoğraf
          </Text>
        );
      } else if (item.lastMessage.content) {
        let content = item.lastMessage.content;
        if (content.startsWith("🎁 Hediye:")) {
          content = content.replace("🎁 ", "");
          previewText = isMeLastSender ? (
            <Text>
              Siz: <Ionicons name="gift-outline" size={12} color="#BCADDC" /> {content}
            </Text>
          ) : (
            <Text>
              <Ionicons name="gift-outline" size={12} color="#BCADDC" /> {content}
            </Text>
          );
        } else {
          previewText = isMeLastSender
            ? `Siz: ${content}`
            : content;
        }
      }
    }

    const renderRightActions = () => {
      return (
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => handleDeleteConversation(item.id)}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
          <Text style={styles.deleteActionText}>Sil</Text>
        </TouchableOpacity>
      );
    };

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) {
            swipeableRefs.current.set(item.id, ref);
          } else {
            swipeableRefs.current.delete(item.id);
          }
        }}
        renderRightActions={renderRightActions}
        friction={2}
        rightThreshold={40}
      >
        <TouchableOpacity
          style={[
            styles.itemContainer,
            {
              backgroundColor: isDark ? "transparent" : "transparent",
            },
          ]}
          onPress={() => {
            markConversationRead(item.id);
            router.push(
              `/chat-room?id=${item.id}&name=${item.participant.username}`,
            );
          }}
          activeOpacity={0.7}
        >
          <View style={styles.avatarWrapper}>
            <Image
              source={item.participant.avatar_url ? { uri: item.participant.avatar_url } : require("../../../assets/images/place-holder.png")}
              style={styles.avatar}
              contentFit="cover"
            />
            {item.participant.is_online && (
              <View
                style={[
                  styles.onlineIndicator,
                  { backgroundColor: colors.online, borderColor: colors.background },
                ]}
              />
            )}
          </View>

          <View style={styles.detailsContainer}>
            <View style={styles.headerRow}>
              <Text style={[styles.username, { color: colors.text, fontWeight: unreadCount > 0 ? "700" : "500" }]}>
                {item.participant.username}
              </Text>
              {item.lastMessage?.created_at && (
                <Text style={[styles.timeText, { color: unreadCount > 0 ? colors.primary : colors.textSecondary, fontWeight: unreadCount > 0 ? "600" : "400" }]}>
                  {new Date(item.lastMessage.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </Text>
              )}
            </View>
            <View style={styles.previewRow}>
              <Text
                style={[
                  styles.previewText,
                  {
                    color: unreadCount > 0 ? colors.text : colors.textSecondary,
                    fontWeight: unreadCount > 0 ? "600" : "400",
                    flex: 1,
                  },
                ]}
                numberOfLines={1}
              >
                {previewText}
              </Text>
              {unreadCount > 0 && (
                <View style={styles.unreadBadge} />
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const isDark = scheme === "dark";
  const onlineConversations = conversations.filter(c => c.participant?.is_online);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* Custom Messenger Title Header */}
      <View style={styles.customHeader}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => router.push("/profile" as any)}>
            <Image
              source={profile?.avatar_url ? { uri: profile.avatar_url } : require("../../../assets/images/place-holder.png")}
              style={styles.headerUserAvatar}
              contentFit="cover"
            />
          </TouchableOpacity>
          <Text style={[styles.headerTextTitle, { color: colors.text }]}>Sohbetler</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBarContainer}>
          <View style={[styles.searchBarInputRow, { backgroundColor: isDark ? "#23304A" : "#EFE7E0" }]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchTextInput, { color: colors.text }]}
              placeholder="Sohbetlerde ara..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator
          style={styles.loader}
          color={colors.primary}
          size="large"
        />
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          contentContainerStyle={styles.list}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            onlineConversations.length > 0 ? (
              <View style={styles.activeNowContainer}>
                <Text style={[styles.activeNowTitle, { color: colors.textSecondary }]}>Aktif (Online)</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.activeNowScroll}
                >
                  {onlineConversations.map((conv) => (
                    <TouchableOpacity
                      key={conv.id}
                      style={styles.activeNowItem}
                      onPress={() => {
                        markConversationRead(conv.id);
                        router.push(`/chat-room?id=${conv.id}&name=${conv.participant.username}`);
                      }}
                    >
                      <View style={styles.activeAvatarWrapper}>
                        <Image
                          source={conv.participant.avatar_url ? { uri: conv.participant.avatar_url } : require("../../../assets/images/place-holder.png")}
                          style={styles.activeAvatar}
                          contentFit="cover"
                        />
                        <View style={[styles.activeOnlineDot, { backgroundColor: colors.online, borderColor: colors.background }]} />
                      </View>
                      <Text style={[styles.activeNameText, { color: colors.text }]} numberOfLines={1}>
                        {conv.participant.username.split(" ")[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            conversations.length > 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Aramanıza uygun sohbet bulunamadı.
                </Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Henüz bir sohbetiniz bulunmuyor. Keşfet sayfasından yeni
                  kişilerle sohbete başlayın!
                </Text>
              </View>
            )
          }
        />
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
    marginBottom: Spacing.three,
  },
  headerUserAvatar: {
    width: 40,
    height: 48,
    borderRadius: 14,
  },
  headerTextTitle: {
    fontSize: 28,
    fontFamily: Fonts.headingBlack,
    fontWeight: "bold",
    flex: 1,
    marginLeft: Spacing.two,
  },
  searchBarContainer: {
    width: "100%",
  },
  searchBarInputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
  },
  searchTextInput: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    fontFamily: Fonts.body,
    paddingVertical: 0,
  },
  activeNowContainer: {
    marginVertical: Spacing.two,
    paddingBottom: Spacing.two,
  },
  activeNowTitle: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: Fonts.bodyMedium,
    marginBottom: Spacing.two,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  activeNowScroll: {
    paddingRight: Spacing.four,
    gap: 16,
  },
  activeNowItem: {
    alignItems: "center",
    width: 60,
  },
  activeAvatarWrapper: {
    position: "relative",
  },
  activeAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  activeOnlineDot: {
    position: "absolute",
    bottom: 0,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
  },
  activeNameText: {
    fontSize: 11,
    marginTop: 6,
    fontFamily: Fonts.body,
    textAlign: "center",
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset,
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 0,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
  },
  detailsContainer: {
    flex: 1,
    marginLeft: Spacing.three,
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    fontFamily: Fonts.bodyMedium,
  },
  timeText: {
    fontSize: 12,
    fontFamily: Fonts.body,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewText: {
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    padding: Spacing.six,
    alignItems: "center",
    marginTop: Spacing.six,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
  },
  deleteAction: {
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: Spacing.three,
    marginVertical: Spacing.one,
    marginLeft: Spacing.two,
  },
  deleteActionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 4,
    fontFamily: Fonts.bodyMedium,
  },
  unreadBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#AA423C",
    marginLeft: 8,
  },
});
