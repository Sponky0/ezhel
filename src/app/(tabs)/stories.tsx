/* eslint-disable react-hooks/immutability */
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import AnimatedReanimated, {
  useSharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionModal } from "@/components/ActionModal";

import { AppIcons } from "@/constants/icons";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { findOrCreateConversation } from "@/lib/conversations";
import { getAssetExtension } from "@/lib/media";
import { uploadFile } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

const AnimatedImage = AnimatedReanimated.createAnimatedComponent(Image);

const isVideoUrl = (url: string | null) => {
  if (!url) return false;
  const extension = url.split(".").pop()?.split("?")[0]?.toLowerCase();
  return ["mp4", "m4v", "mov", "avi", "mpg", "mpeg", "webm", "3gp", "mkv"].includes(extension || "");
};

const StoryVideo = ({ videoUrl, isActive, style }: { videoUrl: string; isActive: boolean; style: any }) => {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = false;
    if (isActive) {
      p.play();
    }
  });

  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  return (
    <VideoView
      style={style}
      player={player}
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={false}
      nativeControls={false}
      contentFit="contain"
    />
  );
};

// Stories auto-advance after this duration (Instagram-style, max 7s).
const STORY_DURATION_MS = 7000;

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  music_url: string | null;
  music_title: string | null;
  is_highlight: boolean;
  created_at: string;
  media_transform?: {
    scale: number;
    translateX: number;
    translateY: number;
  } | null;
  profiles: {
    username: string;
    avatar_url: string | null;
    is_vip: boolean;
  };
}

interface GroupedStory {
  user_id: string;
  username: string;
  avatar_url: string | null;
  is_vip: boolean;
  stories: Story[];
}


const VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 50,
};

const FloatingReaction = ({ content, left, onComplete }: { content: string; left: number; onComplete: () => void }) => {
  const [animY] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(1));
  const [scale] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(animY, {
        toValue: -220,
        duration: 1200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 1200,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1.5,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onComplete();
    });
  }, [animY, opacity, scale, onComplete]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: left,
        bottom: 100,
        transform: [{ translateY: animY }, { scale: scale }],
        opacity: opacity,
        zIndex: 9999,
      }}
      pointerEvents="none"
    >
      {content === "heart" ? (
        <Ionicons name="heart" size={36} color="#FF4D67" />
      ) : (
        <Text style={{ fontSize: 30 }}>{content}</Text>
      )}
    </Animated.View>
  );
};

