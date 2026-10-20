import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AdminStats } from "./admin.types";
import { adminStyles as styles } from "./admin.styles";

interface AdminDashboardTabProps {
  stats: AdminStats;
  colors: any;
  isDark: boolean;
  setActiveTab: (tab: any) => void;
  openAddBotModal: () => void;
}

export function AdminDashboardTab({
  stats,
  colors,
  isDark,
  setActiveTab,
  openAddBotModal,
}: AdminDashboardTabProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.dashboardContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Summary Dashboard Banner */}
      <View
        style={[
          styles.dashboardBanner,
          {
            backgroundColor: isDark ? "#121622" : "#ECEFF4",
            borderColor: colors.border,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.bannerTitle, { color: colors.text }]}>
            Sistem Durum Analizi
          </Text>
          <Text style={[styles.bannerSub, { color: colors.textSecondary }]}>
            Anlık uygulama sağlığı ve aktif üyelerin genel dağılımı.
          </Text>

          {/* Online user progress indicator */}
          <View style={{ marginTop: 16 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.textSecondary,
                }}
              >
                Çevrimiçi Üye Oranı
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: "#10B981",
                }}
              >
                %
                {stats.totalUsers > 0
                  ? Math.round((stats.onlineUsers / stats.totalUsers) * 100)
                  : 0}{" "}
                ({stats.onlineUsers} / {stats.totalUsers})
              </Text>
            </View>
            <View
              style={[
                styles.progressBarBg,
                { backgroundColor: isDark ? "#1C212E" : "#D2D6DC" },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: "#10B981",
                    width: `${stats.totalUsers > 0 ? (stats.onlineUsers / stats.totalUsers) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Grid: User Stats */}
      <Text
        style={[
          styles.sectionHeading,
          { color: colors.text, marginTop: 18 },
        ]}
      >
        Kullanıcı İstatistikleri
      </Text>
      <View style={styles.dashboardGrid}>
        {/* Total Real Users */}
        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[styles.statsIconWrap, { backgroundColor: "#3B82F6" }]}
          >
            <Ionicons name="people" size={20} color="#FFFFFF" />
          </View>
          <Text style={[styles.statsValue, { color: colors.text }]}>
            {stats.totalRealUsers}
          </Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>
            Gerçek Üye
          </Text>
        </View>

        {/* Total Bots */}
        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[styles.statsIconWrap, { backgroundColor: "#10B981" }]}
          >
            <Ionicons name="logo-android" size={20} color="#FFFFFF" />
          </View>
          <Text style={[styles.statsValue, { color: colors.text }]}>
            {stats.totalBots}
          </Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>
            Toplam Bot
          </Text>
        </View>

        {/* Online Users */}
        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[styles.statsIconWrap, { backgroundColor: "#059669" }]}
          >
            <Ionicons name="ellipse" size={10} color="#FFFFFF" />
          </View>
          <Text style={[styles.statsValue, { color: colors.text }]}>
            {stats.onlineUsers}
          </Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>
            Çevrimiçi Üye
          </Text>
        </View>

        {/* VIP Users */}
        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[styles.statsIconWrap, { backgroundColor: "#F59E0B" }]}
          >
            <Ionicons name="ribbon" size={20} color="#FFFFFF" />
          </View>
          <Text style={[styles.statsValue, { color: colors.text }]}>
            {stats.vipUsers}
          </Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>
            VIP Üyeler
          </Text>
        </View>
      </View>

      {/* Grid: Moderation & Finances */}
      <Text
        style={[
          styles.sectionHeading,
          { color: colors.text, marginTop: 10 },
        ]}
      >
        Moderasyon & Finans
      </Text>
      <View style={styles.dashboardGrid}>
        {/* Pending Reports */}
        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[styles.statsIconWrap, { backgroundColor: "#EF4444" }]}
          >
            <Ionicons name="warning" size={20} color="#FFFFFF" />
          </View>
          <Text style={[styles.statsValue, { color: colors.text }]}>
            {stats.pendingReports}
          </Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>
            Bekleyen Şikayet
          </Text>
        </View>

        {/* Pending Withdrawals */}
        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[styles.statsIconWrap, { backgroundColor: "#10B981" }]}
          >
            <Ionicons name="cash" size={20} color="#FFFFFF" />
          </View>
          <Text style={[styles.statsValue, { color: colors.text }]}>
            {stats.pendingWithdrawals}
          </Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>
            Bekleyen Çekim
          </Text>
        </View>

        {/* Deleted Messages */}
        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
              width: "100%",
            },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <View
              style={[styles.statsIconWrap, { backgroundColor: "#6B7280" }]}
            >
              <Ionicons name="trash-bin" size={20} color="#FFFFFF" />
            </View>
            <View>
              <Text style={[styles.statsValue, { color: colors.text }]}>
                {stats.deletedMessages}
              </Text>
              <Text
                style={[styles.statsLabel, { color: colors.textSecondary }]}
              >
                Toplam Silinen Mesaj Kaydı
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Quick Shortcuts */}
      <Text
        style={[
          styles.sectionHeading,
          { color: colors.text, marginTop: 14 },
        ]}
      >
        Hızlı İşlemler
      </Text>
      <View style={styles.shortcutsContainer}>
        <TouchableOpacity
          style={[
            styles.shortcutCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
          onPress={() => setActiveTab("reports")}
        >
          <View
            style={[styles.shortcutIconWrap, { backgroundColor: "#EF4444" }]}
          >
            <Ionicons name="warning" size={18} color="#FFFFFF" />
          </View>
          <Text style={[styles.shortcutText, { color: colors.text }]}>
            Şikayetleri Çöz
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.shortcutCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
          onPress={() => setActiveTab("withdrawals")}
        >
          <View
            style={[styles.shortcutIconWrap, { backgroundColor: "#10B981" }]}
          >
            <Ionicons name="cash" size={18} color="#FFFFFF" />
          </View>
          <Text style={[styles.shortcutText, { color: colors.text }]}>
            Ödeme Talepleri
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.shortcutCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
            },
          ]}
          onPress={() => openAddBotModal()}
        >
          <View
            style={[styles.shortcutIconWrap, { backgroundColor: "#A855F7" }]}
          >
            <Ionicons name="add-circle" size={18} color="#FFFFFF" />
          </View>
          <Text style={[styles.shortcutText, { color: colors.text }]}>
            Yeni Bot Ekle
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
