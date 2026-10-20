import React from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { UserProfile } from "./admin.types";
import { adminStyles as styles } from "./admin.styles";

interface AdminUsersTabProps {
  users: UserProfile[];
  colors: any;
  isDark: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchQueryRef: React.MutableRefObject<string>;
  userFilter: "all" | "vip" | "banned";
  setUserFilter: (filter: "all" | "vip" | "banned") => void;
  handleUserSearch: () => void;
  handleToggleVip: (targetUserId: string, currentVipStatus: boolean) => void;
  handleBanUser: (targetUserId: string, currentBanStatus: boolean) => void;
  loadData: () => void;
}

export function AdminUsersTab({
  users,
  colors,
  isDark,
  searchQuery,
  setSearchQuery,
  searchQueryRef,
  userFilter,
  setUserFilter,
  handleUserSearch,
  handleToggleVip,
  handleBanUser,
  loadData,
}: AdminUsersTabProps) {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchBarWrapper,
            { backgroundColor: isDark ? "#1C212E" : "#F2F4F7" },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={18}
            color={colors.textSecondary}
          />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Kullanıcı adı ara..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleUserSearch}
          />
          {searchQuery.trim().length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery("");
                searchQueryRef.current = "";
                loadData();
              }}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.searchBtn, { backgroundColor: colors.primary }]}
          onPress={handleUserSearch}
        >
          <Text
            style={{
              color: isDark ? "#000" : "#FFF",
              fontWeight: "700",
              fontSize: 13,
            }}
          >
            Ara
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filters row */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[
            styles.filterBtn,
            userFilter === "all" && {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
            },
            userFilter !== "all" && {
              backgroundColor: "transparent",
              borderColor: colors.border,
            },
          ]}
          onPress={() => {
            setUserFilter("all");
            setTimeout(loadData, 0);
          }}
        >
          <Text
            style={[
              styles.filterBtnText,
              {
                color:
                  userFilter === "all"
                    ? isDark
                      ? "#000"
                      : "#FFF"
                    : colors.textSecondary,
              },
            ]}
          >
            Hepsi
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterBtn,
            userFilter === "vip" && {
              backgroundColor: colors.vip,
              borderColor: colors.vip,
            },
            userFilter !== "vip" && {
              backgroundColor: "transparent",
              borderColor: colors.border,
            },
          ]}
          onPress={() => {
            setUserFilter("vip");
            setTimeout(loadData, 0);
          }}
        >
          <Text
            style={[
              styles.filterBtnText,
              {
                color: userFilter === "vip" ? "#FFF" : colors.textSecondary,
              },
            ]}
          >
            VIP
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterBtn,
            userFilter === "banned" && {
              backgroundColor: "#EF4444",
              borderColor: "#EF4444",
            },
            userFilter !== "banned" && {
              backgroundColor: "transparent",
              borderColor: colors.border,
            },
          ]}
          onPress={() => {
            setUserFilter("banned");
            setTimeout(loadData, 0);
          }}
        >
          <Text
            style={[
              styles.filterBtnText,
              {
                color: userFilter === "banned" ? "#FFF" : colors.textSecondary,
              },
            ]}
          >
            Yasaklı
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.adminCard,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
                borderRadius: 16,
                padding: 14,
              },
            ]}
          >
            <View style={styles.userCardHeader}>
              <View style={styles.avatarContainer}>
                <Image
                  source={
                    item.avatar_url
                      ? { uri: item.avatar_url }
                      : require("../../../assets/images/place-holder.png")
                  }
                  style={styles.avatarImage}
                />
                {item.is_online && (
                  <View
                    style={[
                      styles.onlineDot,
                      { borderColor: colors.backgroundElement },
                    ]}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.userNameTitle, { color: colors.text }]}>
                  {item.username}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 4,
                  }}
                >
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                    Rol: {item.role.toUpperCase()}
                  </Text>
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: colors.border,
                    }}
                  />
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                    Kayıt: {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {item.is_vip && (
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: "rgba(245, 158, 11, 0.12)" },
                    ]}
                  >
                    <Text
                      style={[styles.statusBadgeText, { color: "#F59E0B" }]}
                    >
                      VIP
                    </Text>
                  </View>
                )}
                {item.banned_at && (
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: "rgba(239, 68, 68, 0.12)" },
                    ]}
                  >
                    <Text
                      style={[styles.statusBadgeText, { color: "#EF4444" }]}
                    >
                      BANLI
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View
              style={[
                styles.userCardDetailBox,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.02)"
                    : "rgba(0,0,0,0.015)",
                  padding: 10,
                  borderRadius: 10,
                  marginTop: 10,
                },
              ]}
            >
              {item.is_verified ? (
                <View style={styles.detailRow}>
                  <Ionicons
                    name="shield-checkmark"
                    size={14}
                    color="#10B981"
                  />
                  <Text
                    style={{
                      color: "#10B981",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Doğrulanmış Tel: {item.phone_number || "Bilinmiyor"}
                  </Text>
                </View>
              ) : (
                <View style={styles.detailRow}>
                  <Ionicons
                    name="shield-outline"
                    size={14}
                    color={colors.textSecondary}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Telefon Doğrulanmamış
                  </Text>
                </View>
              )}

              {item.banned_at && (
                <View style={[styles.detailRow, { marginTop: 6 }]}>
                  <Ionicons name="ban" size={14} color="#EF4444" />
                  <Text
                    style={{
                      color: "#EF4444",
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    YASAKLANMA: {new Date(item.banned_at).toLocaleDateString()}
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.cardActions, { marginTop: 12 }]}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: item.is_vip ? "#EF4444" : colors.vip,
                  },
                ]}
                onPress={() => handleToggleVip(item.id, item.is_vip)}
              >
                <Ionicons
                  name={item.is_vip ? "ribbon-outline" : "ribbon"}
                  size={14}
                  color={item.is_vip ? "#FFF" : "#000"}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.actionBtnText,
                    { color: item.is_vip ? "#FFF" : "#000" },
                  ]}
                >
                  {item.is_vip ? "VIP Kaldır" : "VIP Yap"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: item.banned_at ? "#10B981" : "#EF4444",
                  },
                ]}
                onPress={() => handleBanUser(item.id, !!item.banned_at)}
              >
                <Ionicons
                  name={
                    item.banned_at
                      ? "checkmark-circle-outline"
                      : "ban-outline"
                  }
                  size={14}
                  color="#FFFFFF"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.actionBtnText}>
                  {item.banned_at ? "Yasağı Kaldır" : "Banla"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Kullanıcı bulunamadı.
          </Text>
        }
      />
    </View>
  );
}
