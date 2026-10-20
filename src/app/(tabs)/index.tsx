import { ActionModal } from "@/components/ActionModal";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import OnboardingModal from "../../components/OnboardingModal";
import { AppIcons } from "../../constants/icons";
import { BottomTabInset, Colors, Fonts, Spacing } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { findOrCreateConversation } from "../../lib/conversations";
import { supabase } from "../../lib/supabase";

interface UserProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  is_vip: boolean;
  is_online: boolean;
  last_active_at: string;
  bio: string | null;
  role?: "user" | "admin";
  is_highlighted?: boolean;
  highlighted_until?: string | null;
}

export default function HomeScreen() {
  const { user, profile, loading: authLoading, showLoginModal } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  const [users, setUsers] = useState<UserProfile[]>([]);
  const lastSeenIdsRef = useRef<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [feedLoading, setFeedLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  // Debounce'lu arama: her tuş vuruşunda değil, yazma durunca feed yenilenir.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterOnlineOnly, setFilterOnlineOnly] = useState(false);
  const [filterVipsOnly, setFilterVipsOnly] = useState(false);

  const [selectedGender, setSelectedGender] = useState<
    "male" | "female" | null
  >(null);
  const [onlineCount, setOnlineCount] = useState(0); // Static or dynamic online count
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    const loadViewMode = async () => {
      try {
        const savedMode = await AsyncStorage.getItem("explore_view_mode");
        if (savedMode === "grid" || savedMode === "list") {
          setViewMode(savedMode);
        }
      } catch (err) {
        console.error("Error loading view mode:", err);
      }
    };
    loadViewMode();
  }, []);

  const handleSetViewMode = async (mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      await AsyncStorage.setItem("explore_view_mode", mode);
    } catch (err) {
      console.error("Error saving view mode:", err);
    }
  };

  // searchQuery -> debouncedSearch (350ms). Sadece bu değişince feed yenilenir.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Fetch online users count
  const fetchOnlineCount = useCallback(async () => {
    try {
      // Clean up inactive users first
      await supabase.rpc("clean_inactive_users");

      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_online", true)
        .neq("role", "admin");

      if (!error && count !== null) {
        setOnlineCount(count);
      }
    } catch (err) {
      console.error("Error fetching online count:", err);
    }
  }, []);

  // Check if onboarding is needed
  useEffect(() => {
    if (!authLoading && profile) {
      if (profile.username.startsWith("anonim_") && !profile.avatar_url) {
        const timer = setTimeout(() => {
          setShowOnboarding(true);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [authLoading, profile]);

  // Fetch Users Feed (5 VIPs + 10 Normals)
  const fetchFeed = useCallback(
    async (isRefresh = false) => {
      if (authLoading) return; // Skip fetching while auth is loading
      if (isRefresh) setRefreshing(true);
      else setFeedLoading(true);

      const FEED_COLUMNS =
        "id, username, avatar_url, is_vip, is_online, bio, last_active_at, is_highlighted, highlighted_until";

      const runFetch = async (excludeList: string[]) => {
        // Fetch blocks bidirectionally
        const { data: blocksData } = await supabase
          .from("blocks")
          .select("blocker_id, blocked_id");
        
        const blockedUserIds: string[] = [];
        if (user) {
          blockedUserIds.push(user.id);
        }
        if (blocksData) {
          blocksData.forEach((b: any) => {
            if (user) {
              if (b.blocker_id === user.id) blockedUserIds.push(b.blocked_id);
              if (b.blocked_id === user.id) blockedUserIds.push(b.blocker_id);
            }
          });
        }

        const combinedExcludes = Array.from(new Set([...excludeList, ...blockedUserIds]));

        const buildQuery = (isVip: boolean) => {
          let q = supabase
            .from("profiles")
            .select(FEED_COLUMNS)
            .eq("is_vip", isVip)
            .neq("role", "admin")
            .neq("privacy_show_in_searches", false)
            .is("banned_at", null);

          if (user) {
            q = q.neq("id", user.id);
          }

          if (combinedExcludes.length > 0) {
            q = q.not("id", "in", `(${combinedExcludes.join(",")})`);
          }

          const queryStr = debouncedSearch.trim();
          if (queryStr) {
            q = q.or(`username.ilike.%${queryStr}%,bio.ilike.%${queryStr}%`);
          }
          if (filterOnlineOnly) q = q.eq("is_online", true);
          if (selectedGender) q = q.eq("gender", selectedGender);

          return q
            .order("is_highlighted", { ascending: false })
            .order("is_online", { ascending: false })
            .order("last_active_at", { ascending: false })
            .limit(isVip ? 15 : 30);
        };

        const [vipRes, normalRes] = await Promise.all([
          buildQuery(true),
          filterVipsOnly ? Promise.resolve({ data: [], error: null }) : buildQuery(false),
        ]);

        if (vipRes.error) throw vipRes.error;
        if (normalRes && normalRes.error) throw normalRes.error;

        const rawVips = vipRes.data || [];
        const rawNormals = normalRes?.data || [];

        // Fisher-Yates Shuffle helper
        const shuffle = <T,>(array: T[]): T[] => {
          const arr = [...array];
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          return arr;
        };

        const highlightedVips = rawVips.filter((u) => u.is_highlighted);
        const nonHighlightedVips = rawVips.filter((u) => !u.is_highlighted);
        const highlightedNormals = rawNormals.filter((u) => u.is_highlighted);
        const nonHighlightedNormals = rawNormals.filter((u) => !u.is_highlighted);

        // Shuffle non-highlighted groups to randomize their order and selection
        const shuffledVips = shuffle(nonHighlightedVips);
        const shuffledNormals = shuffle(nonHighlightedNormals);

        // Shuffle all highlighted users (VIP or normal) among themselves to vary their order at the top
        const shuffledHighlighted = shuffle([...highlightedVips, ...highlightedNormals]);

        // We want up to 5 VIPs in total (including highlighted VIPs)
        const highlightedVipsCount = shuffledHighlighted.filter((u) => u.is_vip).length;
        const extraVipsNeeded = Math.max(0, 5 - highlightedVipsCount);
        const selectedExtraVips = shuffledVips.slice(0, extraVipsNeeded);

        // Combine selected VIPs and all highlighted users
        const selectedSoFar = [...shuffledHighlighted, ...selectedExtraVips];

        // Total users limit is 15. Fill the remaining slots with non-highlighted normals
        const remainingSlots = Math.max(0, 15 - selectedSoFar.length);
        const selectedExtraNormals = shuffledNormals.slice(0, remainingSlots);

        const combined = [...selectedSoFar, ...selectedExtraNormals];

        // Keep highlighted users at the absolute top
        combined.sort((a, b) => {
          const aHigh = a.is_highlighted ? 1 : 0;
          const bHigh = b.is_highlighted ? 1 : 0;
          return bHigh - aHigh;
        });

        return combined;
      };

      try {
        // Try fetching excluding recently seen user IDs
        let fetchedUsers = await runFetch(lastSeenIdsRef.current);

        // Fallback: If we couldn't get 15 users and we had exclusions, fetch again without exclusions
        if (fetchedUsers.length < 15 && lastSeenIdsRef.current.length > 0) {
          const allUsers = await runFetch([]);
          if (allUsers.length > fetchedUsers.length) {
            fetchedUsers = allUsers;
          }
        }

        setUsers(fetchedUsers);
        // Save these user IDs so the next refresh excludes them
        if (fetchedUsers.length > 0) {
          lastSeenIdsRef.current = fetchedUsers.map((u) => u.id);
        }
      } catch (err) {
        console.error("Error fetching feed:", err);
      } finally {
        setRefreshing(false);
        setFeedLoading(false);
      }
    },
    [
      authLoading,
      user,
      debouncedSearch,
      filterOnlineOnly,
      filterVipsOnly,
      selectedGender,
    ]
  );

  // Fetch initial feed when authentication status is loaded
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      showLoginModal();
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFeed();
    fetchOnlineCount();
  }, [authLoading, user, fetchFeed, fetchOnlineCount, showLoginModal]);

  const handleRefresh = async () => {
    await Promise.all([fetchFeed(true), fetchOnlineCount()]);
  };

  // Start Chat Flow
  const handleStartChat = async (targetUser: UserProfile) => {
    if (!user) {
      showLoginModal();
      return;
    }

    try {
      setFeedLoading(true);

      const { conversationId } = await findOrCreateConversation(
        user.id,
        targetUser.id,
      );

      router.push(`/chat-room?id=${conversationId}&name=${targetUser.username}`);
    } catch (err) {
      console.error("Start chat error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Sohbet başlatılamadı.",
        type: "error",
      });
    } finally {
      setFeedLoading(false);
    }
  };

  // Gender filter (VIP-only). Normal kullanıcı dokununca VIP'e yönlendirilir.
  const handleGenderFilter = (value: "male" | "female") => {
    if (!user) {
      showLoginModal();
      return;
    }
    if (!profile?.is_vip) {
      ActionModal.show({
        title: (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#FFD700" }}>VIP Özelliği</Text>
            <MaterialCommunityIcons name="crown" size={20} color="#FFD700" />
          </View>
        ),
        message: "Cinsiyete göre filtreleme yalnızca VIP üyelere özeldir.",
        type: "warning",
        buttons: [
          { text: "İptal", style: "cancel" },
          { text: "VIP Ol", onPress: () => router.push("/profile") },
        ],
      });
      return;
    }
    setSelectedGender((prev) => (prev === value ? null : value));
  };

  const renderUserCard = ({ item }: { item: UserProfile }) => {
    return (
      <TouchableOpacity
        style={[
          styles.gridCard,
          {
            backgroundColor: colors.backgroundElement,
            borderColor: colors.border,
          },
        ]}
        onPress={() => handleStartChat(item)}
        activeOpacity={0.85}
      >
        {/* Profile Image filling card background */}
        <ExpoImage
          source={
            item.avatar_url
              ? { uri: item.avatar_url }
              : require("../../../assets/images/place-holder.png")
          }
          style={styles.gridCardImage}
          contentFit="cover"
        />

        {/* Badges Container */}
        <View style={styles.badgeContainer}>
          {item.is_vip && (
            <View style={[styles.gridVipBadge, { backgroundColor: colors.vip }]}>
              <Ionicons name="ribbon" size={10} color="#FFFFFF" style={{ marginRight: 2 }} />
              <Text style={styles.gridVipBadgeText}>VIP</Text>
            </View>
          )}
          {item.is_highlighted && (
            <View style={[styles.gridHighlightBadge, { backgroundColor: "#EAB308" }]}>
              <Ionicons name="star" size={10} color="#FFFFFF" style={{ marginRight: 2 }} />
              <Text style={styles.gridVipBadgeText}>Öne Çıkan</Text>
            </View>
          )}
        </View>

        {/* Online Status Dot */}
        {item.is_online && (
          <View style={[styles.gridOnlineBadge, { backgroundColor: colors.online, borderColor: colors.backgroundElement }]} />
        )}

        {/* Dark Text Overlay at the Bottom of the Card */}
        <View style={styles.gridCardOverlay}>
          <Text style={styles.gridCardName} numberOfLines={1}>
            {item.username}
          </Text>
          <Text style={styles.gridCardBio} numberOfLines={1}>
            {item.bio || "Sohbet etmek istiyor..."}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderUserListItem = ({ item }: { item: UserProfile }) => {
    return (
      <TouchableOpacity
        style={[
          styles.listCard,
          {
            borderBottomColor: colors.border,
          },
        ]}
        onPress={() => handleStartChat(item)}
        activeOpacity={0.8}
      >
        <View style={styles.listCardHeader}>
          {/* Avatar Container with Crown frame for VIPs */}
          <View style={styles.listAvatarWrapper}>
            {item.is_vip && (
              <View style={styles.listCrownContainer}>
                <Text style={styles.listCrownEmoji}>👑</Text>
              </View>
            )}
            <View
              style={[
                styles.listAvatarFrame,
                {
                  borderColor: item.is_vip ? colors.vip : "transparent",
                  borderWidth: item.is_vip ? 2 : 0,
                  borderRadius: 31,
                },
              ]}
            >
              <ExpoImage
                source={
                  item.avatar_url
                    ? { uri: item.avatar_url }
                    : require("../../../assets/images/place-holder.png")
                }
                style={styles.listCardAvatar}
                contentFit="cover"
              />
            </View>
            {item.is_online && (
              <View
                style={[
                  styles.listOnlineIndicator,
                  { backgroundColor: colors.online, borderColor: colors.background },
                ]}
              />
            )}
          </View>

          {/* User Details */}
          <View style={styles.listCardInfo}>
            <View style={styles.listUsernameRow}>
              <Text style={[styles.listUsername, { color: colors.text }]}>
                {item.username}
              </Text>
              {item.is_vip && (
                <Text style={{ fontSize: 13, marginLeft: 2 }}>💎</Text>
              )}
            </View>

            {/* Bio details (if any) */}
            <Text
              style={[styles.listBioText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {item.bio || "Sohbet etmek istiyor..."}
            </Text>
          </View>

          {/* VIP Badge on the right */}
          {item.is_vip && (
            <View style={[styles.listVipBadge, { borderColor: colors.vip }]}>
              <Text style={[styles.listVipBadgeText, { color: colors.vip }]}>
                VIP
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const filterItems = [
    {
      id: "online",
      label: "Çevrimiçi",
      isActive: filterOnlineOnly,
      onPress: () => setFilterOnlineOnly(!filterOnlineOnly),
      icon: "ellipse",
      iconSize: 8,
      activeColor: colors.online,
    },
    {
      id: "vip",
      label: "Sadece VIP",
      isActive: filterVipsOnly,
      onPress: () => setFilterVipsOnly(!filterVipsOnly),
      icon: "ribbon",
      iconSize: 14,
      activeColor: colors.vip,
    },
    {
      id: "female",
      label: "Kadın",
      isActive: selectedGender === "female",
      onPress: () => handleGenderFilter("female"),
      icon: AppIcons.female,
      iconSize: 14,
      activeColor: colors.primary,
    },
    {
      id: "male",
      label: "Erkek",
      isActive: selectedGender === "male",
      onPress: () => handleGenderFilter("male"),
      icon: AppIcons.male,
      iconSize: 14,
      activeColor: colors.primary,
    },
  ] as const;

  if (authLoading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: Spacing.six }]}>
        <Ionicons name="lock-closed-outline" size={80} color={colors.primary} style={{ marginBottom: Spacing.four }} />
        <Text style={{ fontFamily: Fonts.heading, fontSize: 22, color: colors.text, marginBottom: Spacing.two, textAlign: "center" }}>
          Erişim Kısıtlı
        </Text>
        <Text style={{ fontFamily: Fonts.body, fontSize: 15, color: colors.textSecondary, marginBottom: Spacing.six, textAlign: "center", lineHeight: 22, paddingHorizontal: Spacing.four }}>
          Match & Chat keşfet sayfasındaki kullanıcıları görmek ve anında eşleşip sohbete başlamak için lütfen giriş yapın veya kayıt olun.
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: colors.primary,
            paddingVertical: Spacing.three,
            paddingHorizontal: Spacing.six,
            borderRadius: 25,
            width: "80%",
            alignItems: "center",
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 5,
          }}
          onPress={showLoginModal}
        >
          <Text style={{ fontFamily: Fonts.heading, fontSize: 16, color: "#FFFFFF" }}>Giriş Yap / Kayıt Ol</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isDark = scheme === "dark";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* Messenger style Header for Keşfet */}
      <View style={styles.customHeader}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity onPress={() => router.push("/profile" as any)}>
            <ExpoImage
              source={profile?.avatar_url ? { uri: profile.avatar_url } : require("../../../assets/images/place-holder.png")}
              style={styles.headerUserAvatar}
              contentFit="cover"
            />
          </TouchableOpacity>
          <Text style={[styles.headerTextTitle, { color: colors.text }]}>Keşfet</Text>
          <View style={styles.headerRightActions}>
            <View style={[styles.onlineIndicatorBadge, { backgroundColor: colors.online + "20" }]}>
              <View style={[styles.onlineBadgeDot, { backgroundColor: colors.online }]} />
              <Text style={[styles.onlineCountText, { color: colors.online }]}>
                {onlineCount.toLocaleString()} aktif
              </Text>
            </View>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBarContainer}>
          <View style={[styles.searchBarInputRow, { backgroundColor: isDark ? "#1C212E" : "#F2F4F7" }]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchTextInput, { color: colors.text }]}
              placeholder="Kullanıcı adı, bio veya şehir ara..."
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

        {/* Grid/Liste View Mode Segmented Control */}
        <View style={styles.viewModeContainer}>
          <TouchableOpacity
            style={[
              styles.viewModeOption,
              viewMode === "grid" && [
                styles.viewModeOptionActive,
                { backgroundColor: isDark ? "#0C1014" : "#FFFFFF" }
              ],
            ]}
            onPress={() => handleSetViewMode("grid")}
            activeOpacity={0.8}
          >
            <Ionicons
              name={viewMode === "grid" ? "grid" : "grid-outline"}
              size={15}
              color={viewMode === "grid" ? colors.text : colors.textSecondary}
            />
            <Text
              style={[
                styles.viewModeOptionText,
                { color: viewMode === "grid" ? colors.text : colors.textSecondary },
              ]}
            >
              Grid
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.viewModeOption,
              viewMode === "list" && [
                styles.viewModeOptionActive,
                { backgroundColor: isDark ? "#0C1014" : "#FFFFFF" }
              ],
            ]}
            onPress={() => handleSetViewMode("list")}
            activeOpacity={0.8}
          >
            <Ionicons
              name={viewMode === "list" ? "list" : "list-outline"}
              size={15}
              color={viewMode === "list" ? colors.text : colors.textSecondary}
            />
            <Text
              style={[
                styles.viewModeOptionText,
                { color: viewMode === "list" ? colors.text : colors.textSecondary },
              ]}
            >
              Liste
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Grid */}
      <FlatList
        key={viewMode}
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={viewMode === "grid" ? renderUserCard : renderUserListItem}
        numColumns={viewMode === "grid" ? 2 : 1}
        columnWrapperStyle={viewMode === "grid" ? styles.gridColumnWrapper : undefined}
        contentContainerStyle={styles.listContainer}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <>
            {/* Custom Capsule Filter Row */}
            <View style={styles.filterBarWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                {filterItems.map((item) => {
                  const activeBg = item.isActive ? item.activeColor : (isDark ? "#1C212E" : "#E2E8F0");
                  const activeText = item.isActive ? "#FFFFFF" : colors.text;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.filterCapsule, { backgroundColor: activeBg }]}
                      onPress={item.onPress}
                    >
                      {item.icon === "ellipse" ? (
                        <View style={[styles.filterEllipseDot, { backgroundColor: colors.online }]} />
                      ) : item.icon ? (
                        <Ionicons
                          name={item.icon as any}
                          size={item.iconSize}
                          color={item.isActive ? "#FFFFFF" : colors.textSecondary}
                          style={{ marginRight: 4 }}
                        />
                      ) : null}
                      <Text style={[styles.filterCapsuleText, { color: activeText }]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* VIP Promoted Boost Banner (Orange/Gold Card) */}
            <TouchableOpacity
              style={styles.boostBanner}
              onPress={() => {
                if (!user) {
                  showLoginModal();
                } else {
                  router.push({ pathname: "/(tabs)/profile", params: { boost: String(Date.now()) } });
                }
              }}
            >
              <View style={styles.boostRocketCircle}>
                <Ionicons name="flash" size={20} color="#ff7c01ff" />
              </View>
              <View style={styles.boostTextContent}>
                <Text style={styles.boostTitle}>
                  Hep yukarıda görünmek ister misin?
                </Text>
                <Text style={styles.boostDesc}>
                  {"Boost'la Keşfet'te öne çık, daha çok mesaj al!"}
                </Text>
              </View>
            </TouchableOpacity>
          </>
        }
        ListEmptyComponent={
          !feedLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Yakınlarda aktif kullanıcı bulunamadı. Lütfen yenileyin!
              </Text>
            </View>
          ) : (
            <ActivityIndicator
              style={styles.loader}
              color={colors.primary}
              size="large"
            />
          )
        }
      />

      {/* Welcome Onboarding Modal */}
      <OnboardingModal
        visible={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    height: 40,
    borderRadius: 20,
  },
  headerTextTitle: {
    fontSize: 30,
    fontFamily: Fonts.headingBlack,
    fontWeight: "bold",
    flex: 1,
    marginLeft: Spacing.two,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  onlineIndicatorBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 12,
  },
  onlineBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  onlineCountText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Fonts.bodyMedium,
  },
  searchBarContainer: {
    width: "100%",
  },
  searchBarInputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
  },
  searchTextInput: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    fontFamily: Fonts.body,
    paddingVertical: 0,
  },
  filterBarWrapper: {
    marginVertical: Spacing.two,
  },
  filterScroll: {
    paddingHorizontal: Spacing.three,
    gap: 8,
  },
  filterCapsule: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  filterEllipseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  filterCapsuleText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Fonts.bodyMedium,
  },
  boostBanner: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    borderRadius: 16,
    backgroundColor: "#F59E0B",
    padding: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
  },
  boostRocketCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.three,
  },
  boostTextContent: {
    flex: 1,
  },
  boostTitle: {
    color: "#000000",
    fontSize: 13,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
    marginBottom: 1,
  },
  boostDesc: {
    color: "rgba(0,0,0,0.7)",
    fontSize: 11,
    lineHeight: 14,
  },
  listContainer: {
    paddingBottom: BottomTabInset,
  },
  gridColumnWrapper: {
    justifyContent: "space-between",
    paddingHorizontal: Spacing.three,
    marginVertical: 6,
  },
  gridCard: {
    width: "48%",
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  gridCardImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  badgeContainer: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "column",
    gap: 4,
  },
  gridVipBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  gridHighlightBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  gridVipBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  gridOnlineBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  gridCardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  gridCardName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  gridCardBio: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 11,
    fontFamily: Fonts.body,
    marginTop: 2,
  },
  viewModeContainer: {
    flexDirection: "row",
    borderRadius: 20,
    padding: 3,
    marginTop: Spacing.two,
  },
  viewModeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 17,
    gap: 6,
  },
  viewModeOptionActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  viewModeOptionText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: Fonts.bodyMedium,
  },
  listCard: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    borderBottomWidth: 1,
  },
  listCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  listAvatarWrapper: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  listCrownContainer: {
    position: "absolute",
    top: -12,
    zIndex: 10,
  },
  listCrownEmoji: {
    fontSize: 16,
  },
  listAvatarFrame: {
    padding: 1.5,
  },
  listCardAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  listOnlineIndicator: {
    position: "absolute",
    bottom: 0,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  listCardInfo: {
    marginLeft: Spacing.three,
    flex: 1,
  },
  listUsernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  listUsername: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  listBioText: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
  listVipBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  listVipBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  loader: {
    marginTop: Spacing.six,
  },
  emptyContainer: {
    padding: Spacing.six,
    alignItems: "center",
  },
  emptyText: {
    textAlign: "center",
    fontSize: 14,
  },
  storyModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  storyModalCloseArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  storyModalContent: {
    width: "92%",
    height: "85%",
    backgroundColor: "#000",
    borderRadius: 16,
    overflow: "hidden",
  },
  storyModalHeader: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    zIndex: 10,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  storyModalAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: Spacing.two,
  },
  storyModalUsername: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    fontFamily: Fonts.bodyMedium,
  },
  storyModalCounter: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginHorizontal: Spacing.two,
    fontFamily: Fonts.bodyMedium,
  },
  storyModalCloseButton: {
    padding: Spacing.one,
  },
  storyModalCloseText: {
    color: "#FFFFFF",
    fontSize: 20,
  },
  modalImageWrap: {
    flex: 1,
    position: "relative",
    justifyContent: "center",
  },
  storyModalImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  progressSegmentsContainer: {
    position: "absolute",
    top: Spacing.two,
    left: Spacing.two,
    right: Spacing.two,
    height: 3,
    flexDirection: "row",
    gap: 4,
    zIndex: 5,
  },
  progressSegmentTrack: {
    flex: 1,
    height: "100%",
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#FFFFFF",
  },
  musicPill: {
    position: "absolute",
    top: Spacing.three,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    maxWidth: "80%",
    paddingVertical: 6,
    paddingHorizontal: Spacing.two,
    borderRadius: 18,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  musicPillText: {
    color: "#FFFFFF",
    fontSize: 13,
    flexShrink: 1,
    fontFamily: Fonts.bodyMedium,
  },
  navButton: {
    position: "absolute",
    top: "50%",
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  navButtonLeft: {
    left: Spacing.two,
  },
  navButtonRight: {
    right: Spacing.two,
  },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    gap: Spacing.two,
  },
  likeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  likeCountText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: Fonts.bodyMedium,
  },
  ownStoryHint: {
    flex: 1,
    textAlign: "right",
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  replyRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  replyInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: Spacing.three,
    color: "#FFFFFF",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    fontFamily: Fonts.body,
  },
  replySendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },
});