export default function StoriesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const ASPECT_RATIO = 9 / 16;

  const TAB_BAR_HEIGHT = 64;
  const bottomOffset = insets.bottom > 0 ? insets.bottom + 8 : 16;
  const totalTabBarHeight = TAB_BAR_HEIGHT + bottomOffset;
  const HEADER_HEIGHT = 60 + insets.top;

  // New layout states
  const [activeIndex, setActiveIndex] = useState(0);
  const [storiesFinished, setStoriesFinished] = useState(false);
  const [containerHeight, setContainerHeight] = useState(screenHeight - totalTabBarHeight - HEADER_HEIGHT);
  const [showSearch, setShowSearch] = useState(false);
  const [isFocused, setIsFocused] = useState(true);

  // Like & reaction animations states
  const [floatingHearts, setFloatingHearts] = useState<{ id: number; left: number; content: string }[]>([]);
  const nextHeartId = useRef(0);
  const [likeScaleAnim] = useState(() => new Animated.Value(1));

  // Enforce 1080x1920 layout aspect ratio (9:16)
  let storyWidth = screenWidth;
  let storyHeight = screenWidth / ASPECT_RATIO;

  if (storyHeight > containerHeight) {
    storyHeight = containerHeight;
    storyWidth = containerHeight * ASPECT_RATIO;
  }

  const [stories, setStories] = useState<Story[]>([]);
  const [groupedStories, setGroupedStories] = useState<GroupedStory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Compose (create story) state
  const [composeImageUri, setComposeImageUri] = useState<string | null>(null);
  const [composeImageExt, setComposeImageExt] = useState<string>("jpg");
  const [sharing, setSharing] = useState(false);

  // Shared values for pinch & pan gestures in the composer
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Reset shared values when a new image is loaded
  useEffect(() => {
    if (composeImageUri) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      savedTranslateX.value = 0;
      translateY.value = 0;
      savedTranslateY.value = 0;
    }
  }, [
    composeImageUri,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
  ]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const gesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  // Viewer state
  const [replyText, setReplyText] = useState("");
  const [replyFocused, setReplyFocused] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // Auto-advance progress (0 -> 1 over STORY_DURATION_MS).
  const [progressAnim] = useState(() => new Animated.Value(0));

  // Likes
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [likedByMe, setLikedByMe] = useState<Set<string>>(new Set());


  const flatListRef = useRef<FlatList<Story>>(null);

  const filteredGroupedStories = groupedStories.filter((group) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const username = group.username.toLowerCase();
    return username.includes(query);
  });

  // Flatten the grouped stories to render in a single vertical FlatList
  const flatStories = filteredGroupedStories.reduce<Story[]>((acc, group) => {
    return [...acc, ...group.stories];
  }, []);

  const currentStory = storiesFinished ? null : flatStories[activeIndex] || null;

  // Track screen focus
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
      };
    }, [])
  );

  const fetchStories = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const { data, error } = await supabase
          .from("stories")
          .select(
            `
          id,
          user_id,
          media_url,
          is_highlight,
          created_at,
          media_transform,
          profiles:user_id (
            username,
            avatar_url,
            is_vip
          )
        `
          )
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false });

        if (error) throw error;
        const list = (data || []) as any as Story[];
        setStories(list);

        const groupMap = new Map<string, GroupedStory>();
        for (const story of list) {
          const userId = story.user_id;
          if (!groupMap.has(userId)) {
            groupMap.set(userId, {
              user_id: userId,
              username: story.profiles?.username || "Anonim",
              avatar_url: story.profiles?.avatar_url || null,
              is_vip: !!story.profiles?.is_vip,
              stories: [],
            });
          }
          groupMap.get(userId)!.stories.unshift(story);
        }
        setGroupedStories(Array.from(groupMap.values()));

        // Load like counts + which ones the current user liked
        const storyIds = list.map((s) => s.id);
        if (storyIds.length > 0) {
          const { data: likesData, error: likesError } = await supabase
            .from("story_likes")
            .select("story_id, user_id")
            .in("story_id", storyIds);

          if (likesError) throw likesError;

          const counts: Record<string, number> = {};
          const mine = new Set<string>();
          (likesData || []).forEach((l: any) => {
            counts[l.story_id] = (counts[l.story_id] || 0) + 1;
            if (l.user_id === user?.id) mine.add(l.story_id);
          });
          setLikeCounts(counts);
          setLikedByMe(mine);
        } else {
          setLikeCounts({});
          setLikedByMe(new Set());
        }
      } catch (err: any) {
        console.error("Error fetching stories:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStories(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchStories]);

  // Realtime like updates
  useEffect(() => {
    const channelId = `story_likes:${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_likes" },
        (payload) => {
          const row: any = payload.new || payload.old;
          const storyId: string | undefined = row?.story_id;
          if (!storyId) return;

          if (payload.eventType === "INSERT") {
            if ((payload.new as any).user_id === user?.id) return;
            setLikeCounts((prev) => ({
              ...prev,
              [storyId]: (prev[storyId] || 0) + 1,
            }));
          } else if (payload.eventType === "DELETE") {
            if ((payload.old as any).user_id === user?.id) return;
            setLikeCounts((prev) => ({
              ...prev,
              [storyId]: Math.max(0, (prev[storyId] || 0) - 1),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Auto-advance progress (0 -> 1 over STORY_DURATION_MS).
  useEffect(() => {
    if (
      storiesFinished ||
      flatStories.length === 0 ||
      activeIndex < 0 ||
      activeIndex >= flatStories.length
    ) {
      return;
    }
    if (!isFocused) return;

    progressAnim.setValue(0);
    if (replyFocused || sendingReply) return;

    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    anim.start(({ finished }) => {
      if (!finished) return;
      setReplyText("");

      const nextIndex = activeIndex + 1;
      if (nextIndex < flatStories.length) {
        flatListRef.current?.scrollToIndex({
          index: nextIndex,
          animated: true,
        });
        setActiveIndex(nextIndex);
      } else {
        progressAnim.setValue(1);
        setStoriesFinished(true);
      }
    });

    return () => anim.stop();
  }, [
    flatStories.length,
    activeIndex,
    replyFocused,
    sendingReply,
    progressAnim,
    isFocused,
    storiesFinished,
  ]);

  // Reset active index and scroll to top when stories list or search query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setStoriesFinished(false);
      setActiveIndex(0);
      if (flatStories.length > 0) {
        try {
          flatListRef.current?.scrollToIndex({ index: 0, animated: false });
        } catch {
          // no-op
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [searchQuery, flatStories.length]);

  const handleRefresh = () => {
    setStoriesFinished(false);
    setRefreshing(true);
    fetchStories(true);
  };

  const toggleLike = async (storyId: string) => {
    if (!user) return;
    const liked = likedByMe.has(storyId);

    // Optimistic update
    setLikedByMe((prev) => {
      const next = new Set(prev);
      if (liked) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
    setLikeCounts((prev) => ({
      ...prev,
      [storyId]: Math.max(0, (prev[storyId] || 0) + (liked ? -1 : 1)),
    }));

    if (!liked) {
      // Trigger bounce animation
      Animated.sequence([
        Animated.timing(likeScaleAnim, {
          toValue: 1.35,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(likeScaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

      // Spawn floating heart
      const id = nextHeartId.current++;
      const left = screenWidth - 70 + (Math.random() * 20 - 10);
      setFloatingHearts((prev) => [...prev, { id, left, content: "heart" }]);
    }

    try {
      if (liked) {
        const { error } = await supabase
          .from("story_likes")
          .delete()
          .eq("story_id", storyId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("story_likes")
          .insert({ story_id: storyId, user_id: user.id });
        if (error) throw error;
      }
    } catch (err) {
      console.error("Toggle like error:", err);
      // Revert on failure
      setLikedByMe((prev) => {
        const next = new Set(prev);
        if (liked) next.add(storyId);
        else next.delete(storyId);
        return next;
      });
      setLikeCounts((prev) => ({
        ...prev,
        [storyId]: Math.max(0, (prev[storyId] || 0) + (liked ? 1 : -1)),
      }));
    }
  };

  const handleSendReply = async (textParam?: string) => {
    if (!user || !currentStory) return;
    const text = typeof textParam === "string" ? textParam.trim() : replyText.trim();
    if (!text) return;

    setSendingReply(true);
    try {
      const { conversationId } = await findOrCreateConversation(
        user.id,
        currentStory.user_id
      );

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: `🎬 Güncellemene cevap: ${text}`,
      });

      if (error) throw error;

      if (typeof textParam !== "string") {
        setReplyText("");
      }
      ActionModal.show({
        title: "Gönderildi",
        message: "Cevabınız mesaj olarak iletildi.",
        type: "success",
      });
    } catch (err) {
      console.error("Send reply error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Cevap gönderilemedi.",
        type: "error",
      });
    } finally {
      setSendingReply(false);
    }
  };

  const pickMedia = async (mediaType: "photo" | "video") => {
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
        mediaTypes: mediaType === "photo" ? ["images"] : ["videos"],
        allowsEditing: mediaType === "photo",
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setComposeImageUri(asset.uri);
        setComposeImageExt(getAssetExtension(asset));
      }
    } catch (err) {
      console.error("Pick media error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Medya seçilirken bir hata oluştu.",
        type: "error",
      });
    }
  };

  const handleAddPress = () => {
    ActionModal.show({
      title: "Güncelleme Ekle",
      message: "Ne paylaşmak istersin?",
      buttons: [
        { text: "Fotoğraf", onPress: () => pickMedia("photo") },
        { text: "Video", onPress: () => pickMedia("video") },
        { text: "Vazgeç", style: "cancel" },
      ],
    });
  };

  const closeCompose = () => {
    setComposeImageUri(null);
    setComposeImageExt("jpg");
  };

  const handleShareStory = async () => {
    if (!composeImageUri || !user) return;
    setSharing(true);
    setUploading(true);
    try {
      const fileName = `story_${user.id}_${Date.now()}.${composeImageExt}`;
      const publicUrl = await uploadFile("stories", fileName, composeImageUri);

      const { error } = await supabase.from("stories").insert({
        user_id: user.id,
        media_url: publicUrl,
        media_transform: {
          scale: scale.value,
          translateX: translateX.value,
          translateY: translateY.value,
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      if (error) throw error;

      closeCompose();
      ActionModal.show({
        title: (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#FFF" }}>Başarılı</Text>
            <Ionicons name="sparkles" size={18} color="#FBBF24" />
          </View>
        ),
        message: "Güncellemeniz paylaşıldı!",
        type: "success",
      });
      fetchStories(true);
    } catch (err) {
      console.error("Share story error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Güncelleme paylaşılırken bir hata oluştu.",
        type: "error",
      });
    } finally {
      setSharing(false);
      setUploading(false);
    }
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const index = viewableItems[0].index;
      if (index !== null && index !== undefined) {
        setStoriesFinished(false);
        setActiveIndex(index);
      }
    }
  }, []);

  const handleContainerLayout = (e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    const targetHeight = height - totalTabBarHeight - HEADER_HEIGHT;
    if (targetHeight > 0 && Math.abs(containerHeight - targetHeight) > 1) {
      setContainerHeight(targetHeight);
    }
  };

  const renderStoryItem = ({ item, index }: { item: Story; index: number }) => {
    const isActive = index === activeIndex;
    const isOwner = item.user_id === user?.id;
    const liked = likedByMe.has(item.id);
    const likeCount = likeCounts[item.id] || 0;

    const group = filteredGroupedStories.find((g) => g.user_id === item.user_id);
    const groupStories = group ? group.stories : [];
    const storyIndexInGroup = groupStories.findIndex((s) => s.id === item.id);

    // Apply the saved image transform if it exists
    const transform = item.media_transform as { scale: number; translateX: number; translateY: number } | null;
    const transformStyle = transform ? {
      transform: [
        { translateX: transform.translateX },
        { translateY: transform.translateY },
        { scale: transform.scale },
      ]
    } : {};

    return (
      <View style={{ width: screenWidth, height: containerHeight, justifyContent: "center", alignItems: "center", backgroundColor: "#000" }}>
        <View style={{ width: storyWidth, height: storyHeight, overflow: "hidden", borderRadius: 12, backgroundColor: "#111", position: "relative" }}>
          {isVideoUrl(item.media_url) ? (
            <AnimatedReanimated.View style={[StyleSheet.absoluteFill, transformStyle]}>
              <StoryVideo
                key={item.media_url}
                videoUrl={item.media_url}
                isActive={isActive}
                style={StyleSheet.absoluteFill}
              />
            </AnimatedReanimated.View>
          ) : (
            <Image
              source={{ uri: item.media_url }}
              style={[StyleSheet.absoluteFill, transformStyle]}
              contentFit="contain"
            />
          )}

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={StyleSheet.absoluteFill}
            pointerEvents="box-none"
          >
            <View style={[styles.bottomOverlay, { bottom: 12 }]} pointerEvents="box-none">
              {/* Top row with user info and like button */}
              <View style={styles.storyBottomTopRow} pointerEvents="box-none">
                <View style={styles.bottomLeftContent} pointerEvents="box-none">
                  <TouchableOpacity
                    style={styles.userInfoRow}
                    onPress={() => {
                      if (isOwner) {
                        router.push("/profile");
                      } else {
                        router.push(`/user-profile?id=${item.user_id}`);
                      }
                    }}
                  >
                    <Image
                      source={
                        item.profiles.avatar_url
                          ? { uri: item.profiles.avatar_url }
                          : require("../../../assets/images/place-holder.png")
                      }
                      style={styles.storyAvatar}
                    />
                    <Text style={styles.storyUsername} numberOfLines={1}>
                      {item.profiles.username}
                    </Text>
                    {item.profiles.is_vip && (
                      <View style={[styles.storyVipBadge, { backgroundColor: colors.vip }]}>
                        <Ionicons name="diamond" size={10} color="#FFFFFF" />
                        <Text style={styles.storyVipText}>VIP</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {item.music_url && (
                    <View style={styles.storyMusicRow}>
                      <Ionicons name="musical-notes" size={12} color="#FFFFFF" />
                      <Text style={styles.storyMusicTitle} numberOfLines={1}>
                        {item.music_title || "Müzik"}
                      </Text>
                    </View>
                  )}

                  {!isOwner && (
                    <View style={styles.quickReactionsRow} pointerEvents="box-none">
                      {["❤️", "😂", "😮", "😢", "👏", "🔥"].map((emoji) => (
                        <TouchableOpacity
                          key={emoji}
                          style={styles.quickReactionButton}
                          onPress={() => {
                            const id = nextHeartId.current++;
                            const left = (screenWidth * 0.35) + (Math.random() * 80 - 40);
                            setFloatingHearts((prev) => [...prev, { id, left, content: emoji }]);
                            handleSendReply(emoji);
                          }}
                        >
                          <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                <View style={styles.bottomRightContent}>
                  <TouchableOpacity
                    style={styles.storyLikeButton}
                    onPress={() => toggleLike(item.id)}
                  >
                    <Animated.View style={[styles.likeIconContainer, {
                      backgroundColor: liked ? "rgba(255,77,103,0.25)" : "rgba(0,0,0,0.5)",
                      transform: [{ scale: isActive ? likeScaleAnim : 1 }]
                    }]}>
                      <Ionicons
                        name={liked ? "heart" : "heart-outline"}
                        size={28}
                        color={liked ? "#FF4D67" : "#FFFFFF"}
                      />
                    </Animated.View>
                    <Text style={styles.storyLikeCount}>
                      {likeCount}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Bottom row with message reply input or own story text */}
              {isOwner ? (
                <Text style={styles.storyOwnHint}>Bu senin güncellemen</Text>
              ) : (
                <View style={styles.storyReplyRow}>
                  <TextInput
                    style={styles.storyReplyInput}
                    placeholder="Mesaj gönder…"
                    placeholderTextColor="rgba(255,255,255,0.7)"
                    value={isActive ? replyText : ""}
                    onChangeText={setReplyText}
                    onFocus={() => setReplyFocused(true)}
                    onBlur={() => setReplyFocused(false)}
                    editable={isActive && !sendingReply}
                    returnKeyType="send"
                    onSubmitEditing={() => handleSendReply()}
                  />
                  <TouchableOpacity
                    onPress={() => handleSendReply()}
                    disabled={sendingReply || !replyText.trim()}
                    style={[
                      styles.storyReplySendButton,
                      {
                        backgroundColor: replyText.trim()
                          ? colors.primary
                          : "rgba(255,255,255,0.15)",
                      },
                    ]}
                  >
                    {sendingReply ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="send" size={16} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>

          {isActive && (
            <View style={[styles.progressOverlay, { top: 16 }]}>
              <View style={styles.progressSegmentsContainer}>
                {groupStories.map((story, idx) => {
                  let progressStyle = {};
                  if (idx < storyIndexInGroup) {
                    progressStyle = { width: "100%" };
                  } else if (idx === storyIndexInGroup) {
                    progressStyle = {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0%", "100%"],
                      }),
                    };
                  } else {
                    progressStyle = { width: "0%" };
                  }
                  return (
                    <View key={story.id} style={styles.progressSegmentTrack}>
                      <Animated.View style={[styles.progressFill, progressStyle]} />
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderComposeModal = () => {
    const isFullScreenStory = storyHeight === containerHeight;
    const composeHeaderPaddingTop = isFullScreenStory ? insets.top : Spacing.two;
    const composeBottomPaddingBottom = isFullScreenStory ? insets.bottom + Spacing.two : Spacing.four;

    return (
      <Modal visible={true} transparent={false} animationType="slide">
        <View style={styles.modalContainer}>
          {/* 9:16 Aspect Ratio Canvas */}
          <View style={{ width: storyWidth, height: storyHeight, overflow: "hidden", borderRadius: 12, backgroundColor: "#111", position: "relative" }}>
            <GestureDetector gesture={gesture}>
              <AnimatedReanimated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
                {composeImageUri && isVideoUrl(composeImageUri) ? (
                  <StoryVideo
                    key={composeImageUri}
                    videoUrl={composeImageUri}
                    isActive={true}
                    style={StyleSheet.absoluteFill}
                  />
                ) : (
                  <AnimatedImage
                    source={composeImageUri ? { uri: composeImageUri } : undefined}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                  />
                )}
              </AnimatedReanimated.View>
            </GestureDetector>

            {/* Top Bar inside the canvas */}
            <View style={[styles.composeHeaderOverlay, { paddingTop: composeHeaderPaddingTop, paddingBottom: Spacing.two }]}>
              <TouchableOpacity onPress={closeCompose} disabled={sharing} style={styles.composeCloseButton}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.composeHeaderTitle}>Hikayeni Düzenle</Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Bottom Controls Overlay inside the canvas */}
            <View style={[
              styles.composeBottomOverlay,
              {
                paddingTop: Spacing.four,
                paddingHorizontal: Spacing.four,
                paddingBottom: composeBottomPaddingBottom,
              }
            ]}>
              <TouchableOpacity
                style={[
                  styles.shareButton,
                  { backgroundColor: colors.primary, marginTop: 16 },
                ]}
                onPress={handleShareStory}
                disabled={sharing}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.shareButtonText}>Paylaş</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const showFinishedEmptyState = storiesFinished && flatStories.length > 0;

  if (flatStories.length === 0 || showFinishedEmptyState) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
        {showSearch ? (
          <View style={[styles.searchHeader, { paddingTop: insets.top, height: HEADER_HEIGHT }]}>
            <View style={[styles.searchBarContainer, { backgroundColor: colors.backgroundElement }]}>
              <Ionicons name="search" size={18} color={colors.textSecondary} />
              <TextInput
                style={[styles.searchBarInput, { color: colors.text }]}
                placeholder="Ara..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => {
                setShowSearch(false);
                setSearchQuery("");
              }}
              style={styles.searchCancelButton}
            >
              <Text style={[styles.searchCancelText, { color: colors.text }]}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.headerOverlay, { paddingTop: insets.top, height: HEADER_HEIGHT }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Güncellemeler</Text>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[styles.headerIconButton, { backgroundColor: colors.backgroundElement }]}
                onPress={() => setShowSearch(true)}
              >
                <Ionicons name="search-outline" size={24} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerIconButton, { backgroundColor: colors.backgroundElement }]}
                onPress={handleAddPress}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Ionicons name="add-outline" size={26} color={colors.text} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={[styles.emptyContainer, { marginTop: HEADER_HEIGHT }]}>
          {showFinishedEmptyState ? (
            <>
              <Ionicons
                name="time-outline"
                size={64}
                color={colors.textSecondary}
                style={{ marginBottom: Spacing.three }}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                Şu anda daha yeni bir şey yok
              </Text>
              <Text
                style={[styles.emptySubText, { color: colors.textSecondary }]}
              >
                Yeni güncellemeler gelince burada görünecek.
              </Text>
              <TouchableOpacity
                style={[
                  styles.emptyButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.emptyButtonText}>Yenile</Text>
                )}
              </TouchableOpacity>
            </>
          ) : stories.length > 0 ? (
            <>
              <Ionicons
                name="search-outline"
                size={64}
                color={colors.textSecondary}
                style={{ marginBottom: Spacing.three }}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                Sonuç bulunamadı
              </Text>
              <Text
                style={[styles.emptySubText, { color: colors.textSecondary }]}
              >
                Aramanıza uygun bir güncelleme bulunamadı.
              </Text>
            </>
          ) : (
            <>
              <Ionicons
                name={AppIcons.hot}
                size={64}
                color={colors.textSecondary}
                style={{ marginBottom: Spacing.three }}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                Henüz güncelleme yok!
              </Text>
              <Text
                style={[styles.emptySubText, { color: colors.textSecondary }]}
              >
                İlk güncellemeyi sen paylaşarak öne çık!
              </Text>
              <TouchableOpacity
                style={[
                  styles.emptyButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleAddPress}
              >
                <Text style={styles.emptyButtonText}>Güncelleme Ekle</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {composeImageUri && renderComposeModal()}
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      {/* Header Overlay */}
      {showSearch ? (
        <View style={[styles.searchHeader, { paddingTop: insets.top, height: HEADER_HEIGHT }]}>
          <View style={[styles.searchBarContainer, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.7)" />
            <TextInput
              style={styles.searchBarInput}
              placeholder="Ara..."
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => {
              setShowSearch(false);
              setSearchQuery("");
            }}
            style={styles.searchCancelButton}
          >
            <Text style={styles.searchCancelText}>Vazgeç</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.headerOverlay, { paddingTop: insets.top, height: HEADER_HEIGHT }]}>
          <Text style={styles.headerTitle}>Güncellemeler</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => setShowSearch(true)}
            >
              <Ionicons name="search-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={handleAddPress}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="add-outline" size={26} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {containerHeight > 0 && (
        <View style={{ marginTop: HEADER_HEIGHT, height: containerHeight }}>
          <FlatList
            ref={flatListRef}
            data={flatStories}
            renderItem={renderStoryItem}
            keyExtractor={(item) => item.id}
            pagingEnabled={true}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={VIEWABILITY_CONFIG}
            getItemLayout={(data, index) => ({
              length: containerHeight,
              offset: containerHeight * index,
              index,
            })}
            removeClippedSubviews={Platform.OS === "android"}
            windowSize={3}
            maxToRenderPerBatch={2}
            initialNumToRender={1}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#FFFFFF"
                colors={["#FFFFFF"]}
              />
            }
          />
        </View>
      )}

      {composeImageUri && renderComposeModal()}
      {floatingHearts.map((heart) => (
        <FloatingReaction
          key={heart.id}
          content={heart.content}
          left={heart.left}
          onComplete={() => {
            setFloatingHearts((prev) => prev.filter((h) => h.id !== heart.id));
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  // Vignettes
  topVignette: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  bottomVignette: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 240,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  // Overlays
  bottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "column",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  storyBottomTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    width: "100%",
  },
  bottomLeftContent: {
    flex: 1,
    marginRight: Spacing.four,
    gap: Spacing.two,
  },
  bottomRightContent: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  userInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  storyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  storyUsername: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  storyVipBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  storyVipText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  storyMusicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingVertical: 4,
    paddingHorizontal: Spacing.two,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignSelf: "flex-start",
    maxWidth: "85%",
  },
  storyMusicTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    flexShrink: 1,
  },
  storyMuteButton: {
    marginLeft: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  storyOwnHint: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    fontFamily: Fonts.body,
    fontStyle: "italic",
    marginTop: 4,
  },
  storyReplyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: 4,
  },
  storyReplyInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    color: "#FFFFFF",
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    fontFamily: Fonts.body,
    fontSize: 14,
  },
  storyReplySendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  storyLikeButton: {
    alignItems: "center",
    gap: 4,
  },
  likeIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  storyLikeCount: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: Fonts.bodyMedium,
  },
  // Progress
  progressOverlay: {
    position: "absolute",
    left: Spacing.three,
    right: Spacing.three,
    zIndex: 10,
  },
  progressSegmentsContainer: {
    flexDirection: "row",
    gap: 4,
    height: 3,
  },
  progressSegmentTrack: {
    flex: 1,
    height: "100%",
    borderRadius: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#FFFFFF",
  },
  // Header Overlay
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    zIndex: 10,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
    fontFamily: Fonts.heading,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  searchHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    zIndex: 10,
    gap: Spacing.two,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  searchBarInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Fonts.body,
    padding: 0,
  },
  searchCancelButton: {
    paddingHorizontal: Spacing.two,
  },
  searchCancelText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Fonts.bodyMedium,
  },
  // Empty states
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.six * 2,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: Spacing.one,
    fontFamily: Fonts.heading,
  },
  emptySubText: {
    fontSize: 14,
    marginBottom: Spacing.four,
    textAlign: "center",
    fontFamily: Fonts.body,
  },
  emptyButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 20,
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 14,
    fontFamily: Fonts.bodyMedium,
  },
  // Modal (Compose)
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseText: {
    fontSize: 20,
  },
  composeContent: {
    width: "92%",
    borderRadius: 20,
    padding: Spacing.three,
  },
  composeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.three,
  },
  composeTitle: {
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: Fonts.heading,
  },
  composePreview: {
    width: "100%",
    height: 260,
    borderRadius: 14,
    marginBottom: Spacing.three,
  },
  composeLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: Spacing.two,
    fontFamily: Fonts.bodyMedium,
  },
  musicListContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  musicChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: 16,
    maxWidth: 160,
  },
  musicChipText: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
  },
  customMusicButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
    marginBottom: Spacing.three,
  },
  customMusicText: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.bodyMedium,
  },
  shareButton: {
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  shareButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 16,
    fontFamily: Fonts.bodyMedium,
  },
  composeHeaderOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 10,
  },
  composeCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  composeHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: Fonts.heading,
  },
  composeBottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 10,
  },
  composeOverlayLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.two,
    fontFamily: Fonts.bodyMedium,
  },
  customMusicButtonOverlay: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },
  quickReactionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: Spacing.one,
    marginBottom: Spacing.one,
  },
  quickReactionButton: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  quickReactionEmoji: {
    fontSize: 18,
  },
});
