import ProfileHero from '../../components/ProfileHero';
import { InstagramEditor, SocialPanel } from '../../components/SocialPanel';
import { requestId } from '../../lib/requestId';
import { initRevenueCat, getRevenueCatOfferings, purchaseRevenueCatPackage } from '../../lib/revenuecat';
import { ActionModal } from "@/components/ActionModal";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { AppIcons } from "../../constants/icons";
import { Colors, Spacing } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useThemeContext } from "../../contexts/ThemeContext";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { getAssetExtension } from "../../lib/media";
import { uploadFile } from "../../lib/storage";
import { supabase } from "../../lib/supabase";

interface DiamondWithdrawalRequest {
  id: string;
  diamond_amount: number;
  payout_percentage: number;
  gross_cash_amount: number;
  user_cash_amount: number;
  app_cash_amount: number;
  bank_name: string;
  iban: string;
  account_holder_name: string;
  user_note: string | null;
  admin_note: string | null;
  status: "pending" | "approved" | "completed" | "cancelled";
  created_at: string;
}

export default function ProfileScreen() {
  const { profile, updateProfile, signOut, deleteAccount, user, refreshProfile } = useAuth();
  const routeParams = useLocalSearchParams<{ boost?: string }>();
  const paymentLock = useRef(false);
  const boostLock = useRef(false);
  const boostRequest = useRef<string | null>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { themeSetting, setThemeSetting } = useThemeContext();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  // Redirect to explore if user is not logged in (e.g. after signing out)
  useEffect(() => {
    if (!user) {
      router.replace("/(tabs)");
    }
  }, [router, user]);

  const [username, setUsername] = useState(profile?.username || "");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarExt, setAvatarExt] = useState<string>("jpg");
  const [bio, setBio] = useState(profile?.bio || "");

  const [language, setLanguage] = useState(profile?.language || "");
  const [country, setCountry] = useState(profile?.country || "");
  const [age, setAge] = useState(profile?.age ? String(profile.age) : "");
  const [hobbies, setHobbies] = useState(
    profile?.hobbies ? profile.hobbies.join(", ") : "",
  );
  const [gender, setGender] = useState<"male" | "female" | null>(
    profile?.gender ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [profileHighlightCost, setProfileHighlightCost] = useState(50);

  // Diamond Store States
  const [diamondPackages, setDiamondPackages] = useState<
    {
      id: string;
      store_product_id?: string | null;
      amount: number;
      price: number;
      badge: string | null;
      is_active: boolean;
      sort_order: number;
    }[]
  >([]);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<{
    id: string;
    amount: number;
    price: number;
    badge: string | null;
  } | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [withdrawalModalVisible, setWithdrawalModalVisible] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalBankName, setWithdrawalBankName] = useState("");
  const [withdrawalIban, setWithdrawalIban] = useState("");
  const [withdrawalAccountHolder, setWithdrawalAccountHolder] = useState("");
  const [withdrawalNote, setWithdrawalNote] = useState("");
  const [creatingWithdrawal, setCreatingWithdrawal] = useState(false);
  const [cashoutUnitPrice, setCashoutUnitPrice] = useState(1);
  const [cashoutUserPercentage, setCashoutUserPercentage] = useState(50);
  const [cashWithdrawalEnabled, setCashWithdrawalEnabled] = useState(true);
  const [withdrawalRequests, setWithdrawalRequests] = useState<
    DiamondWithdrawalRequest[]
  >([]);

  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [vipModalVisible, setVipModalVisible] = useState(false);
  const [highlightsModalVisible, setHighlightsModalVisible] = useState(false);
  const [notificationsModalVisible, setNotificationsModalVisible] =
    useState(false);
  const [requestsModalVisible, setRequestsModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [bankModalVisible, setBankModalVisible] = useState(false);
  useEffect(() => {
    if (!routeParams.boost) return;
    const timer = setTimeout(() => setHighlightsModalVisible(true), 0);
    return () => clearTimeout(timer);
  }, [routeParams.boost]);

  const settingKeyMap: Record<string, string> = {
    match: "notification_new_matches",
    msg: "notification_messages",
    call: "notification_calls",
    promo: "notification_campaigns",
    online: "privacy_show_online",
    profile: "privacy_show_in_searches",
    receipt: "privacy_show_read_receipts",
  };

  const handleToggleSetting = async (itemId: string) => {
    const profileKey = settingKeyMap[itemId];
    if (!profileKey || !profile) return;

    // @ts-ignore
    const currentValue = profile[profileKey] !== false;
    const newValue = !currentValue;

    try {
      await updateProfile({
        [profileKey]: newValue,
      });
    } catch (err) {
      console.error("Error toggling setting:", err);
    }
  };

  // Load Diamond Packages
  const loadDiamondPackages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("diamond_packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (!error && data) {
        setDiamondPackages(data);
      }
    } catch (err) {
      console.error("Error loading diamond packages:", err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDiamondPackages();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadDiamondPackages]);

  const loadWithdrawalData = useCallback(async () => {
    if (!profile) return;

    try {
      const [{ data: settingsData }, { data: requestData, error }] =
        await Promise.all([
          supabase
            .from("system_settings")
            .select("key, value")
            .in("key", [
              "diamond_unit_price",
              "diamond_cashout_user_percentage",
              "cash_withdrawal_enabled",
            ]),
          supabase
            .from("diamond_withdrawal_requests")
            .select("*")
            .eq("user_id", profile.id)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      if (settingsData) {
        const unitSetting = settingsData.find(
          (item) => item.key === "diamond_unit_price",
        );
        const percentageSetting = settingsData.find(
          (item) => item.key === "diamond_cashout_user_percentage",
        );
        const enabledSetting = settingsData.find(
          (item) => item.key === "cash_withdrawal_enabled",
        );
        const unitValue = Number(unitSetting?.value ?? 1);
        const percentageValue = Number(percentageSetting?.value ?? 50);
        setCashoutUnitPrice(Number.isFinite(unitValue) ? unitValue : 1);
        setCashoutUserPercentage(
          Number.isFinite(percentageValue) ? percentageValue : 50,
        );
        setCashWithdrawalEnabled(
          enabledSetting ? enabledSetting.value === "true" : true,
        );
      }

      if (error) throw error;
      setWithdrawalRequests((requestData as DiamondWithdrawalRequest[]) || []);
    } catch (err) {
      console.error("Error loading withdrawal data:", err);
    }
  }, [profile]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadWithdrawalData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadWithdrawalData]);

  const getWithdrawalStatusLabel = (
    status: DiamondWithdrawalRequest["status"],
  ) => {
    switch (status) {
      case "approved":
        return "Onaylandi";
      case "completed":
        return "Tamamlandi";
      case "cancelled":
        return "Iptal edildi";
      default:
        return "Beklemede";
    }
  };

  const getWithdrawalStatusColor = (
    status: DiamondWithdrawalRequest["status"],
  ) => {
    switch (status) {
      case "approved":
        return "#3B82F6";
      case "completed":
        return "#10B981";
      case "cancelled":
        return "#EF4444";
      default:
        return "#F59E0B";
    }
  };

  const selectedWithdrawalDiamonds = parseInt(withdrawalAmount, 10) || 0;
  const estimatedGrossCash = selectedWithdrawalDiamonds * cashoutUnitPrice;
  const estimatedUserCash = estimatedGrossCash * (cashoutUserPercentage / 100);
  const estimatedAppCash = estimatedGrossCash - estimatedUserCash;

  const getBadgeLabel = (badge: string | null) => {
    switch (badge) {
      case "popular":
        return (
          <Text style={{ color: "#FFF", fontSize: 9, fontWeight: "bold" }}>
            <Ionicons name="flame" size={10} color="#FFF" /> Popüler
          </Text>
        );
      case "best_value":
        return (
          <Text style={{ color: "#FFF", fontSize: 9, fontWeight: "bold" }}>
            <Ionicons name="star" size={10} color="#FFF" /> En Avantajlı
          </Text>
        );
      case "new":
        return (
          <Text style={{ color: "#FFF", fontSize: 9, fontWeight: "bold" }}>
            <Ionicons name="sparkles" size={10} color="#FFF" /> Yeni
          </Text>
        );
      default:
        return null;
    }
  };

  const getBadgeColor = (badge: string | null) => {
    switch (badge) {
      case "popular":
        return "#F59E0B";
      case "best_value":
        return "#10B981";
      case "new":
        return "#3B82F6";
      default:
        return "#9CA3AF";
    }
  };

  // Sync state with profile loaded from AuthContext
  useEffect(() => {
    if (profile && !editProfileVisible) {
      const timer = setTimeout(() => {
        setUsername(profile.username);
        setBio(profile.bio || "");

        setLanguage(profile.language || "");
        setCountry(profile.country || "");
        setAge(profile.age ? String(profile.age) : "");
        setHobbies(profile.hobbies ? profile.hobbies.join(", ") : "");
        setGender(profile.gender ?? null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [profile, editProfileVisible]);

  // Fetch profile highlight cost from system settings
  const fetchHighlightCost = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "profile_highlight_cost")
        .maybeSingle();

      if (!error && data) {
        setProfileHighlightCost(parseInt(data.value) || 50);
      }
    } catch (err) {
      console.error("Error fetching profile highlight cost:", err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchHighlightCost();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchHighlightCost]);

  // Pick Image
  const pickAvatarMedia = async () => {
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
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const ext = getAssetExtension(asset);
        if (ext === "gif") {
          ActionModal.show({
            title: "Hata",
            message: "Profil fotoğrafı olarak GIF seçemezsiniz.",
            type: "error",
          });
          return;
        }
        setAvatarUri(asset.uri);
        setAvatarExt(ext);
      }
    } catch (err) {
      console.error("Pick avatar error:", err);
    }
  };

  const handlePickAvatar = () => {
    pickAvatarMedia();
  };

  // Save changes
  const handleSave = async () => {
    if (!username.trim()) {
      ActionModal.show({
        title: "Hata",
        message: "Kullanıcı adı boş olamaz.",
        type: "error",
      });
      return;
    }

    const parsedAge = age.trim() ? parseInt(age.trim(), 10) : null;
    if (
      parsedAge !== null &&
      (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 120)
    ) {
      ActionModal.show({
        title: "Hata",
        message: "Lütfen geçerli bir yaş girin.",
        type: "error",
      });
      return;
    }

    const hobbiesArray = hobbies.trim()
      ? hobbies
          .split(",")
          .map((h) => h.trim())
          .filter((h) => h.length > 0)
      : null;

    setLoading(true);
    try {
      let avatarUrl = profile?.avatar_url || null;

      if (avatarUri) {
        const fileName = `avatar_${profile?.id}_${Date.now()}.${avatarExt}`;
        avatarUrl = await uploadFile("avatars", fileName, avatarUri);
      }

      const { error } = await updateProfile({
        username: username.trim(),
        avatar_url: avatarUrl,
        bio: bio.trim(),

        language: language.trim() || null,
        country: country.trim() || null,
        age: parsedAge,
        hobbies: hobbiesArray,
        gender,
      });

      if (error) {
        if (error.code === "23505") {
          ActionModal.show({
            title: "Hata",
            message: "Bu kullanıcı adı zaten alınmış.",
            type: "error",
          });
        } else {
          ActionModal.show({
            title: "Hata",
            message: `Profil güncellenemedi: ${error.message || "Bilinmeyen bir hata oluştu."}`,
            type: "error",
          });
        }
      } else {
        ActionModal.show({
          title: "Başarılı",
          message: "Profiliniz güncellendi.",
          type: "success",
        });
        setAvatarUri(null); // Clear preview only after a confirmed save
        setEditProfileVisible(false);
      }
    } catch (err: any) {
      console.error("Save profile error:", err);
      ActionModal.show({
        title: "Hata",
        message: err.message || "Profil kaydedilirken hata oluştu.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // Never simulate a paid entitlement by directly editing the protected profile.
  const handleUpgradeVip = () => ActionModal.show({
    title: 'VIP üyelik bilgileri',
    message: profile?.is_vip
      ? 'VIP durumunuz hesabınızda aktif. Mağazadan alınmış aboneliklerinizi Google Play/App Store abonelik ayarlarından yönetin.'
      : 'VIP abonelik satışı henüz yapılandırılmadı. Etkinleştirildiğinde üyelik mağaza üzerinden doğrulanacaktır.',
  });

  // Delete Account Handler (Apple App Store Guideline 5.1.1(v) compliance)
  const handleDeleteAccount = () => {
    ActionModal.show({
      title: "Hesabınızı Kalıcı Olarak Silmek İstediğinize Emin Misiniz?",
      message:
        "Bu işlem GERİ ALINAMAZ. Hesabınız, elmas bakiyeniz, mesajlarınız ve tüm kişisel verileriniz sistemden kalıcı olarak silinecektir.",
      type: "error",
      buttons: [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Evet, Hesabımı Sil",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await deleteAccount();
              if (error) throw error;
              ActionModal.show({
                title: "Hesap Silindi",
                message: "Hesabınız ve tüm verileriniz başarıyla silindi.",
                type: "success",
              });
            } catch (err: any) {
              console.error("Delete account error:", err);
              ActionModal.show({
                title: "Hata",
                message: err.message || "Hesap silinemedi. Lütfen tekrar deneyin.",
                type: "error",
              });
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    });
  };

  // Diamond Purchase Handler
  const handleBuyDiamonds = async () => {
    if (!user || paymentLock.current) return;
    const item = diamondPackages.find(item => item.id === selectedPackage?.id);
    const productId = item?.store_product_id;
    if (!productId) {
      ActionModal.show({ title: 'Mağaza ürünü hazır değil', message: 'Bu paket henüz Google Play/App Store ürünüyle eşleştirilmemiş. Kart bilgisi girmeyin.' }); return;
    }
    paymentLock.current = true; setProcessingPayment(true);
    try {
      if (!await initRevenueCat(user.id)) throw Error('Mağaza bağlantısı yapılandırılmamış.');
      const offerings = await getRevenueCatOfferings();
      const offeringPackages = Object.values(offerings?.all || {}).flatMap(offering => offering.availablePackages);
      const purchasePackage = offeringPackages.find(item => item.product.identifier === productId);
      if (!purchasePackage) throw Error('Mağaza paketi şu an kullanılamıyor.');
      const result = await purchaseRevenueCatPackage(purchasePackage);
      if (result.userCancelled) return;
      if (result.error) throw result.error;
      setPaymentModalVisible(false); void refreshProfile().catch(() => undefined);
      ActionModal.show({ title: 'Ödeme alındı', message: 'Mağaza ödemeniz alındı. Elmaslar sunucu doğrulaması tamamlanınca hesabınıza yansıyacak.' });
    } catch (error: any) { ActionModal.show({ title: 'Satın alma tamamlanamadı', message: error.message }); }
    finally { paymentLock.current = false; setProcessingPayment(false); }
  };

  const resetWithdrawalForm = () => {
    setWithdrawalAmount("");
    setWithdrawalBankName("");
    setWithdrawalIban("");
    setWithdrawalAccountHolder("");
    setWithdrawalNote("");
  };

  const handleCreateWithdrawalRequest = async () => {
    if (!profile) return;

    const amount = parseInt(withdrawalAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      ActionModal.show({
        title: "Hata",
        message: "Lutfen gecerli bir elmas miktari girin.",
        type: "error",
      });
      return;
    }

    if ((profile.diamonds ?? 0) < amount) {
      ActionModal.show({
        title: "Yetersiz Bakiye",
        message: `Bakiyeniz: ${profile.diamonds ?? 0} elmas.`,
        type: "error",
      });
      return;
    }

    if (
      !withdrawalBankName.trim() ||
      !withdrawalIban.trim() ||
      !withdrawalAccountHolder.trim()
    ) {
      ActionModal.show({
        title: "Eksik Bilgi",
        message: "Lutfen banka adi, IBAN ve hesap sahibi alanlarini doldurun.",
        type: "error",
      });
      return;
    }

    setCreatingWithdrawal(true);
    try {
      const { error } = await supabase.rpc(
        "create_diamond_withdrawal_request",
        {
          p_diamond_amount: amount,
          p_bank_name: withdrawalBankName.trim(),
          p_iban: withdrawalIban.trim(),
          p_account_holder_name: withdrawalAccountHolder.trim(),
          p_user_note: withdrawalNote.trim() || null,
        },
      );

      if (error) throw error;

      await Promise.all([refreshProfile(), loadWithdrawalData()]);
      resetWithdrawalForm();
      setWithdrawalModalVisible(false);

      ActionModal.show({
        title: "Talep Olusturuldu",
        message: "Nakit cekim talebiniz admin onayina gonderildi.",
        type: "success",
      });
    } catch (err: any) {
      console.error("Create withdrawal request error:", err);
      ActionModal.show({
        title: "Hata",
        message: err.message || "Nakit cekim talebi olusturulamadi.",
        type: "error",
      });
    } finally {
      setCreatingWithdrawal(false);
    }
  };

  // Highlight user profile
  const handleHighlightProfile = async () => {
    if (!profile) return;

    // 1. Check if user has enough diamonds
    if ((profile.diamonds ?? 0) < profileHighlightCost) {
      ActionModal.show({
        title: (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: colors.text }}>Yetersiz Elmas</Text>
            <Ionicons name="diamond" size={20} color="#BCADDC" />
          </View>
        ),
        message: `Profilinizi öne çıkarmak için ${profileHighlightCost} elmas gereklidir. Mevcut bakiyeniz: ${profile.diamonds ?? 0} elmas.\n\nBakiye yüklemek için Elmas Mağazası'na gitmek ister misiniz?`,
        type: "warning",
        buttons: [
          { text: "İptal", style: "cancel" },
          {
            text: "Elmas Yükle",
            onPress: () => {
              setHighlightsModalVisible(false);
              setBankModalVisible(true);
            },
          },
        ],
      });
      return;
    }

    // 2. Confirmation modal
    ActionModal.show({
      title: (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: colors.text }}>Profilini Öne Çıkar</Text>
          <Ionicons name="star" size={20} color="#D5B075" />
        </View>
      ),
      message: `Profilinizi 24 saat boyunca keşfet sayfasının en üst sırasına sabitlemek için ${profileHighlightCost} elmas kullanılacaktır. Onaylıyor musunuz?`,
      type: "warning",
      buttons: [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Öne Çıkar",
          onPress: async () => {
            if (boostLock.current) return;
            boostLock.current = true;
            boostRequest.current ||= requestId();
            try {
              setLoading(true);
              const { error } = await supabase.rpc("boost_profile", {
                p_request_id: boostRequest.current,
              });

              if (error) throw error;

              await refreshProfile();
              boostRequest.current = null;

              ActionModal.show({
                title: (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 18, fontWeight: "bold", color: colors.text }}>Tebrikler!</Text>
                    <MaterialCommunityIcons name="party-popper" size={20} color={colors.primary} />
                  </View>
                ),
                message: "Profiliniz başarıyla 24 saatliğine öne çıkarıldı.",
                type: "success",
              });
            } catch (err: any) {
              console.error("Highlight profile error:", err);
              ActionModal.show({
                title: "Hata",
                message: err.message || "Öne çıkarma işlemi başarısız oldu.",
                type: "error",
              });
            } finally {
              boostLock.current = false;
              setLoading(false);
            }
          },
        },
      ],
    });
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: scheme === "dark" ? "#0D1728" : "#EFE7E0" },
      ]}
      edges={["top"]}
    >
      <View style={{ flexDirection: 'row', padding: 18, justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => setBankModalVisible(true)}><View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Ionicons name="diamond-outline" size={18} color={colors.primary} /><Text style={{ color: colors.primary }}>{profile?.diamonds || 0} elmas</Text></View></TouchableOpacity>
        <TouchableOpacity onPress={() => setNotificationsModalVisible(true)}><Text style={{ color: colors.primary }}>Bildirimler</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/social')}><Text style={{ color: colors.primary }}>Gizlilik</Text></TouchableOpacity>
      </View>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[
            styles.circleBtn,
            { backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF" },
          ]}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.circleBtn,
            { backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF" },
          ]}
          onPress={() => setQrModalVisible(true)}
        >
          <Ionicons name="qr-code-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
        <ProfileHero name={profile?.username || 'Profiliniz'} uri={avatarUri || profile?.avatar_url} bio={profile?.bio} verified={!!profile?.email_verified_at} onEdit={() => setEditProfileVisible(true)} />
        {user && <SocialPanel userId={user.id} />}

        <Text
          style={[styles.sectionTitleText, { color: colors.textSecondary }]}
        >
          Ayarlar
        </Text>

        {/* Card 1 */}
        <View
          style={[
            styles.card,
            { backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF" },
          ]}
        >
          {/* Abonelik */}
          <TouchableOpacity
            style={[
              styles.item,
              {
                borderBottomColor: scheme === "dark" ? "#23304A" : "#EFE7E0",
              },
            ]}
            onPress={() => setVipModalVisible(true)}
          >
            <View style={[styles.iconCircle, { backgroundColor: "#F59E0B" }]}>
              <Ionicons name="ribbon" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Abonelik
              </Text>
              <Text
                style={[styles.rowSubtitle, { color: colors.textSecondary }]}
              >
                VIP Gold paketlerini ve durumunu incele
              </Text>
            </View>
            {profile?.is_vip && (
              <View
                style={{
                  backgroundColor: "#F59E0B20",
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 8,
                  marginRight: 8,
                }}
              >
                <Text
                  style={{ color: "#F59E0B", fontSize: 11, fontWeight: "bold" }}
                >
                  VIP Gold
                </Text>
              </View>
            )}
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Profili Öne Çıkar */}
          <TouchableOpacity
            style={[
              styles.item,
              {
                borderBottomColor: scheme === "dark" ? "#23304A" : "#EFE7E0",
              },
            ]}
            onPress={() => setHighlightsModalVisible(true)}
          >
            <View style={[styles.iconCircle, { backgroundColor: "#D5B075" }]}>
              <Ionicons name="star" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Profilimi Öne Çıkar
              </Text>
              <Text
                style={[styles.rowSubtitle, { color: colors.textSecondary }]}
              >
                Profilinizi keşfet sayfasında yukarıya sabitleyin
              </Text>
            </View>
            {profile?.is_highlighted && (
              <View
                style={{
                  backgroundColor: "#D5B07520",
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 8,
                  marginRight: 8,
                }}
              >
                <Text
                  style={{ color: "#D5B075", fontSize: 11, fontWeight: "bold" }}
                >
                  Aktif
                </Text>
              </View>
            )}
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Bildirimler */}
          <TouchableOpacity
            style={[
              styles.item,
              {
                borderBottomColor: scheme === "dark" ? "#23304A" : "#EFE7E0",
              },
              !cashWithdrawalEnabled && { borderBottomWidth: 0 },
            ]}
            onPress={() => setNotificationsModalVisible(true)}
          >
            <View style={[styles.iconCircle, { backgroundColor: "#3B82F6" }]}>
              <Ionicons name="notifications" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Bildirimler
              </Text>
              <Text
                style={[styles.rowSubtitle, { color: colors.textSecondary }]}
              >
                Hepsini gör veya bildirim ayarlarını düzenle
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Taleplerim */}
          {cashWithdrawalEnabled && (
            <TouchableOpacity
              style={[styles.item, { borderBottomWidth: 0 }]}
              onPress={() => setRequestsModalVisible(true)}
            >
              <View style={[styles.iconCircle, { backgroundColor: "#10B981" }]}>
                <Ionicons name="cash" size={18} color="#FFFFFF" />
              </View>
              <View style={styles.rowInfo}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  Taleplerim
                </Text>
                <Text
                  style={[styles.rowSubtitle, { color: colors.textSecondary }]}
                >
                  Geçmiş kazanç ödeme isteklerinin durumları
                </Text>
              </View>
              {withdrawalRequests.filter((r) => r.status === "pending").length >
                0 && (
                <View
                  style={{
                    backgroundColor: "#10B98120",
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 8,
                  }}
                >
                  <Text
                    style={{
                      color: "#10B981",
                      fontSize: 11,
                      fontWeight: "bold",
                    }}
                  >
                    {
                      withdrawalRequests.filter((r) => r.status === "pending")
                        .length
                    }
                  </Text>
                </View>
              )}
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Card 2 */}
        <View
          style={[
            styles.card,
            { backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF" },
          ]}
        >
          {/* Hesap */}
          <TouchableOpacity
            style={[
              styles.item,
              {
                borderBottomColor: scheme === "dark" ? "#23304A" : "#EFE7E0",
              },
            ]}
            onPress={() => setEditProfileVisible(true)}
          >
            <View style={[styles.iconCircle, { backgroundColor: "#6366F1" }]}>
              <Ionicons name="person-circle" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Hesap Bilgileri
              </Text>
              <Text
                style={[styles.rowSubtitle, { color: colors.textSecondary }]}
              >
                Kullanıcı adı, yaş, biyografi ve ilgi alanları
              </Text>
            </View>
            {!profile?.is_verified && (
              <View
                style={{
                  backgroundColor: "#EF444420",
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 8,
                  marginRight: 8,
                }}
              >
                <Text
                  style={{ color: "#EF4444", fontSize: 11, fontWeight: "bold" }}
                >
                  Doğrula
                </Text>
              </View>
            )}
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Gizlilik */}
          <TouchableOpacity
            style={[
              styles.item,
              {
                borderBottomColor: scheme === "dark" ? "#23304A" : "#EFE7E0",
              },
            ]}
            onPress={() => setPrivacyModalVisible(true)}
          >
            <View style={[styles.iconCircle, { backgroundColor: "#EF4444" }]}>
              <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Gizlilik ve Güvenlik
              </Text>
              <Text
                style={[styles.rowSubtitle, { color: colors.textSecondary }]}
              >
                Engellediğiniz kullanıcılar listesi ve gizlilik
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Sohbetler */}
          <TouchableOpacity
            style={[
              styles.item,
              {
                borderBottomColor: scheme === "dark" ? "#23304A" : "#EFE7E0",
              },
            ]}
            onPress={() => setThemeModalVisible(true)}
          >
            <View style={[styles.iconCircle, { backgroundColor: "#8B5CF6" }]}>
              <Ionicons name="chatbubble" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Sohbet Teması
              </Text>
              <Text
                style={[styles.rowSubtitle, { color: colors.textSecondary }]}
              >
                Açık, koyu veya otomatik sistem görünümü
              </Text>
            </View>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                marginRight: 8,
              }}
            >
              {themeSetting === "light"
                ? "Açık"
                : themeSetting === "dark"
                  ? "Koyu"
                  : "Sistem"}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Banka ve Hesap */}
          <TouchableOpacity
            style={[styles.item, { borderBottomWidth: 0 }]}
            onPress={() => setBankModalVisible(true)}
          >
            <View style={[styles.iconCircle, { backgroundColor: "#F43F5E" }]}>
              <Ionicons name="card" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Banka ve Elmas Hesabı
              </Text>
              <Text
                style={[styles.rowSubtitle, { color: colors.textSecondary }]}
              >
                Banka bilgilerini ve elmas bakiyesini yönetin
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#BCADDC20",
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8,
                marginRight: 8,
                gap: 2,
              }}
            >
              <Ionicons name="diamond" size={10} color="#BCADDC" />
              <Text
                style={{ color: "#BCADDC", fontWeight: "bold", fontSize: 11 }}
              >
                {profile?.diamonds ?? 0}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Admin Panel Button */}
        {profile?.role === "admin" && (
          <TouchableOpacity
            style={[
              styles.adminButton,
              {
                borderColor: colors.primary,
                backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
              },
            ]}
            onPress={() => router.push("/admin")}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Ionicons
                name="shield-checkmark"
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.adminButtonText, { color: colors.primary }]}>
                Yönetici Paneli
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Log out & Delete Account Buttons */}
        <View style={{ gap: 12, marginTop: 16 }}>
          <TouchableOpacity
            style={[
              styles.logoutButton,
              {
                backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                borderColor: colors.border,
              },
            ]}
            onPress={() => { void signOut().catch(error => ActionModal.show({ title: 'Çıkış tamamlanamadı', message: error.message || 'Bildirim kaydı temizlenemedi. Bağlantınızı kontrol edip tekrar deneyin.' })); }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.textSecondary} />
              <Text style={[styles.logoutButtonText, { color: colors.textSecondary }]}>Oturumu Kapat</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.logoutButton,
              {
                backgroundColor: scheme === "dark" ? "#1F1315" : "#FEF2F2",
                borderColor: "#EF4444",
              },
            ]}
            onPress={handleDeleteAccount}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.logoutButtonText, { color: "#EF4444" }]}>Hesabımı Sil</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 1. QR Code Modal */}
      <Modal
        visible={qrModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF" },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Profil QR Kodunuz
              </Text>
              <TouchableOpacity onPress={() => setQrModalVisible(false)}>
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.qrContainer}>
              <Ionicons name="qr-code-outline" size={220} color={colors.text} />
              <View style={styles.qrAvatarContainer}>
                {avatarUri ? (
                  <ExpoImage
                    source={{ uri: avatarUri }}
                    style={styles.qrAvatar}
                    contentFit="cover"
                  />
                ) : profile?.avatar_url ? (
                  <ExpoImage
                    source={{ uri: profile.avatar_url }}
                    style={styles.qrAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.qrAvatarPlaceholder,
                      { backgroundColor: colors.backgroundSelected },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "bold",
                        color: colors.text,
                      }}
                    >
                      {username?.charAt(0)?.toUpperCase() || "U"}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <Text style={[styles.qrUsername, { color: colors.text }]}>
              @{username}
            </Text>
            <Text style={[styles.qrDesc, { color: colors.textSecondary }]}>
              Bu QR kodu okutarak profilime ulaşabilirsin.
            </Text>

            <TouchableOpacity
              style={[
                styles.modalSaveButton,
                { backgroundColor: colors.action },
              ]}
              onPress={() => setQrModalVisible(false)}
            >
              <Text style={styles.modalSaveButtonText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 2. Abonelik Modal (VIP Gold) */}
      <Modal
        visible={vipModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setVipModalVisible(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <View
            style={[
              styles.bottomSheetContent,
              {
                backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              },
            ]}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>
                VIP Gold Ayrıcalıkları
              </Text>
              <TouchableOpacity onPress={() => setVipModalVisible(false)}>
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.vipPromoContainer}>
                <Ionicons name="ribbon" size={60} color="#F59E0B" />
                <Text style={[styles.vipPromoTitle, { color: colors.text }]}>
                  Sınırsız Sohbet & Eşleşme
                </Text>
                <Text
                  style={[styles.vipPromoDesc, { color: colors.textSecondary }]}
                >
                  VIP Gold üye olarak sınırsız sesli eşleşme, aramalarda
                  öncelikli sıralama ve özel profil rozeti kazanın.
                </Text>
              </View>

              <View
                style={[
                  styles.vipStatusCard,
                  {
                    backgroundColor: scheme === "dark" ? "#23304A" : "#EFE7E0",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.vipStatusLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  Mevcut Abonelik Durumu:
                </Text>
                {profile?.is_vip ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 4,
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#10B981"
                    />
                    <Text
                      style={{
                        color: "#10B981",
                        fontWeight: "bold",
                        fontSize: 16,
                      }}
                    >
                      VIP Gold Aktif
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: "bold",
                      fontSize: 16,
                      marginTop: 4,
                    }}
                  >
                    Normal Üye
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.vipToggleButton,
                  { backgroundColor: profile?.is_vip ? "#EF4444" : "#F59E0B" },
                ]}
                onPress={() => {
                  handleUpgradeVip();
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.vipToggleButtonText}>
                    {profile?.is_vip
                      ? "VIP Üyelik Bilgileri"
                      : "VIP Üyelik Bilgileri"}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 3. Profil Öne Çıkarma Modal */}
      <Modal
        visible={highlightsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setHighlightsModalVisible(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <View
            style={[
              styles.bottomSheetContent,
              {
                backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              },
            ]}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>
                Profilimi Öne Çıkar ⭐
              </Text>
              <TouchableOpacity
                onPress={() => setHighlightsModalVisible(false)}
              >
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Dynamic Status Card */}
              {profile?.is_highlighted && profile?.highlighted_until ? (
                <View
                  style={{
                    backgroundColor: scheme === "dark" ? "#2C2001" : "#FEF3C7",
                    borderRadius: 16,
                    padding: 16,
                    alignItems: "center",
                    borderWidth: 1.2,
                    borderColor: "#D5B075",
                    marginBottom: 20,
                  }}
                >
                  <Ionicons
                    name="star"
                    size={36}
                    color="#D5B075"
                    style={{ marginBottom: 8 }}
                  />
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: "bold",
                      fontSize: 18,
                      marginBottom: 4,
                    }}
                  >
                    Profiliniz Öne Çıkarıldı!
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 13,
                      textAlign: "center",
                      lineHeight: 18,
                    }}
                  >
                    Profiliniz şu anda Keşfet sayfasının en üst kısmında
                    sabitlenmiş durumda.
                  </Text>
                  <View
                    style={{
                      backgroundColor: "#D5B075",
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 12,
                      marginTop: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontWeight: "bold",
                        fontSize: 13,
                      }}
                    >
                      Bitiş:{" "}
                      {new Date(profile.highlighted_until).toLocaleString(
                        "tr-TR",
                        {
                          day: "numeric",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </Text>
                  </View>
                </View>
              ) : (
                <View
                  style={{
                    backgroundColor: scheme === "dark" ? "#1A202E" : "#F3F4F6",
                    borderRadius: 16,
                    padding: 20,
                    alignItems: "center",
                    marginBottom: 20,
                  }}
                >
                  <Ionicons
                    name="star-outline"
                    size={36}
                    color={colors.textSecondary}
                    style={{ marginBottom: 8 }}
                  />
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: "bold",
                      fontSize: 16,
                      marginBottom: 4,
                    }}
                  >
                    Öne Çıkarma Pasif
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 13,
                      textAlign: "center",
                    }}
                  >
                    Profiliniz keşfet sayfasında normal sıralamasında
                    gösteriliyor.
                  </Text>
                </View>
              )}

              {/* Benefits Section */}
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "bold",
                  fontSize: 15,
                  marginBottom: 12,
                }}
              >
                Neden Öne Çıkarmalısınız?
              </Text>

              <View style={{ gap: 12, marginBottom: 24 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: "#D5B07520",
                      padding: 6,
                      borderRadius: 8,
                    }}
                  >
                    <Ionicons name="rocket-outline" size={18} color="#D5B075" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "bold",
                        fontSize: 14,
                        marginBottom: 2,
                      }}
                    >
                      Maksimum Görünürlük
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      Keşfet sayfasını ziyaret eden tüm kullanıcılar sizi
                      listenin en başında görür.
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: "#D5B07520",
                      padding: 6,
                      borderRadius: 8,
                    }}
                  >
                    <Ionicons
                      name="chatbubbles-outline"
                      size={18}
                      color="#D5B075"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "bold",
                        fontSize: 14,
                        marginBottom: 2,
                      }}
                    >
                      Yeni sohbetlere yer aç
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      Daha fazla sohbete başlayın, yeni arkadaşlarla tanışma
                      fırsatı yakalayın.
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: "#D5B07520",
                      padding: 6,
                      borderRadius: 8,
                    }}
                  >
                    <Ionicons
                      name="sparkles-outline"
                      size={18}
                      color="#D5B075"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "bold",
                        fontSize: 14,
                        marginBottom: 2,
                      }}
                    >
                      Öne Çıkan Rozeti
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      Profil kartınızın üzerinde dikkat çekici altın renkli
                      yıldız rozeti gösterilir.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Purchase Button / Status info */}
              <TouchableOpacity
                style={{
                  backgroundColor: "#D5B075",
                  paddingVertical: 14,
                  borderRadius: 16,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                  shadowColor: "#D5B075",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                  opacity: loading ? 0.7 : 1,
                }}
                disabled={loading}
                onPress={handleHighlightProfile}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="diamond" size={18} color="#FFFFFF" />
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontWeight: "bold",
                        fontSize: 15,
                      }}
                    >
                      {profile?.is_highlighted
                        ? `${profileHighlightCost} Elmas ile Süreyi Uzat (+24sa)`
                        : `${profileHighlightCost} Elmas ile Öne Çıkar (24sa)`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 11,
                  textAlign: "center",
                  marginTop: 12,
                }}
              >
                Mevcut Bakiyeniz: {profile?.diamonds ?? 0} Elmas
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 4. Bildirimler Modal */}
      <Modal
        visible={notificationsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setNotificationsModalVisible(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <View
            style={[
              styles.bottomSheetContent,
              {
                backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              },
            ]}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>
                Bildirim Ayarları
              </Text>
              <TouchableOpacity
                onPress={() => setNotificationsModalVisible(false)}
              >
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text
                style={[
                  styles.sectionDesc,
                  { color: colors.textSecondary, marginBottom: 16 },
                ]}
              >
                Uygulama içi bildirim tercihlerinizi buradan
                özelleştirebilirsiniz.
              </Text>

              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                    marginHorizontal: 0,
                    paddingVertical: 8,
                  },
                ]}
              >
                {[
                  {
                    id: "match",
                    title: "Yeni Eşleşmeler",
                    desc: "Yeni bir eşleşme olduğunda bildir",
                  },
                  {
                    id: "msg",
                    title: "Mesajlar",
                    desc: "Yeni bir mesaj geldiğinde bildir",
                  },
                  {
                    id: "call",
                    title: "Arama İstekleri",
                    desc: "Sesli veya görüntülü arama isteklerini bildir",
                  },
                  {
                    id: "promo",
                    title: "Kampanyalar ve Fırsatlar",
                    desc: "Elmas indirimleri ve özel VIP fırsatlarını bildir",
                  },
                ].map((item, idx) => {
                  // @ts-ignore
                  const isEnabled = profile?.[settingKeyMap[item.id]] !== false;

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.notificationOptionItem,
                        {
                          borderBottomWidth: idx === 3 ? 0 : 1,
                          borderBottomColor:
                            scheme === "dark" ? "#23304A" : "#ECECEC",
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.notificationOptionTitle,
                            { color: colors.text },
                          ]}
                        >
                          {item.title}
                        </Text>
                        <Text
                          style={[
                            styles.notificationOptionDesc,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {item.desc}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleToggleSetting(item.id)}
                        style={{
                          width: 50,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: isEnabled ? "#10B981" : "#D1D5DB",
                          justifyContent: "center",
                          paddingHorizontal: 2,
                        }}
                      >
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            backgroundColor: "white",
                            alignSelf: isEnabled ? "flex-end" : "flex-start",
                          }}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 5. Taleplerim Modal */}
      <Modal
        visible={requestsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setRequestsModalVisible(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <View
            style={[
              styles.bottomSheetContent,
              {
                backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              },
            ]}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>
                Nakit Çekim Taleplerim
              </Text>
              <TouchableOpacity onPress={() => setRequestsModalVisible(false)}>
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text
                style={[
                  styles.sectionDesc,
                  { color: colors.textSecondary, marginBottom: 16 },
                ]}
              >
                Elmaslarınızı nakite çevirmek için gönderdiğiniz taleplerin
                durumunu buradan inceleyebilirsiniz.
              </Text>

              {withdrawalRequests.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {withdrawalRequests.map((request) => (
                    <View
                      key={request.id}
                      style={{
                        backgroundColor:
                          scheme === "dark" ? "#23304A" : "#F8FAFC",
                        borderColor: colors.border,
                        borderWidth: 1,
                        borderRadius: 16,
                        padding: 16,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: colors.text,
                            fontWeight: "bold",
                            fontSize: 16,
                          }}
                        >
                          {request.diamond_amount} Elmas
                        </Text>
                        <View
                          style={{
                            backgroundColor:
                              getWithdrawalStatusColor(request.status) + "20",
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 8,
                          }}
                        >
                          <Text
                            style={{
                              color: getWithdrawalStatusColor(request.status),
                              fontSize: 12,
                              fontWeight: "bold",
                            }}
                          >
                            {getWithdrawalStatusLabel(request.status)}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: 13,
                          marginTop: 8,
                        }}
                      >
                        Kazancınız:{" "}
                        {Number(request.user_cash_amount).toFixed(2)} TL |
                        Banka: {request.bank_name}
                      </Text>
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: 11,
                          marginTop: 4,
                        }}
                      >
                        Tarih:{" "}
                        {new Date(request.created_at).toLocaleDateString(
                          "tr-TR",
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ paddingVertical: 48, alignItems: "center" }}>
                  <Ionicons
                    name="list-outline"
                    size={48}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={{
                      color: colors.textSecondary,
                      marginTop: 12,
                      fontSize: 14,
                    }}
                  >
                    Henüz bir çekim talebiniz bulunmuyor.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 6. Hesap Modal (Edit Profile) */}
      <Modal
        visible={editProfileVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditProfileVisible(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <View
            style={[
              styles.bottomSheetContent,
              {
                backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              },
            ]}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>
                Profil Bilgileri
              </Text>
              <TouchableOpacity onPress={() => setEditProfileVisible(false)}>
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Takma Ad */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Takma Ad
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor:
                        scheme === "dark" ? "#23304A" : "#EFE7E0",
                      borderColor: colors.border,
                    },
                  ]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Kullanıcı adı girin"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                />
              </View>

              {/* Bio */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Durum / Bio
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor:
                        scheme === "dark" ? "#23304A" : "#EFE7E0",
                      borderColor: colors.border,
                    },
                  ]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Kendinden bahset..."
                  placeholderTextColor={colors.textSecondary}
                  maxLength={100}
                />
              </View>

              {/* Yaş */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Yaş
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor:
                        scheme === "dark" ? "#23304A" : "#EFE7E0",
                      borderColor: colors.border,
                    },
                  ]}
                  value={age}
                  onChangeText={setAge}
                  placeholder="Yaşınızı girin"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>

              {/* Cinsiyet */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Cinsiyet
                </Text>
                <View style={styles.genderRow}>
                  {(
                    [
                      {
                        value: "female",
                        label: "Kadın",
                        icon: AppIcons.female,
                      },
                      { value: "male", label: "Erkek", icon: AppIcons.male },
                    ] as const
                  ).map((opt) => {
                    const selected = gender === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.genderPill,
                          {
                            backgroundColor: selected
                              ? colors.primary + "20"
                              : scheme === "dark"
                                ? "#23304A"
                                : "#EFE7E0",
                            borderColor: selected
                              ? colors.primary
                              : colors.border,
                          },
                        ]}
                        onPress={() =>
                          setGender((prev) =>
                            prev === opt.value ? null : opt.value,
                          )
                        }
                      >
                        <Ionicons
                          name={opt.icon}
                          size={18}
                          color={
                            selected ? colors.primary : colors.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.genderPillText,
                            { color: selected ? colors.primary : colors.text },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Ülke */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Ülke
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor:
                        scheme === "dark" ? "#23304A" : "#EFE7E0",
                      borderColor: colors.border,
                    },
                  ]}
                  value={country}
                  onChangeText={setCountry}
                  placeholder="Ülke girin"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={30}
                />
              </View>

              {/* Dil */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Konuşulan Dil
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor:
                        scheme === "dark" ? "#23304A" : "#EFE7E0",
                      borderColor: colors.border,
                    },
                  ]}
                  value={language}
                  onChangeText={setLanguage}
                  placeholder="Dil girin"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={40}
                />
              </View>

              {/* Hobiler */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Hobiler (Virgülle ayırın)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor:
                        scheme === "dark" ? "#23304A" : "#EFE7E0",
                      borderColor: colors.border,
                    },
                  ]}
                  value={hobbies}
                  onChangeText={setHobbies}
                  placeholder="örn. Spor, Kitap, Müzik"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={150}
                />
              </View>

              <TouchableOpacity onPress={handlePickAvatar} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.backgroundSelected, marginBottom: 16 }}><Text style={{ color: colors.text }}>Profil fotoğrafını değiştir</Text></TouchableOpacity>
              <InstagramEditor />
              <View style={{ padding: 16, gap: 12 }}>
                <Text style={{ color: colors.text }}>E-posta doğrulaması</Text>
                <Text style={{ color: colors.textSecondary }}>{profile?.email_verified_at ? 'E-posta adresi doğrulandı ✓' : 'E-posta doğrulaması bekleniyor'}</Text>
                <Text style={{ color: colors.textSecondary }}>Bu rozet e-posta sahipliğini gösterir; kimlik doğrulaması değildir.</Text>
                <TouchableOpacity onPress={async () => {
                  if (!user?.email) return;
                  const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
                  ActionModal.show({ title: error ? 'Gönderilemedi' : 'E-postanızı kontrol edin', message: error?.message || 'Doğrulama bağlantısını gelen kutusu ve spam klasöründe kontrol edin.' });
                }}><Text style={{ color: colors.primary }}>Doğrulama e-postasını yeniden gönder</Text></TouchableOpacity>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: colors.action, marginTop: 24 },
                ]}
                onPress={async () => {
                  await handleSave();
                }}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Bilgileri Güncelle</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 7. Gizlilik Modal */}
      <Modal
        visible={privacyModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPrivacyModalVisible(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <View
            style={[
              styles.bottomSheetContent,
              {
                backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              },
            ]}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>
                Gizlilik Ayarları
              </Text>
              <TouchableOpacity onPress={() => setPrivacyModalVisible(false)}>
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text
                style={[
                  styles.sectionDesc,
                  { color: colors.textSecondary, marginBottom: 16 },
                ]}
              >
                Profilinizin görünürlük ve gizlilik ayarlarını buradan
                yönetebilirsiniz.
              </Text>

              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                    marginHorizontal: 0,
                    paddingVertical: 8,
                  },
                ]}
              >
                {[
                  {
                    id: "online",
                    title: "Çevrimiçi Durumu Göster",
                    desc: "Diğer kullanıcılar çevrimiçi olduğunuzu görebilir",
                  },
                  {
                    id: "profile",
                    title: "Aramalarda Göster",
                    desc: "Rastgele aramalarda profiliniz eşleşmeye dahil edilir",
                  },
                  {
                    id: "receipt",
                    title: "Okundu Bilgisi",
                    desc: "Mesajların okunduğunu karşı tarafa göster",
                  },
                ].map((item, idx) => {
                  // @ts-ignore
                  const isEnabled = profile?.[settingKeyMap[item.id]] !== false;

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.notificationOptionItem,
                        {
                          borderBottomWidth: idx === 2 ? 0 : 1,
                          borderBottomColor:
                            scheme === "dark" ? "#23304A" : "#ECECEC",
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.notificationOptionTitle,
                            { color: colors.text },
                          ]}
                        >
                          {item.title}
                        </Text>
                        <Text
                          style={[
                            styles.notificationOptionDesc,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {item.desc}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleToggleSetting(item.id)}
                        style={{
                          width: 50,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: isEnabled ? "#10B981" : "#D1D5DB",
                          justifyContent: "center",
                          paddingHorizontal: 2,
                        }}
                      >
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            backgroundColor: "white",
                            alignSelf: isEnabled ? "flex-end" : "flex-start",
                          }}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 8. Sohbetler Modal (Theme Settings) */}
      <Modal
        visible={themeModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <View
            style={[
              styles.bottomSheetContent,
              {
                backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              },
            ]}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>
                Tema & Görünüm
              </Text>
              <TouchableOpacity onPress={() => setThemeModalVisible(false)}>
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text
                style={[
                  styles.sectionDesc,
                  { color: colors.textSecondary, marginBottom: 16 },
                ]}
              >
                Uygulamanın görünümünü özelleştirin. Açık, Koyu veya Sistem
                temasını seçebilirsiniz.
              </Text>

              <View style={styles.themeRow}>
                {(
                  [
                    {
                      value: "system",
                      label: "Sistem",
                      icon: "contrast-outline",
                    },
                    { value: "light", label: "Açık", icon: "sunny-outline" },
                    { value: "dark", label: "Koyu", icon: "moon-outline" },
                  ] as const
                ).map((opt) => {
                  const selected = themeSetting === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.themePill,
                        {
                          backgroundColor: selected
                            ? colors.primary + "20"
                            : scheme === "dark"
                              ? "#23304A"
                              : "#FFFFFF",
                          borderColor: selected
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                      onPress={() => setThemeSetting(opt.value)}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={18}
                        color={selected ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.themePillText,
                          { color: selected ? colors.primary : colors.text },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 9. Banka ve Hesap Modal (Diamond Store) */}
      <Modal
        visible={bankModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setBankModalVisible(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <View
            style={[
              styles.bottomSheetContent,
              {
                backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              },
            ]}
          >
            <View style={styles.bottomSheetHeader}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons name="diamond-outline" size={20} color="#BCADDC" />
                <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>
                  Elmas Mağazası
                </Text>
              </View>
              <TouchableOpacity onPress={() => setBankModalVisible(false)}>
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Balance Card */}
              <View
                style={{
                  backgroundColor: scheme === "dark" ? "#251b3a" : "#f5f0ff",
                  padding: 16,
                  borderRadius: 16,
                  alignItems: "center",
                  marginBottom: 16,
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <View>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    Toplam Elmas Bakiyeniz
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 4,
                    }}
                  >
                    <Ionicons name="diamond" size={24} color="#BCADDC" />
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 28,
                        fontWeight: "bold",
                      }}
                    >
                      {profile?.diamonds ?? 0}
                    </Text>
                  </View>
                </View>

                {/* Cashout Button */}
                {cashWithdrawalEnabled && (
                  <TouchableOpacity
                    onPress={() => setWithdrawalModalVisible(true)}
                    style={{
                      backgroundColor: "#10B981",
                      borderRadius: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons name="cash-outline" size={18} color="#FFF" />
                    <Text
                      style={{
                        color: "#FFF",
                        fontWeight: "bold",
                        fontSize: 14,
                      }}
                    >
                      Nakite Çevir
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text
                style={[
                  styles.sectionDesc,
                  { color: colors.textSecondary, marginBottom: 16 },
                ]}
              >
                Paket seçerek veya hediye göndererek elmas bakiyenizi artırın.
              </Text>

              {/* Diamond Packages Grid */}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 24,
                }}
              >
                {diamondPackages.map((pkg) => (
                  <TouchableOpacity
                    key={pkg.id}
                    onPress={() => {
                      setSelectedPackage({
                        id: pkg.id,
                        amount: pkg.amount,
                        price: pkg.price,
                        badge: pkg.badge,
                      });
                      setPaymentModalVisible(true);
                    }}
                    style={{
                      flex: 1,
                      minWidth: "45%",
                      backgroundColor:
                        scheme === "dark" ? "#1E1B3A" : "#F3F0FF",
                      borderRadius: 14,
                      paddingVertical: 14,
                      paddingHorizontal: 10,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: pkg.badge
                        ? getBadgeColor(pkg.badge) + "50"
                        : "#BCADDC30",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {pkg.badge && (
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          backgroundColor: getBadgeColor(pkg.badge),
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderBottomLeftRadius: 10,
                        }}
                      >
                        {getBadgeLabel(pkg.badge)}
                      </View>
                    )}
                    <Ionicons name="diamond" size={24} color="#BCADDC" />
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "bold",
                        fontSize: 16,
                        marginTop: 4,
                      }}
                    >
                      {pkg.amount}
                    </Text>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      Mağaza fiyatı ödeme ekranında
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 10. WebView Authentication Modal */}


      {/* 11. Diamond Withdrawal Modal */}
      <Modal
        visible={withdrawalModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setWithdrawalModalVisible(false)}
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
              padding: Spacing.five,
              paddingBottom: Math.max(insets.bottom, 16) + Spacing.four,
              maxHeight: "88%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: Spacing.four,
              }}
            >
              <Text
                style={{ color: colors.text, fontSize: 20, fontWeight: "bold" }}
              >
                Elmas Nakite Çevir
              </Text>
              <TouchableOpacity
                onPress={() => setWithdrawalModalVisible(false)}
              >
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View
                style={{
                  backgroundColor: scheme === "dark" ? "#10261E" : "#ECFDF5",
                  borderRadius: 16,
                  padding: Spacing.four,
                  marginBottom: Spacing.four,
                }}
              >
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    marginBottom: 6,
                  }}
                >
                  Kullanıcı payı
                </Text>
                <Text
                  style={{
                    color: "#10B981",
                    fontSize: 26,
                    fontWeight: "bold",
                  }}
                >
                  {estimatedUserCash.toFixed(2)} TL
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    marginTop: 6,
                  }}
                >
                  Toplam değer {estimatedGrossCash.toFixed(2)} TL | Uygulama
                  payı {estimatedAppCash.toFixed(2)} TL
                </Text>
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Çekilecek Elmas
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    marginBottom: Spacing.three,
                  },
                ]}
                placeholder={`Maksimum ${profile?.diamonds ?? 0}`}
                placeholderTextColor={colors.textSecondary}
                value={withdrawalAmount}
                onChangeText={setWithdrawalAmount}
                keyboardType="numeric"
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Banka Adı
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    marginBottom: Spacing.three,
                  },
                ]}
                placeholder="Banka adı"
                placeholderTextColor={colors.textSecondary}
                value={withdrawalBankName}
                onChangeText={setWithdrawalBankName}
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                IBAN
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    marginBottom: Spacing.three,
                  },
                ]}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                placeholderTextColor={colors.textSecondary}
                value={withdrawalIban}
                onChangeText={setWithdrawalIban}
                autoCapitalize="characters"
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Hesap Sahibi
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    marginBottom: Spacing.three,
                  },
                ]}
                placeholder="Ad Soyad"
                placeholderTextColor={colors.textSecondary}
                value={withdrawalAccountHolder}
                onChangeText={setWithdrawalAccountHolder}
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Not
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    height: 78,
                    textAlignVertical: "top",
                    paddingTop: 12,
                    marginBottom: Spacing.four,
                  },
                ]}
                placeholder="İsteğe bağlı"
                placeholderTextColor={colors.textSecondary}
                value={withdrawalNote}
                onChangeText={setWithdrawalNote}
                multiline
              />
            </ScrollView>

            <TouchableOpacity
              onPress={handleCreateWithdrawalRequest}
              disabled={creatingWithdrawal}
              style={{
                backgroundColor: "#10B981",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                opacity: creatingWithdrawal ? 0.6 : 1,
              }}
            >
              {creatingWithdrawal ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text
                  style={{ color: "#FFF", fontSize: 16, fontWeight: "bold" }}
                >
                  Talep Oluştur
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 12. Verified Store Checkout */}
      <Modal visible={paymentModalVisible} transparent animationType="slide" onRequestClose={() => { if (!processingPayment) setPaymentModalVisible(false); }}>
        <View style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'center', padding: 28 }}>
          <View style={{ backgroundColor: colors.background, borderRadius: 20, padding: 24, gap: 20 }}>
            <Text style={{ color: colors.text, fontSize: 22 }}>Elmas satın al</Text>
            <Text style={{ color: colors.text }}>Ödeme Google Play / App Store üzerinden yapılır. Napan kart bilgilerinizi toplamaz.</Text>
            <TouchableOpacity disabled={processingPayment} onPress={handleBuyDiamonds}><Text style={{ color: colors.primary }}>{processingPayment ? 'İşleniyor…' : 'Mağazada devam et'}</Text></TouchableOpacity>
            <TouchableOpacity disabled={processingPayment} onPress={() => setPaymentModalVisible(false)}><Text style={{ color: colors.text }}>Vazgeç</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionDesc: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  profileArea: {
    alignItems: "center",
    marginTop: 10,
  },
  statusBubble: {
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 28,
    position: "relative",
    marginBottom: 20,
    maxWidth: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statusBubbleText: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  statusBubbleTail1: {
    position: "absolute",
    bottom: -6,
    left: 50,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  statusBubbleTail2: {
    position: "absolute",
    bottom: -14,
    left: 44,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  avatar: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: "hidden",
    backgroundColor: "#d7d7d7",
    alignSelf: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  username: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 20,
    marginBottom: 10,
  },
  usernameText: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  plus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: "#0aa06e",
    alignItems: "center",
    justifyContent: "center",
  },
  plusText: {
    color: "#0aa06e",
    fontSize: 15,
    fontWeight: "bold",
    marginTop: -2,
  },
  sectionTitleText: {
    marginHorizontal: 12,
    marginTop: 32,
    marginBottom: 12,
    fontSize: 22,
    fontWeight: "700",
  },
  card: {
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  itemIcon: {
    marginRight: 16,
    width: 30,
    textAlign: "center",
  },
  itemText: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  rowSubtitle: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  adminButton: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingVertical: 14,
    marginTop: 20,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  adminButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  logoutButton: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingVertical: 14,
    marginTop: 10,
    marginBottom: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  logoutButtonText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  qrContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 20,
    position: "relative",
  },
  qrAvatarContainer: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: "white",
    overflow: "hidden",
    backgroundColor: "white",
  },
  qrAvatar: {
    width: "100%",
    height: "100%",
  },
  qrAvatarPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  qrUsername: {
    fontSize: 22,
    fontWeight: "800",
    marginTop: 10,
  },
  qrDesc: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 20,
  },
  modalSaveButton: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  modalSaveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "88%",
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  formGroup: {
    width: "100%",
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  genderRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  genderPill: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  genderPillText: {
    fontSize: 15,
    fontWeight: "600",
  },
  saveButton: {
    width: "100%",
    height: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  verifiedText: {
    fontSize: 14,
    fontWeight: "600",
  },
  verifyButton: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  verifyButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
  vipPromoContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  vipPromoTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 12,
  },
  vipPromoDesc: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  vipStatusCard: {
    padding: 16,
    borderRadius: 16,
    marginVertical: 20,
  },
  vipStatusLabel: {
    fontSize: 13,
  },
  vipToggleButton: {
    width: "100%",
    height: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  vipToggleButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  highlightsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 10,
  },
  highlightGridItem: {
    width: 80,
    height: 80,
    borderRadius: 40,
    position: "relative",
    overflow: "hidden",
  },
  highlightGridImage: {
    width: "100%",
    height: "100%",
  },
  removeHighlightBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    zIndex: 10,
    backgroundColor: "white",
    borderRadius: 10,
  },
  notificationOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  notificationOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  notificationOptionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  themeRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
  },
  themePill: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  themePillText: {
    fontSize: 14,
    fontWeight: "600",
  },
  webViewHeader: {
    height: 56,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  closeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  webViewTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  webViewLoader: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
  },
});
