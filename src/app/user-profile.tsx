import { ActionModal } from "@/components/ActionModal";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { useColorScheme } from "../hooks/use-color-scheme";
import { findOrCreateConversation } from "../lib/conversations";
import { supabase } from "../lib/supabase";

const { width } = Dimensions.get("window");

// Stable detail mapping helper based on user ID hash
function getStableDetails(userId: string) {
  if (!userId) {
    return {
      age: 24,
      country: "Turkey",
      flag: "🇹🇷",
      language: "Turkish",
      interests: ["Music", "Movies"],
    };
  }

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);

  // Age between 19 and 35
  const age = 19 + (hash % 17);

  // Country, Flag and Language
  const countries = [
    { name: "Netherlands", flag: "🇳🇱", language: "Dutch" },
    { name: "Turkey", flag: "🇹🇷", language: "Turkish" },
    { name: "Germany", flag: "🇩🇪", language: "German" },
    { name: "United States", flag: "🇺🇸", language: "English" },
    { name: "United Kingdom", flag: "🇬🇧", language: "English" },
    { name: "France", flag: "🇫🇷", language: "French" },
    { name: "Italy", flag: "🇮🇹", language: "Italian" },
    { name: "Spain", flag: "🇪🇸", language: "Spanish" },
    { name: "Brazil", flag: "🇧🇷", language: "Portuguese" },
    { name: "Japan", flag: "🇯🇵", language: "Japanese" },
  ];
  const countryData = countries[hash % countries.length];

  // Interests Pool
  const interestPool = [
    "Music",
    "Reading",
    "Travel",
    "Fitness",
    "Movies",
    "Gaming",
    "Cooking",
    "Photography",
    "Art",
    "Dancing",
    "Sports",
    "Technology",
  ];
  const interestCount = 2 + (hash % 3); // 2 to 4 interests
  const selectedInterests: string[] = [];
  for (let i = 0; i < interestCount; i++) {
    const interest = interestPool[(hash + i * 7) % interestPool.length];
    if (!selectedInterests.includes(interest)) {
      selectedInterests.push(interest);
    }
  }

  return {
    age,
    country: countryData.name,
    flag: countryData.flag,
    language: countryData.language,
    interests:
      selectedInterests.length > 0 ? selectedInterests : ["Coffee", "Chatting"],
  };
}

function getFlagEmoji(country: string | null | undefined): string {
  if (!country) return "🌐";
  const normalized = country.trim().toLowerCase();
  if (
    normalized.includes("turk") ||
    normalized === "tr" ||
    normalized === "türkiye" ||
    normalized === "turkey"
  )
    return "🇹🇷";
  if (
    normalized.includes("germany") ||
    normalized === "deutschland" ||
    normalized === "de"
  )
    return "🇩🇪";
  if (normalized.includes("netherlands") || normalized === "nl") return "🇳🇱";
  if (
    normalized.includes("united states") ||
    normalized === "usa" ||
    normalized === "us"
  )
    return "🇺🇸";
  if (
    normalized.includes("united kingdom") ||
    normalized === "uk" ||
    normalized === "gb"
  )
    return "🇬🇧";
  if (normalized.includes("france") || normalized === "fr") return "🇫🇷";
  if (normalized.includes("italy") || normalized === "it") return "🇮🇹";
  if (normalized.includes("spain") || normalized === "es") return "🇪🇸";
  if (normalized.includes("brazil") || normalized === "br") return "🇧🇷";
  if (normalized.includes("japan") || normalized === "jp") return "🇯🇵";
  return "🌐";
}

interface UserProfileData {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  is_online: boolean;
  language?: string | null;
  country?: string | null;
  age?: number | null;
  hobbies?: string[] | null;
}

