import { AdminDashboardTab } from "@/components/admin/AdminDashboardTab";
import { AdminReportsTab } from "@/components/admin/AdminReportsTab";
import { AdminUsersTab } from "@/components/admin/AdminUsersTab";
import { AdminDeletedMessagesTab } from "@/components/admin/AdminDeletedMessagesTab";
import { AdminBotsTab } from "@/components/admin/AdminBotsTab";
import { AdminWithdrawalsTab } from "@/components/admin/AdminWithdrawalsTab";
import { AdminSettingsTab } from "@/components/admin/AdminSettingsTab";
import {
  Report,
  UserProfile,
  BotProfile,
  DiamondPackage,
  DiamondWithdrawalRequest,
  DeletedMessage,
} from "@/components/admin/admin.types";
import { ActionModal } from "@/components/ActionModal";
import Ionicons from "@expo/vector-icons/Ionicons";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Clipboard,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { useColorScheme } from "../hooks/use-color-scheme";
import { supabase } from "../lib/supabase";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const botSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const getVipUntilDate = (): string => {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
};

export default function AdminScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];
  const isDark = scheme === "dark";

  // Admin Section state: 'dashboard' | 'reports' | 'users' | 'deleted_messages' | 'bots' | 'withdrawals' | 'settings'
  const [activeTab, setActiveTabInternal] = useState<
    | "dashboard"
    | "reports"
    | "users"
    | "deleted_messages"
    | "bots"
    | "withdrawals"
    | "settings"
  >("dashboard");

  const [isAtMainMenu, setIsAtMainMenu] = useState(true);
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");

  const setActiveTab = (tab: typeof activeTab) => {
    setActiveTabInternal(tab);
    setSearchQuery("");
  };

  // Data lists
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [deletedMsgs, setDeletedMsgs] = useState<DeletedMessage[]>([]);
  const [bots, setBots] = useState<BotProfile[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<
    DiamondWithdrawalRequest[]
  >([]);

  // Stats
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalRealUsers: 0,
    totalBots: 0,
    onlineUsers: 0,
    vipUsers: 0,
    pendingReports: 0,
    deletedMessages: 0,
    pendingWithdrawals: 0,
  });

  // Settings
  const [voiceChatLimit, setVoiceChatLimit] = useState("180");
  const [dailyMatchLimit, setDailyMatchLimit] = useState("5");
  const [maintenanceModeActive, setMaintenanceModeActive] = useState(false);
  const [cashoutUserPercentage, setCashoutUserPercentage] = useState("50");
  const [cashWithdrawalEnabled, setCashWithdrawalEnabled] = useState(true);
  const [diamondPackages, setDiamondPackages] = useState<DiamondPackage[]>([]);
  const [packageModalVisible, setPackageModalVisible] = useState(false);
  const [editingPackage, setEditingPackage] = useState<DiamondPackage | null>(
    null,
  );
  const [packageForm, setPackageForm] = useState({
    amount: "",
    price: "",
    badge: "" as string,
    is_active: true,
    sort_order: "0",
  });

  // Filtering & Search
  const [userFilter, setUserFilter] = useState<"all" | "vip" | "banned">("all");
  const [botFilter, setBotFilter] = useState<"all" | "online" | "vip">("all");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchQueryRef = useRef(searchQuery);

  // Bot Form State
  const [botModalVisible, setBotModalVisible] = useState(false);
  const [editingBot, setEditingBot] = useState<BotProfile | null>(null);
  const [botForm, setBotForm] = useState({
    username: "",
    gender: "female" as "male" | "female",
    age: "24",
    city: "İstanbul",
    bio: "Merhaba, sohbet etmek isterim!",
    avatarUrl: "",
    isOnline: true,
    isVip: false,
  });

  // Copy to clipboard helper
  const handleCopyText = (text: string, label: string) => {
    Clipboard.setString(text);
    ActionModal.show({
      title: "Kopyalandı",
      message: `${label} panoya başarıyla kopyalandı.`,
      type: "success",
    });
  };

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // Safeguard: Redirect non-admins
  useEffect(() => {
    if (profile && profile.role !== "admin") {
      ActionModal.show({
        title: "Erişim Engellendi",
        message: "Bu ekrana yalnızca yöneticiler erişebilir.",
        type: "error",
      });
      router.replace("/" as any);
    }
  }, [profile, router]);

  // Load Data based on Active Tab
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "dashboard") {
        const [
          totalRealUsersRes,
          totalBotsRes,
          onlineUsersRes,
          vipUsersRes,
          pendingReportsRes,
          deletedMessagesRes,
          pendingWithdrawalsRes,
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("is_bot", false),
          supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("is_bot", true),
          supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("is_online", true),
          supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("is_vip", true),
          supabase
            .from("reports")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending"),
          supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .not("deleted_at", "is", null),
          supabase
            .from("diamond_withdrawal_requests")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending"),
        ]);

        setStats({
          totalUsers:
            (totalRealUsersRes.count || 0) + (totalBotsRes.count || 0),
          totalRealUsers: totalRealUsersRes.count || 0,
          totalBots: totalBotsRes.count || 0,
          onlineUsers: onlineUsersRes.count || 0,
          vipUsers: vipUsersRes.count || 0,
          pendingReports: pendingReportsRes.count || 0,
          deletedMessages: deletedMessagesRes.count || 0,
          pendingWithdrawals: pendingWithdrawalsRes.count || 0,
        });

        // Also fetch maintenance mode status for dashboard display
        const { data: maintData } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "maintenance_mode")
          .maybeSingle();
        if (maintData) {
          setMaintenanceModeActive(maintData.value === "true");
        }
      } else if (activeTab === "reports") {
        const { data, error } = await supabase
          .from("reports")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        // Fetch usernames for reporter and reported
        const reportsList = [...(data || [])];
        for (const report of reportsList) {
          const { data: rep } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", report.reporter_id)
            .maybeSingle();
          const { data: target } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", report.reported_id)
            .maybeSingle();
          report.reporter_username = rep?.username || "Bilinmiyor";
          report.reported_username = target?.username || "Bilinmiyor";
        }

        setReports(reportsList);
      } else if (activeTab === "users") {
        let query = supabase
          .from("profiles")
          .select("*")
          .eq("is_bot", false)
          .order("created_at", { ascending: false });

        const queryVal = searchQueryRef.current;
        if (queryVal.trim()) {
          query = query.ilike("username", `%${queryVal.trim()}%`);
        }

        if (userFilter === "vip") {
          query = query.eq("is_vip", true);
        } else if (userFilter === "banned") {
          query = query.not("banned_at", "is", null);
        }

        const { data, error } = await query;
        if (error) throw error;
        setUsers(data || []);
      } else if (activeTab === "bots") {
        let query = supabase
          .from("profiles")
          .select("*")
          .eq("is_bot", true)
          .order("created_at", { ascending: false });

        const queryVal = searchQueryRef.current;
        if (queryVal.trim()) {
          query = query.ilike("username", `%${queryVal.trim()}%`);
        }

        if (botFilter === "vip") {
          query = query.eq("is_vip", true);
        } else if (botFilter === "online") {
          query = query.eq("is_online", true);
        }

        const { data, error } = await query;
        if (error) throw error;
        setBots((data as unknown as BotProfile[]) || []);
      } else if (activeTab === "deleted_messages") {
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false });

        if (error) throw error;

        const msgsList = [...(data || [])];
        for (const msg of msgsList) {
          const { data: p } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", msg.sender_id)
            .maybeSingle();
          msg.sender_username = p?.username || "Bilinmiyor";
        }
        setDeletedMsgs(msgsList);
      } else if (activeTab === "withdrawals") {
        const { data, error } = await supabase
          .from("diamond_withdrawal_requests")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        const requestsList = [...((data as DiamondWithdrawalRequest[]) || [])];
        for (const request of requestsList) {
          const { data: p } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", request.user_id)
            .maybeSingle();
          request.username = p?.username || "Bilinmiyor";
        }
        setWithdrawalRequests(requestsList);
      } else if (activeTab === "settings") {
        const { data, error } = await supabase
          .from("system_settings")
          .select("*");

        if (error) throw error;
        if (data) {
          const limitSetting = data.find((s) => s.key === "voice_chat_limit");
          const dailyLimitSetting = data.find(
            (s) => s.key === "daily_match_limit",
          );
          const maintSetting = data.find((s) => s.key === "maintenance_mode");
          const cashoutPercentageSetting = data.find(
            (s) => s.key === "diamond_cashout_user_percentage",
          );
          const cashWithdrawalEnabledSetting = data.find(
            (s) => s.key === "cash_withdrawal_enabled",
          );

          if (limitSetting) setVoiceChatLimit(limitSetting.value);
          if (dailyLimitSetting) setDailyMatchLimit(dailyLimitSetting.value);
          if (maintSetting)
            setMaintenanceModeActive(maintSetting.value === "true");
          if (cashoutPercentageSetting)
            setCashoutUserPercentage(cashoutPercentageSetting.value);
          if (cashWithdrawalEnabledSetting)
            setCashWithdrawalEnabled(
              cashWithdrawalEnabledSetting.value === "true",
            );
        }

        // Load diamond packages
        const { data: pkgData, error: pkgError } = await supabase
          .from("diamond_packages")
          .select("*")
          .order("sort_order", { ascending: true });
        if (!pkgError && pkgData) {
          setDiamondPackages(pkgData);
        }
      }
    } catch (err) {
      console.error("Load data error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Veriler yüklenirken bir sorun oluştu.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    userFilter,
    botFilter,
    setLoading,
    setStats,
    setMaintenanceModeActive,
    setReports,
    setUsers,
    setBots,
    setDeletedMsgs,
    setWithdrawalRequests,
    setVoiceChatLimit,
    setDailyMatchLimit,
    setCashoutUserPercentage,
    setDiamondPackages,
  ]);

  useEffect(() => {
    if (profile?.role === "admin") {
      const timer = setTimeout(() => {
        loadData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [profile?.role, activeTab, userFilter, botFilter, loadData]);

  // Handle Search for Users tab
  const handleUserSearch = () => {
    loadData();
  };

  // Action: Ban User
  const handleBanUser = (targetUserId: string, currentBanStatus: boolean) => {
    ActionModal.show({
      title: currentBanStatus ? "Yasağı Kaldır" : "Kullanıcıyı Banla",
      message: `Bu kullanıcının erişimini ${currentBanStatus ? "açmak" : "engellemek"} istediğinize emin misiniz?`,
      type: "warning",
      buttons: [
        { text: "İptal", style: "cancel" },
        {
          text: currentBanStatus ? "Yasağı Kaldır" : "Banla",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("profiles")
                .update({
                  banned_at: currentBanStatus ? null : new Date().toISOString(),
                })
                .eq("id", targetUserId);

              if (error) throw error;
              ActionModal.show({
                title: "Başarılı",
                message: "Kullanıcı durumu güncellendi.",
                type: "success",
              });
              loadData();
            } catch (err) {
              console.error("Ban error:", err);
              ActionModal.show({
                title: "Hata",
                message: "Kullanıcı yasaklanamadı.",
                type: "error",
              });
            }
          },
        },
      ],
    });
  };

  // Action: Toggle VIP
  const handleToggleVip = async (
    targetUserId: string,
    currentVipStatus: boolean,
  ) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_vip: !currentVipStatus,
          vip_until: !currentVipStatus ? getVipUntilDate() : null,
        })
        .eq("id", targetUserId);

      if (error) throw error;
      ActionModal.show({
        title: "Başarılı",
        message: "Kullanıcı VIP durumu güncellendi.",
        type: "success",
      });
      loadData();
    } catch (err) {
      console.error("Toggle VIP error:", err);
      ActionModal.show({
        title: "Hata",
        message: "VIP durumu güncellenemedi.",
        type: "error",
      });
    }
  };

  // Action: Resolve Report
  const handleResolveReport = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from("reports")
        .update({ resolved_at: new Date().toISOString(), status: "resolved" })
        .eq("id", reportId);

      if (error) throw error;
      ActionModal.show({
        title: "Başarılı",
        message: "Şikayet çözümlendi olarak işaretlendi.",
        type: "success",
      });
      loadData();
    } catch (err) {
      console.error("Resolve report error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Şikayet güncellenemedi.",
        type: "error",
      });
    }
  };

  // Bot-related actions
  const openAddBotModal = () => {
    setEditingBot(null);
    setBotForm({
      username: "",
      gender: "female",
      age: "24",
      city: "İstanbul",
      bio: "Merhaba, sohbet etmek isterim!",
      avatarUrl: "",
      isOnline: true,
      isVip: false,
    });
    setBotModalVisible(true);
  };

  const openEditBotModal = (bot: BotProfile) => {
    setEditingBot(bot);
    setBotForm({
      username: bot.username,
      gender: (bot.gender as "male" | "female") || "female",
      age: bot.age ? String(bot.age) : "24",
      city: bot.city || "",
      bio: bot.bio || "",
      avatarUrl: bot.avatar_url || "",
      isOnline: bot.is_online,
      isVip: bot.is_vip,
    });
    setBotModalVisible(true);
  };

  const handleSaveBot = async () => {
    const usernameTrimmed = botForm.username.trim();
    if (!usernameTrimmed || usernameTrimmed.length < 3) {
      ActionModal.show({
        title: "Hata",
        message: "Kullanıcı adı en az 3 karakter olmalıdır.",
        type: "error",
      });
      return;
    }

    setLoading(true);
    try {
      if (editingBot) {
        // --- EDITING EXISTING BOT ---
        if (
          usernameTrimmed.toLowerCase() !== editingBot.username.toLowerCase()
        ) {
          const { data: existingUser } = await supabase
            .from("profiles")
            .select("id")
            .eq("username", usernameTrimmed)
            .maybeSingle();

          if (existingUser) {
            ActionModal.show({
              title: "Hata",
              message: "Bu kullanıcı adı zaten alınmış.",
              type: "error",
            });
            setLoading(false);
            return;
          }
        }

        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            username: usernameTrimmed,
            gender: botForm.gender,
            age: botForm.age ? parseInt(botForm.age) : null,
            city: botForm.city || null,
            bio: botForm.bio || null,
            avatar_url: botForm.avatarUrl || null,
            is_online: botForm.isOnline,
            is_vip: botForm.isVip,
            vip_until: botForm.isVip ? getVipUntilDate() : null,
          })
          .eq("id", editingBot.id);

        if (updateError) throw updateError;

        ActionModal.show({
          title: "Başarılı",
          message: "Bot profili güncellendi.",
          type: "success",
        });
        setBotModalVisible(false);
        loadData();
      } else {
        // --- ADDING NEW BOT ---
        const { data: existingUser } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", usernameTrimmed)
          .maybeSingle();

        if (existingUser) {
          ActionModal.show({
            title: "Hata",
            message: "Bu kullanıcı adı zaten alınmış.",
            type: "error",
          });
          setLoading(false);
          return;
        }

        const email = `${usernameTrimmed.toLowerCase()}@bot.randomchat.app`;
        const password = "bot_password_1234";

        const { data: signUpData, error: signUpError } =
          await botSupabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                username: usernameTrimmed,
              },
            },
          });

        if (signUpError) throw signUpError;
        if (!signUpData.user) {
          throw new Error("Kullanıcı oluşturulurken bir hata oluştu.");
        }

        const botId = signUpData.user.id;

        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            is_bot: true,
            gender: botForm.gender,
            age: botForm.age ? parseInt(botForm.age) : null,
            city: botForm.city || null,
            bio: botForm.bio || null,
            avatar_url: botForm.avatarUrl || null,
            is_online: botForm.isOnline,
            is_vip: botForm.isVip,
            vip_until: botForm.isVip ? getVipUntilDate() : null,
          })
          .eq("id", botId);

        if (updateError) throw updateError;

        ActionModal.show({
          title: "Başarılı",
          message: "Yeni bot hesabı oluşturuldu.",
          type: "success",
        });
        setBotModalVisible(false);
        loadData();
      }
    } catch (err: any) {
      console.error("Save bot error:", err);
      ActionModal.show({
        title: "Hata",
        message: err.message || "Bot kaydedilirken bir hata oluştu.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBot = (bot: BotProfile) => {
    ActionModal.show({
      title: "Botu Sil",
      message: `"${bot.username}" isimli bot hesabını tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      type: "warning",
      buttons: [
        { text: "İptal", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase.rpc("delete_user_by_admin", {
                target_user_id: bot.id,
              });

              if (error) throw error;

              ActionModal.show({
                title: "Başarılı",
                message: "Bot hesabı silindi.",
                type: "success",
              });
              loadData();
            } catch (err: any) {
              console.error("Delete bot error:", err);
              ActionModal.show({
                title: "Hata",
                message: "Bot hesabı silinemedi.",
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

  const handleToggleBotOnline = async (bot: BotProfile) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_online: !bot.is_online,
        })
        .eq("id", bot.id);

      if (error) throw error;
      loadData();
    } catch (err) {
      console.error("Toggle bot online error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Bot çevrimiçi durumu güncellenemedi.",
        type: "error",
      });
    }
  };

  // Action: Save System Settings
  const handleSaveSettings = async () => {
    const limitNum = parseInt(voiceChatLimit);
    if (isNaN(limitNum) || limitNum <= 0) {
      ActionModal.show({
        title: "Hata",
        message: "Lütfen geçerli bir sesli görüşme süre sınırı (saniye) girin.",
        type: "error",
      });
      return;
    }

    const dailyLimitNum = parseInt(dailyMatchLimit);
    if (isNaN(dailyLimitNum) || dailyLimitNum < 0) {
      ActionModal.show({
        title: "Hata",
        message: "Lütfen geçerli bir günlük eşleşme sınırı girin.",
        type: "error",
      });
      return;
    }

    const cashoutPercentageNum = parseFloat(cashoutUserPercentage);
    if (
      isNaN(cashoutPercentageNum) ||
      cashoutPercentageNum < 0 ||
      cashoutPercentageNum > 100
    ) {
      ActionModal.show({
        title: "Hata",
        message: "Lutfen 0 ile 100 arasinda bir nakit odeme yuzdesi girin.",
        type: "error",
      });
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.from("system_settings").upsert([
        { key: "voice_chat_limit", value: voiceChatLimit },
        { key: "daily_match_limit", value: dailyMatchLimit },
        {
          key: "diamond_cashout_user_percentage",
          value: cashoutPercentageNum.toString(),
        },
        {
          key: "maintenance_mode",
          value: maintenanceModeActive ? "true" : "false",
        },
        {
          key: "cash_withdrawal_enabled",
          value: cashWithdrawalEnabled ? "true" : "false",
        },
      ]);

      if (error) throw error;
      ActionModal.show({
        title: "Başarılı",
        message: "Sistem ayarları güncellendi.",
        type: "success",
      });
    } catch (err) {
      console.error("Save settings error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Ayarlar kaydedilemedi.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSavePackage = async () => {
    const amountNum = parseInt(packageForm.amount);
    const priceNum = parseFloat(packageForm.price);
    const sortNum = parseInt(packageForm.sort_order);

    if (isNaN(amountNum) || amountNum <= 0) {
      ActionModal.show({
        title: "Hata",
        message: "Geçerli bir elmas miktarı girin.",
        type: "error",
      });
      return;
    }
    if (isNaN(priceNum) || priceNum <= 0) {
      ActionModal.show({
        title: "Hata",
        message: "Geçerli bir fiyat girin.",
        type: "error",
      });
      return;
    }

    try {
      setLoading(true);
      const packageData = {
        amount: amountNum,
        price: priceNum,
        badge: packageForm.badge || null,
        is_active: packageForm.is_active,
        sort_order: isNaN(sortNum) ? 0 : sortNum,
      };

      if (editingPackage) {
        const { error } = await supabase
          .from("diamond_packages")
          .update(packageData)
          .eq("id", editingPackage.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("diamond_packages")
          .insert(packageData);
        if (error) throw error;
      }

      setPackageModalVisible(false);
      setEditingPackage(null);
      setPackageForm({
        amount: "",
        price: "",
        badge: "",
        is_active: true,
        sort_order: "0",
      });

      // Reload packages
      const { data } = await supabase
        .from("diamond_packages")
        .select("*")
        .order("sort_order", { ascending: true });
      if (data) setDiamondPackages(data);

      ActionModal.show({
        title: "Başarılı",
        message: editingPackage
          ? "Paket güncellendi."
          : "Yeni paket oluşturuldu.",
        type: "success",
      });
    } catch (err) {
      console.error("Save package error:", err);
      ActionModal.show({
        title: "Hata",
        message: "Paket kaydedilemedi.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePackage = async (pkg: DiamondPackage) => {
    ActionModal.show({
      title: "Paketi Sil",
      message: `${pkg.amount} Elmas paketini silmek istediğinize emin misiniz?`,
      type: "warning",
      buttons: [
        { text: "İptal", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              const { error } = await supabase
                .from("diamond_packages")
                .delete()
                .eq("id", pkg.id);
              if (error) throw error;

              setDiamondPackages((prev) => prev.filter((p) => p.id !== pkg.id));
              ActionModal.show({
                title: "Başarılı",
                message: "Paket silindi.",
                type: "success",
              });
            } catch (err) {
              console.error("Delete package error:", err);
              ActionModal.show({
                title: "Hata",
                message: "Paket silinemedi.",
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

  const openPackageModal = (pkg?: DiamondPackage) => {
    if (pkg) {
      setEditingPackage(pkg);
      setPackageForm({
        amount: pkg.amount.toString(),
        price: pkg.price.toString(),
        badge: pkg.badge || "",
        is_active: pkg.is_active,
        sort_order: pkg.sort_order.toString(),
      });
    } else {
      setEditingPackage(null);
      setPackageForm({
        amount: "",
        price: "",
        badge: "",
        is_active: true,
        sort_order: "0",
      });
    }
    setPackageModalVisible(true);
  };

  const getWithdrawalStatusLabel = (
    status: DiamondWithdrawalRequest["status"],
  ) => {
    switch (status) {
      case "approved":
        return "Onaylandı";
      case "completed":
        return "Tamamlandı";
      case "cancelled":
        return "İptal Edildi";
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

  const handleUpdateWithdrawalStatus = async (
    request: DiamondWithdrawalRequest,
    status: DiamondWithdrawalRequest["status"],
  ) => {
    try {
      setLoading(true);
      const { error } = await supabase.rpc("update_diamond_withdrawal_status", {
        p_request_id: request.id,
        p_status: status,
        p_admin_note: null,
      });

      if (error) throw error;

      ActionModal.show({
        title: "Başarılı",
        message: "Nakit çekim talebi güncellendi.",
        type: "success",
      });
      loadData();
    } catch (err: any) {
      console.error("Update withdrawal status error:", err);
      ActionModal.show({
        title: "Hata",
        message: err.message || "Talep durumu güncellenemedi.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const getBadgeLabel = (badge: string | null) => {
    switch (badge) {
      case "popular":
        return "Popüler";
      case "best_value":
        return "En Avantajlı";
      case "new":
        return "Yeni";
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

  if (profile?.role !== "admin") {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const SETTINGS_SECTIONS = [
    {
      title: "Sistem ve Analiz",
      options: [
        {
          id: "dashboard",
          title: "Genel Bakış",
          subtitle: "Sunucu durumu, çevrimiçi üye oranları ve sistem analizi.",
          icon: "bar-chart-outline",
          iconColor: "#3B82F6",
        },
        {
          id: "settings",
          title: "Sistem Ayarları",
          subtitle:
            "Eşleşme limitleri, sesli arama süreleri ve elmas paketleri.",
          icon: "settings-outline",
          iconColor: "#6366F1",
        },
      ],
    },
    {
      title: "Topluluk ve Moderasyon",
      options: [
        {
          id: "reports",
          title: "Şikayetler",
          subtitle: "Kullanıcılar hakkında yapılan şikayetler ve raporlar.",
          icon: "warning-outline",
          iconColor: "#EF4444",
          badgeCount: stats.pendingReports,
        },
        {
          id: "users",
          title: "Üye Yönetimi",
          subtitle: "Üye profilleri arama, engelleme ve VIP atamaları.",
          icon: "people-outline",
          iconColor: "#10B981",
        },
        {
          id: "bots",
          title: "Bot Yönetimi",
          subtitle: "Yapay zeka sohbet botları ekleme ve düzenleme.",
          icon: "logo-android",
          iconColor: "#8B5CF6",
        },
        {
          id: "deleted_messages",
          title: "Silinen Mesajlar",
          subtitle: "Kullanıcıların sildiği mesaj kayıtları geçmişi.",
          icon: "trash-outline",
          iconColor: "#6B7280",
        },
      ],
    },
    {
      title: "Finansal İşlemler",
      options: [
        {
          id: "withdrawals",
          title: "Nakit Çekim Talepleri",
          subtitle: "Elmas bozdurma ve banka ödeme talepleri yönetimi.",
          icon: "cash-outline",
          iconColor: "#F59E0B",
          badgeCount: stats.pendingWithdrawals,
        },
      ],
    },
  ] as const;

  const filteredSections = SETTINGS_SECTIONS.map((section) => {
    const matchedOptions = section.options.filter(
      (opt) =>
        opt.title.toLowerCase().includes(settingsSearchQuery.toLowerCase()) ||
        opt.subtitle.toLowerCase().includes(settingsSearchQuery.toLowerCase()),
    );
    return { ...section, options: matchedOptions };
  }).filter((section) => section.options.length > 0);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => {
            if (isAtMainMenu) {
              router.back();
            } else {
              setIsAtMainMenu(true);
              setSearchQuery("");
            }
          }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isAtMainMenu
            ? "Yönetici Ayarları"
            : activeTab === "dashboard"
              ? "Genel Bakış"
              : activeTab === "reports"
                ? "Şikayetler"
                : activeTab === "users"
                  ? "Üye Yönetimi"
                  : activeTab === "bots"
                    ? "Bot Yönetimi"
                    : activeTab === "deleted_messages"
                      ? "Silinen Mesajlar"
                      : activeTab === "withdrawals"
                        ? "Çekim Talepleri"
                        : "Sistem Ayarları"}
        </Text>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isAtMainMenu ? (
        <ScrollView
          style={styles.settingsMenuContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Settings Search Bar */}
          <View style={styles.settingsSearchContainer}>
            <View
              style={[
                styles.settingsSearchBox,
                { backgroundColor: isDark ? "#1C212E" : "#F2F4F7" },
              ]}
            >
              <Ionicons
                name="search"
                size={18}
                color={colors.textSecondary}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={[styles.settingsSearchInput, { color: colors.text }]}
                placeholder="Ayarlarda ara..."
                placeholderTextColor={colors.textSecondary}
                value={settingsSearchQuery}
                onChangeText={setSettingsSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {settingsSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSettingsSearchQuery("")}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Render Sections */}
          {filteredSections.map((section, idx) => (
            <View key={idx} style={styles.settingsSection}>
              <Text
                style={[
                  styles.settingsSectionTitle,
                  { color: colors.textSecondary },
                ]}
              >
                {section.title}
              </Text>
              <View
                style={[
                  styles.settingsCardWrap,
                  {
                    backgroundColor: isDark ? "#121620" : "#FFFFFF",
                    borderColor: colors.border,
                  },
                ]}
              >
                {section.options.map((opt, optIdx) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.settingsItemRow,
                      optIdx < section.options.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      setActiveTab(opt.id);
                      setIsAtMainMenu(false);
                    }}
                  >
                    <View
                      style={[
                        styles.settingsIconCircle,
                        { backgroundColor: opt.iconColor },
                      ]}
                    >
                      <Ionicons
                        name={opt.icon as any}
                        size={18}
                        color="#FFFFFF"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.settingsItemTitle,
                          { color: colors.text },
                        ]}
                      >
                        {opt.title}
                      </Text>
                      <Text
                        style={[
                          styles.settingsItemSubtitle,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {opt.subtitle}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {(opt as any).badgeCount !== undefined &&
                      (opt as any).badgeCount > 0 ? (
                        <View style={styles.settingsItemBadge}>
                          <Text style={styles.settingsItemBadgeText}>
                            {(opt as any).badgeCount}
                          </Text>
                        </View>
                      ) : null}
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.textSecondary}
                      />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      ) : (
        <View style={styles.tabContent}>
          {activeTab === "dashboard" && (
            <AdminDashboardTab
              stats={stats}
              colors={colors}
              isDark={isDark}
              setActiveTab={setActiveTab}
              openAddBotModal={openAddBotModal}
            />
          )}

          {activeTab === "reports" && (
            <AdminReportsTab
              reports={reports}
              colors={colors}
              isDark={isDark}
              handleResolveReport={handleResolveReport}
              handleBanUser={handleBanUser}
            />
          )}

          {activeTab === "users" && (
            <AdminUsersTab
              users={users}
              colors={colors}
              isDark={isDark}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchQueryRef={searchQueryRef}
              userFilter={userFilter}
              setUserFilter={setUserFilter}
              handleUserSearch={handleUserSearch}
              handleToggleVip={handleToggleVip}
              handleBanUser={handleBanUser}
              loadData={loadData}
            />
          )}

          {activeTab === "deleted_messages" && (
            <AdminDeletedMessagesTab
              deletedMsgs={deletedMsgs}
              colors={colors}
              isDark={isDark}
            />
          )}

          {activeTab === "bots" && (
            <AdminBotsTab
              bots={bots}
              colors={colors}
              isDark={isDark}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchQueryRef={searchQueryRef}
              botFilter={botFilter}
              setBotFilter={setBotFilter}
              handleUserSearch={handleUserSearch}
              openAddBotModal={openAddBotModal}
              openEditBotModal={openEditBotModal}
              handleToggleBotOnline={handleToggleBotOnline}
              handleDeleteBot={handleDeleteBot}
              loadData={loadData}
            />
          )}

          {activeTab === "withdrawals" && (
            <AdminWithdrawalsTab
              withdrawalRequests={withdrawalRequests}
              colors={colors}
              isDark={isDark}
              getWithdrawalStatusColor={getWithdrawalStatusColor}
              getWithdrawalStatusLabel={getWithdrawalStatusLabel}
              handleCopyText={handleCopyText}
              handleUpdateWithdrawalStatus={handleUpdateWithdrawalStatus}
            />
          )}

          {activeTab === "settings" && (
            <AdminSettingsTab
              colors={colors}
              isDark={isDark}
              maintenanceModeActive={maintenanceModeActive}
              setMaintenanceModeActive={setMaintenanceModeActive}
              voiceChatLimit={voiceChatLimit}
              setVoiceChatLimit={setVoiceChatLimit}
              cashWithdrawalEnabled={cashWithdrawalEnabled}
              setCashWithdrawalEnabled={setCashWithdrawalEnabled}
              cashoutUserPercentage={cashoutUserPercentage}
              setCashoutUserPercentage={setCashoutUserPercentage}
              dailyMatchLimit={dailyMatchLimit}
              setDailyMatchLimit={setDailyMatchLimit}
              diamondPackages={diamondPackages}
              openPackageModal={openPackageModal}
              handleDeletePackage={handleDeletePackage}
              handleSaveSettings={handleSaveSettings}
              getBadgeColor={getBadgeColor}
              getBadgeLabel={getBadgeLabel}
            />
          )}
        </View>
      )}

      {/* Bot Ekleme/Düzenleme Modalı */}
      <Modal
        visible={botModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setBotModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingBot ? "Bot Profilini Düzenle" : "Yeni Bot Ekle"}
            </Text>

            <ScrollView
              style={styles.modalForm}
              showsVerticalScrollIndicator={false}
            >
              {/* Kullanıcı Adı */}
              <Text
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Kullanıcı Adı *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    color: colors.text,
                    backgroundColor: isDark ? "#1C212E" : "#F2F4F7",
                    borderColor: isDark ? "#2A3347" : "#E2E8F0",
                  },
                ]}
                placeholder="Örn: merve_kaya"
                placeholderTextColor={colors.textSecondary}
                value={botForm.username}
                onChangeText={(val) =>
                  setBotForm((f) => ({ ...f, username: val }))
                }
                autoCapitalize="none"
              />

              {/* Cinsiyet */}
              <Text
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Cinsiyet *
              </Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[
                    styles.radioBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor:
                        botForm.gender === "female"
                          ? colors.primary
                          : "transparent",
                    },
                  ]}
                  onPress={() =>
                    setBotForm((f) => ({ ...f, gender: "female" }))
                  }
                >
                  <Text
                    style={[
                      styles.radioBtnText,
                      {
                        color:
                          botForm.gender === "female"
                            ? isDark
                              ? "#000"
                              : "#FFF"
                            : colors.text,
                      },
                    ]}
                  >
                    Kadın
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.radioBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor:
                        botForm.gender === "male"
                          ? colors.primary
                          : "transparent",
                    },
                  ]}
                  onPress={() => setBotForm((f) => ({ ...f, gender: "male" }))}
                >
                  <Text
                    style={[
                      styles.radioBtnText,
                      {
                        color:
                          botForm.gender === "male"
                            ? isDark
                              ? "#000"
                              : "#FFF"
                            : colors.text,
                      },
                    ]}
                  >
                    Erkek
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Yaş */}
              <Text
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Yaş
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    color: colors.text,
                    backgroundColor: isDark ? "#1C212E" : "#F2F4F7",
                    borderColor: isDark ? "#2A3347" : "#E2E8F0",
                  },
                ]}
                placeholder="Örn: 24"
                placeholderTextColor={colors.textSecondary}
                value={botForm.age}
                onChangeText={(val) => setBotForm((f) => ({ ...f, age: val }))}
                keyboardType="numeric"
              />

              {/* Şehir */}
              <Text
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Şehir
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    color: colors.text,
                    backgroundColor: isDark ? "#1C212E" : "#F2F4F7",
                    borderColor: isDark ? "#2A3347" : "#E2E8F0",
                  },
                ]}
                placeholder="Örn: İstanbul"
                placeholderTextColor={colors.textSecondary}
                value={botForm.city}
                onChangeText={(val) => setBotForm((f) => ({ ...f, city: val }))}
              />

              {/* Biyografi */}
              <Text
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Biyografi / Hakkında
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    color: colors.text,
                    backgroundColor: isDark ? "#1C212E" : "#F2F4F7",
                    borderColor: isDark ? "#2A3347" : "#E2E8F0",
                    height: 80,
                    textAlignVertical: "top",
                  },
                ]}
                placeholder="Örn: Sohbet etmeyi ve yeni insanlar tanımayı severim..."
                placeholderTextColor={colors.textSecondary}
                value={botForm.bio}
                onChangeText={(val) => setBotForm((f) => ({ ...f, bio: val }))}
                multiline={true}
                numberOfLines={3}
              />

              {/* Avatar URL */}
              <Text
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Avatar URL (Boş bırakılırsa varsayılan gösterilir)
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    color: colors.text,
                    backgroundColor: isDark ? "#1C212E" : "#F2F4F7",
                    borderColor: isDark ? "#2A3347" : "#E2E8F0",
                  },
                ]}
                placeholder="https://example.com/avatar.jpg"
                placeholderTextColor={colors.textSecondary}
                value={botForm.avatarUrl}
                onChangeText={(val) =>
                  setBotForm((f) => ({ ...f, avatarUrl: val }))
                }
                autoCapitalize="none"
              />

              {/* VIP ve Online Durumları */}
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>
                  Çevrimiçi (Online)
                </Text>
                <Switch
                  value={botForm.isOnline}
                  onValueChange={(val) =>
                    setBotForm((f) => ({ ...f, isOnline: val }))
                  }
                  trackColor={{ false: "#767577", true: "#10B981" }}
                  thumbColor={botForm.isOnline ? "#FFF" : "#FFF"}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>
                  VIP Üye
                </Text>
                <Switch
                  value={botForm.isVip}
                  onValueChange={(val) =>
                    setBotForm((f) => ({ ...f, isVip: val }))
                  }
                  trackColor={{ false: "#767577", true: colors.vip }}
                  thumbColor={botForm.isVip ? "#FFF" : "#FFF"}
                />
              </View>
            </ScrollView>

            {/* Aksiyon Butonları */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalCancelBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
                onPress={() => setBotModalVisible(false)}
              >
                <Text
                  style={[styles.modalCancelBtnText, { color: colors.text }]}
                >
                  İptal
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSaveBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleSaveBot}
              >
                <Text
                  style={[
                    styles.modalSaveBtnText,
                    { color: isDark ? "#000" : "#FFF" },
                  ]}
                >
                  Kaydet
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Elmas Paketi Ekleme/Düzenleme Modalı */}
      <Modal
        visible={packageModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPackageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingPackage ? "Paketi Düzenle" : "Yeni Elmas Paketi"}
            </Text>

            <ScrollView
              style={styles.modalForm}
              showsVerticalScrollIndicator={false}
            >
              <Text
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Elmas Miktarı *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    color: colors.text,
                    backgroundColor: isDark ? "#1C212E" : "#F2F4F7",
                    borderColor: isDark ? "#2A3347" : "#E2E8F0",
                  },
                ]}
                placeholder="Örn: 100"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={packageForm.amount}
                onChangeText={(val) =>
                  setPackageForm((f) => ({ ...f, amount: val }))
                }
              />

              <Text
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Fiyat (TL) *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    color: colors.text,
                    backgroundColor: isDark ? "#1C212E" : "#F2F4F7",
                    borderColor: isDark ? "#2A3347" : "#E2E8F0",
                  },
                ]}
                placeholder="Örn: 35.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                value={packageForm.price}
                onChangeText={(val) =>
                  setPackageForm((f) => ({ ...f, price: val }))
                }
              />

              <Text
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Rozet (İsteğe Bağlı)
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: Spacing.three,
                }}
              >
                {[
                  { key: "", label: "Yok" },
                  {
                    key: "popular",
                    label: (
                      <>
                        <Ionicons name="flame" size={12} /> Popüler
                      </>
                    ),
                  },
                  {
                    key: "best_value",
                    label: (
                      <>
                        <Ionicons name="star" size={12} /> En Avantajlı
                      </>
                    ),
                  },
                  {
                    key: "new",
                    label: (
                      <>
                        <Ionicons name="sparkles" size={12} /> Yeni
                      </>
                    ),
                  },
                ].map((b) => (
                  <TouchableOpacity
                    key={b.key}
                    onPress={() =>
                      setPackageForm((f) => ({ ...f, badge: b.key }))
                    }
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor:
                        packageForm.badge === b.key ? "#A855F7" : colors.border,
                      backgroundColor:
                        packageForm.badge === b.key
                          ? "#A855F720"
                          : colors.background,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          packageForm.badge === b.key ? "#A855F7" : colors.text,
                        fontWeight:
                          packageForm.badge === b.key ? "bold" : "normal",
                        fontSize: 12,
                      }}
                    >
                      {b.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Sıralama
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    color: colors.text,
                    backgroundColor: isDark ? "#1C212E" : "#F2F4F7",
                    borderColor: isDark ? "#2A3347" : "#E2E8F0",
                  },
                ]}
                placeholder="Örn: 1"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={packageForm.sort_order}
                onChangeText={(val) =>
                  setPackageForm((f) => ({ ...f, sort_order: val }))
                }
              />

              <View style={[styles.switchRow, { marginBottom: Spacing.three }]}>
                <Text
                  style={[
                    styles.inputLabel,
                    { color: colors.textSecondary, marginTop: 0 },
                  ]}
                >
                  Aktif
                </Text>
                <Switch
                  value={packageForm.is_active}
                  onValueChange={(val) =>
                    setPackageForm((f) => ({ ...f, is_active: val }))
                  }
                  trackColor={{ false: "#767577", true: colors.primary }}
                  thumbColor={"#f4f3f4"}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setPackageModalVisible(false);
                  setEditingPackage(null);
                }}
              >
                <Text
                  style={[styles.modalCancelBtnText, { color: colors.text }]}
                >
                  İptal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: "#A855F7" }]}
                onPress={handleSavePackage}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>
                    {editingPackage ? "Güncelle" : "Oluştur"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  backButton: {
    paddingRight: Spacing.three,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: Fonts.heading,
  },
  tabsScrollView: {
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  tabsContentContainer: {
    paddingHorizontal: Spacing.three,
    gap: 8,
    alignItems: "center",
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    marginLeft: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: {
    fontSize: 9,
    fontWeight: "bold",
  },
  tabContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
  },
  adminCard: {
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: Spacing.three,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.two,
  },
  userNameTitle: {
    fontSize: 15,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  statusBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: "700",
    fontFamily: Fonts.bodyMedium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 14,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: Spacing.two,
  },
  actionBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: Fonts.bodyMedium,
  },
  searchContainer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: 8,
  },
  searchBarWrapper: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    fontFamily: Fonts.body,
  },
  searchBtn: {
    width: 60,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  msgImagePreview: {
    width: 150,
    height: 150,
    borderRadius: 8,
    resizeMode: "cover",
  },
  settingsContainer: {
    padding: Spacing.three,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  input: {
    width: "100%",
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
    marginTop: Spacing.two,
  },
  saveButton: {
    width: "100%",
    height: 46,
    borderRadius: 23,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.four,
    marginBottom: Spacing.five,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  emptyText: {
    textAlign: "center",
    marginTop: Spacing.six,
    fontSize: 14,
  },
  // Dashboard Styles
  dashboardContainer: {
    padding: Spacing.three,
  },
  dashboardBanner: {
    padding: Spacing.four,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: Spacing.three,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: "800",
    fontFamily: Fonts.heading,
  },
  bannerSub: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    width: "100%",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "800",
    fontFamily: Fonts.heading,
    marginBottom: 10,
    paddingHorizontal: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dashboardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 10,
  },
  statsCard: {
    width: "48%",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 4,
  },
  statsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  statsValue: {
    fontSize: 24,
    fontWeight: "800",
  },
  statsLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  // Shortcuts
  shortcutsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  shortcutCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
  },
  shortcutIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  shortcutText: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  // Switch styling
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.two,
  },
  // Filtering row styling
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: 6,
    marginBottom: Spacing.one,
    alignItems: "center",
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  // User list specific
  userCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarContainer: {
    position: "relative",
    width: 42,
    height: 42,
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  onlineDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: "#10B981",
  },
  userCardDetailBox: {
    gap: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  // Bot list specific
  botBioContainer: {
    borderLeftWidth: 3,
    borderColor: "#A855F750",
  },
  // Reports specific
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  reportUserLabel: {
    fontSize: 9,
    fontWeight: "700",
  },
  reportUsername: {
    fontSize: 15,
    fontWeight: "700",
  },
  reportReasonBox: {
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
  },
  // Deleted specific
  deletedMsgCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  deletedMsgHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  deletedMsgBubble: {
    alignSelf: "flex-start",
    maxWidth: "85%",
  },
  imageBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  // Withdrawals specific
  financialSplitBox: {
    flexDirection: "row",
    borderWidth: 1,
    justifyContent: "space-around",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
  },
  splitItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  splitLabel: {
    fontSize: 9,
    color: "#6B7280",
    fontWeight: "700",
    textAlign: "center",
  },
  splitValue: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
    textAlign: "center",
  },
  splitDivider: {
    width: 1,
    height: "60%",
  },
  bankAccountCard: {
    borderWidth: 1.2,
    borderStyle: "dashed",
    padding: 14,
    borderRadius: 16,
  },
  bankDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bankDetailLabel: {
    fontSize: 9,
    color: "#6B7280",
    fontWeight: "800",
    textTransform: "uppercase",
  },
  bankDetailValue: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  copyBtnText: {
    fontSize: 10,
    fontWeight: "700",
  },
  // Warning Banner Settings
  warningBanner: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.four,
  },
  modalContent: {
    width: "100%",
    maxHeight: "85%",
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.four,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: Fonts.heading,
    marginBottom: Spacing.three,
    textAlign: "center",
  },
  modalForm: {
    flexGrow: 0,
    marginBottom: Spacing.four,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Fonts.bodyMedium,
    marginBottom: Spacing.one,
    marginTop: Spacing.two,
  },
  formInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
  },
  radioGroup: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.one,
    marginBottom: Spacing.one,
  },
  radioBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  radioBtnText: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  modalSaveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  modalSaveBtnText: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: Fonts.bodyMedium,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "500",
    fontFamily: Fonts.bodyMedium,
  },
  // Facebook settings styled menu
  settingsMenuContainer: {
    flex: 1,
    paddingHorizontal: Spacing.three,
  },
  settingsSearchContainer: {
    marginVertical: Spacing.three,
  },
  settingsSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
  },
  settingsSearchInput: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    fontFamily: Fonts.body,
    paddingVertical: 0,
  },
  settingsSection: {
    marginBottom: Spacing.four,
  },
  settingsSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontFamily: Fonts.bodyMedium,
    marginBottom: Spacing.two,
    paddingLeft: Spacing.one,
  },
  settingsCardWrap: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  settingsItemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.three,
  },
  settingsIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.three,
  },
  settingsItemTitle: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: Fonts.bodyMedium,
  },
  settingsItemSubtitle: {
    fontSize: 11,
    fontFamily: Fonts.body,
    marginTop: 2,
    lineHeight: 14,
  },
  settingsItemBadge: {
    backgroundColor: "#EF4444",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  settingsItemBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
  },
});