export default function UserProfileScreen() {
  const { user, profile, showLoginModal, refreshProfile } = useAuth();
  const { startCall } = useCall();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: userId } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [giftModalVisible, setGiftModalVisible] = useState(false);
  const [giftAmount, setGiftAmount] = useState<number>(0);
  const [customGiftAmount, setCustomGiftAmount] = useState("");
  const [sendingGift, setSendingGift] = useState(false);

  // Redirect guests back and show login modal
  useEffect(() => {
    if (!user) {
      router.back();
      showLoginModal();
    }
  }, [router, showLoginModal, user]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!userId || !user) {
        setLoading(false);
        return;
      }
      try {
        const [profileRes, blockRes] = await Promise.all([
          supabase
            .from("profiles")
            .select(
              "id, username, avatar_url, bio, is_online, language, country, age, hobbies",
            )
            .eq("id", userId)
            .single(),
          supabase
            .from("blocks")
            .select("*")
            .eq("blocker_id", user.id)
            .eq("blocked_id", userId)
            .maybeSingle(),
        ]);

        if (profileRes.error) throw profileRes.error;
        setProfileData(profileRes.data);
        setIsBlocked(!!blockRes.data);
      } catch (err) {
        console.error("Error fetching user profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [userId, user]);

  const stableDetails = getStableDetails(userId || "");

  const displayAge =
    profileData && profileData.age !== null && profileData.age !== undefined
      ? profileData.age
      : stableDetails.age;

  const displayCountry = profileData?.country || stableDetails.country;
  const displayFlag = getFlagEmoji(displayCountry);
  const displayLanguage = profileData?.language || stableDetails.language;

  const displayHobbies =
    profileData?.hobbies && profileData.hobbies.length > 0
      ? profileData.hobbies
      : stableDetails.interests;

  const handleMessagePress = async () => {
    if (!user || !profileData) return;
    setLoadingAction(true);
    try {
      const { conversationId } = await findOrCreateConversation(
        user.id,
        profileData.id,
      );

      // Open Chat Room
      router.push(
        `/chat-room?id=${conversationId}&name=${profileData.username}`,
      );
    } catch (err) {
      console.error("Error starting conversation:", err);
      ActionModal.show({
        title: "Error",
        message: "Could not start chat conversation.",
        type: "error",
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCallPress = () => {
    if (!profileData || !userId) return;
    startCall(userId, profileData.username, profileData.avatar_url);
  };

  const handleBlockUser = async () => {
    if (!profileData || !user) return;

    ActionModal.show({
      title: "Engelle / Block",
      message: `${profileData.username} adlı kullanıcıyı engellemek istediğinize emin misiniz? Birbirinize mesaj gönderemezsiniz.`,
      type: "warning",
      buttons: [
        { text: "Vazgeç / Cancel", style: "cancel" },
        {
          text: "Engelle / Block",
          style: "destructive",
          onPress: async () => {
            try {
              // 1. Insert block record
              const { error } = await supabase.from("blocks").insert({
                blocker_id: user.id,
                blocked_id: profileData.id,
              });

              if (error) throw error;

              // 2. Delete the conversation participant row for us
              const { data: participants } = await supabase
                .from("conversation_participants")
                .select("conversation_id")
                .eq("user_id", user.id);

              const convIds = participants?.map((p) => p.conversation_id) || [];
              if (convIds.length > 0) {
                const { data: otherPart } = await supabase
                  .from("conversation_participants")
                  .select("conversation_id")
                  .in("conversation_id", convIds)
                  .eq("user_id", profileData.id)
                  .maybeSingle();

                if (otherPart) {
                  await supabase
                    .from("conversation_participants")
                    .delete()
                    .eq("conversation_id", otherPart.conversation_id)
                    .eq("user_id", user.id);
                }
              }

              setIsBlocked(true);
              ActionModal.show({
                title: "Başarılı",
                message: "Kullanıcı engellendi.",
                type: "success",
              });
              router.back();
            } catch (err) {
              console.error("Block error:", err);
              ActionModal.show({
                title: "Hata",
                message: "Engelleme işlemi gerçekleştirilemedi.",
                type: "error",
              });
            }
          },
        },
      ],
    });
  };

  const handleUnblockUser = async () => {
    if (!profileData || !user) return;

    try {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", profileData.id);

      if (error) throw error;

      setIsBlocked(false);
      ActionModal.show({
        title: "Başarılı",
        message: "Kullanıcı engeli kaldırıldı.",
        type: "success",
      });
    } catch (err) {
      console.error("Unblock error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Engel kaldırma işlemi gerçekleştirilemedi.",
        type: "error",
      });
    }
  };

  const handleReportUser = () => {
    if (!profileData || !user) return;

    ActionModal.prompt({
      title: "Şikayet Et / Report",
      message: "Lütfen şikayet nedeninizi girin:",
      onSubmit: async (reason) => {
        if (!reason || !reason.trim()) {
          ActionModal.show({
            title: "Hata",
            message: "Şikayet nedeni boş olamaz.",
            type: "error",
          });
          return;
        }

        try {
          const { error } = await supabase.from("reports").insert({
            reporter_id: user.id,
            reported_id: profileData.id,
            reason: reason.trim(),
          });

          if (error) throw error;

          ActionModal.show({
            title: "Teşekkürler",
            message: "Şikayetiniz moderatör ekibimize iletilmiştir.",
            type: "success",
          });
        } catch (err) {
          console.error("Report error:", err);
          ActionModal.show({
            title: "Hata",
            message: "Şikayet gönderilemedi.",
            type: "error",
          });
        }
      },
    });
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
      });
      return;
    }

    setSendingGift(true);
    try {
      const { error } = await supabase.rpc("send_diamond_gift", {
        recipient_id: profileData!.id,
        amount: giftAmount,
      });
      if (error) throw error;

      const { conversationId } = await findOrCreateConversation(
        user!.id,
        profileData!.id,
      );

      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user!.id,
        content: `🎁 Hediye: ${giftAmount} Elmas gönderildi!`,
      });

      if (messageError) throw messageError;

      await refreshProfile();
      setGiftModalVisible(false);
      setGiftAmount(0);
      setCustomGiftAmount("");

      ActionModal.show({
        title: (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={{ fontSize: 18, fontWeight: "bold", color: colors.text }}
            >
              Hediye Gönderildi
            </Text>
            <Ionicons name="diamond" size={20} color="#A855F7" />
          </View>
        ),
        message: `${profileData!.username} kullanıcısına ${giftAmount} elmas gönderildi!`,
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

  const handleShowOptions = () => {
    ActionModal.show({
      title: "İşlemler",
      message: "Lütfen bir işlem seçin:",
      type: "info",
      buttons: [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Kullanıcıyı Şikayet Et",
          onPress: handleReportUser,
        },
        {
          text: isBlocked ? "Engeli Kaldır" : "Kullanıcıyı Engelle",
          style: isBlocked ? "default" : "destructive",
          onPress: isBlocked ? handleUnblockUser : handleBlockUser,
        },
      ],
    });
  };

  if (loading) {
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

  if (!profileData) {
    return (
      <SafeAreaView
        style={[styles.errorContainer, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.errorText, { color: colors.text }]}>
          Kullanıcı bulunamadı.
        </Text>
        <TouchableOpacity
          style={[styles.backTextButton, { backgroundColor: colors.primary }]}
          onPress={() => router.back()}
        >
          <Text style={styles.backTextButtonText}>Geri Dön</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Absolute Header Overlay (More Options & Back button over the image) */}
      <View
        style={[
          styles.floatingHeader,
          { top: insets.top > 0 ? insets.top : 20 },
        ]}
      >
        <TouchableOpacity
          style={styles.iconCircleButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconCircleButton}
          onPress={handleShowOptions}
        >
          <Ionicons name="ellipsis-vertical" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 110 + (insets.bottom > 0 ? insets.bottom + 8 : 12) },
        ]}
      >
        {/* Cover Photo */}
        <View style={styles.coverContainer}>
          <Image
            source={
              profileData.avatar_url
                ? { uri: profileData.avatar_url }
                : require("../../assets/images/place-holder.png")
            }
            style={styles.coverImage}
            contentFit="cover"
            blurRadius={15}
          />
          <View style={styles.coverOverlay} />
        </View>

        {/* Overlapping Avatar */}
        <View style={styles.avatarContainer}>
          <View
            style={[styles.avatarBorder, { borderColor: colors.background }]}
          >
            <Image
              source={
                profileData.avatar_url
                  ? { uri: profileData.avatar_url }
                  : require("../../assets/images/place-holder.png")
              }
              style={styles.avatarImage}
              contentFit="cover"
            />
          </View>
        </View>

        {/* User Details Details */}
        <View style={styles.detailsContainer}>
          <Text style={[styles.nameText, { color: colors.text }]}>
            {profileData.username}, {displayAge}
          </Text>

          {/* Location & Language info */}
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              {displayFlag === "🌐" ? (
                <Ionicons
                  name="globe-outline"
                  size={16}
                  color={colors.textSecondary}
                  style={{ marginRight: 4 }}
                />
              ) : (
                <Text style={styles.flagText}>{displayFlag}</Text>
              )}
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {profileData.country
                  ? `${profileData.country}`
                  : displayCountry}
              </Text>
            </View>
            <View style={[styles.infoItem, { marginLeft: Spacing.four }]}>
              <Ionicons
                name="globe-outline"
                size={16}
                color={colors.textSecondary}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {displayLanguage}
              </Text>
            </View>
          </View>

          {/* Online status */}
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: profileData.is_online
                    ? "#10B981"
                    : "#9CA3AF",
                },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                {
                  color: profileData.is_online
                    ? "#10B981"
                    : colors.textSecondary,
                },
              ]}
            >
              {profileData.is_online ? "Çevrimiçi" : "Çevrimdışı"}
            </Text>
          </View>

          {/* About section */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>
              Bio
            </Text>
            <Text
              style={[styles.sectionContent, { color: colors.textSecondary }]}
            >
              {profileData.bio || "Açıklama yazılmamış"}
            </Text>
          </View>

          {/* Interests section */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>
              Hobileri
            </Text>
            <View style={styles.interestsContainer}>
              {displayHobbies.map((interest, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.interestTag,
                    {
                      backgroundColor:
                        scheme === "dark" ? "#1E293B" : "#F1F5F9",
                    },
                  ]}
                >
                  <Text style={[styles.interestText, { color: colors.text }]}>
                    {interest}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating CTA Footer Buttons */}
      <View
        style={[
          styles.floatingFooterContainer,
          {
            bottom: insets.bottom > 0 ? insets.bottom : 16,
            backgroundColor:
              scheme === "dark"
                ? "rgba(10, 13, 20, 0.85)"
                : "rgba(255, 255, 255, 0.9)",
            borderColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.messageButton,
            {
              backgroundColor: colors.primary,
            },
          ]}
          onPress={handleMessagePress}
          disabled={loadingAction}
        >
          {loadingAction ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons
                name="chatbubble"
                size={18}
                color="#FFFFFF"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.messageButtonText}>Sohbet</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.giftButton}
          onPress={() => {
            setGiftAmount(0);
            setCustomGiftAmount("");
            setGiftModalVisible(true);
          }}
        >
          <Ionicons name="gift" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.callButton, { backgroundColor: "#10B981" }]}
          onPress={handleCallPress}
        >
          <Ionicons
            name="call"
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.callButtonText}>Ara</Text>
        </TouchableOpacity>
      </View>

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
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Text
                style={{ color: colors.text, fontSize: 20, fontWeight: "bold" }}
              >
                <Ionicons name="gift" size={20} color="#A855F7" /> Hediye Gönder
              </Text>
              <TouchableOpacity onPress={() => setGiftModalVisible(false)}>
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginBottom: 16,
                backgroundColor: scheme === "dark" ? "#1E1B3A" : "#F3F0FF",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <Image
                source={
                  profileData?.avatar_url
                    ? { uri: profileData.avatar_url }
                    : require("../../assets/images/place-holder.png")
                }
                style={{ width: 40, height: 40, borderRadius: 20 }}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: "bold",
                    fontSize: 15,
                  }}
                >
                  {profileData?.username}
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Ionicons name="diamond" size={14} color="#A855F7" />
                <Text style={{ color: "#A855F7", fontWeight: "bold" }}>
                  Bakiye: {profile?.diamonds ?? 0}
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 12,
              }}
            >
              {[5, 10, 50, 100].map((amount) => (
                <TouchableOpacity
                  key={amount}
                  onPress={() => {
                    setGiftAmount(amount);
                    setCustomGiftAmount("");
                  }}
                  style={{
                    flex: 1,
                    minWidth: "22%",
                    backgroundColor:
                      giftAmount === amount
                        ? "#A855F7"
                        : scheme === "dark"
                          ? "#1E1B3A"
                          : "#F3F0FF",
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor:
                      giftAmount === amount ? "#A855F7" : "#A855F730",
                  }}
                >
                  <Ionicons
                    name="diamond"
                    size={18}
                    color={giftAmount === amount ? "#FFF" : "#A855F7"}
                  />
                  <Text
                    style={{
                      color: giftAmount === amount ? "#FFF" : colors.text,
                      fontWeight: "bold",
                      fontSize: 14,
                      marginTop: 2,
                    }}
                  >
                    {amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={{
                backgroundColor: colors.background,
                color: colors.text,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                marginBottom: 16,
              }}
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
                <Text
                  style={{ color: "#FFF", fontSize: 16, fontWeight: "bold" }}
                >
                  {giftAmount > 0 ? (
                    <>
                      <Ionicons name="gift" size={16} color="#FFF" />{" "}
                      {giftAmount} Elmas Gönder
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
    </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.four,
  },
  errorText: {
    fontSize: 18,
    fontFamily: Fonts.bodyMedium,
    marginBottom: Spacing.three,
  },
  backTextButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  backTextButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  floatingHeader: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
    zIndex: 100,
  },
  iconCircleButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingBottom: 110,
  },
  coverContainer: {
    width: width,
    height: 180,
    position: "relative",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  avatarContainer: {
    alignItems: "center",
    marginTop: -55,
    zIndex: 10,
  },
  avatarBorder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 51,
  },
  detailsContainer: {
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.four,
    alignItems: "center",
  },
  nameText: {
    fontSize: 24,
    fontWeight: "800",
    fontFamily: Fonts.heading,
    marginBottom: Spacing.one,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.two,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  flagText: {
    fontSize: 18,
    marginRight: 6,
  },
  infoText: {
    fontSize: 15,
    fontFamily: Fonts.body,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.four,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
    fontFamily: Fonts.bodyMedium,
  },
  sectionContainer: {
    marginTop: Spacing.four,
    width: "100%",
    alignItems: "flex-start",
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Fonts.heading,
    marginBottom: Spacing.two,
  },
  sectionContent: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
  },
  interestsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  interestTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  interestText: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
  },
  floatingFooterContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  messageButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  messageButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: Fonts.bodyMedium,
  },
  giftButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#A855F7",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 8,
  },
  callButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  callButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: Fonts.bodyMedium,
  },
});
