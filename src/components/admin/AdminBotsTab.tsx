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
import { BotProfile } from "./admin.types";
import { adminStyles as styles } from "./admin.styles";
import { Spacing } from "../../constants/theme";

interface AdminBotsTabProps {
  bots: BotProfile[];
  colors: any;
  isDark: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchQueryRef: React.MutableRefObject<string>;
  botFilter: "all" | "online" | "vip";
  setBotFilter: (filter: "all" | "online" | "vip") => void;
  handleUserSearch: () => void;
  openAddBotModal: () => void;
  openEditBotModal: (bot: BotProfile) => void;
  handleToggleBotOnline: (bot: BotProfile) => void;
  handleDeleteBot: (bot: BotProfile) => void;
  loadData: () => void;
}

export function AdminBotsTab({
  bots,
  colors,
  isDark,
  searchQuery,
  setSearchQuery,
  searchQueryRef,
  botFilter,
  setBotFilter,
  handleUserSearch,
  openAddBotModal,
  openEditBotModal,
  handleToggleBotOnline,
  handleDeleteBot,
  loadData,
}: AdminBotsTabProps) {
  return (
    <View style={{ flex: 1 }}>
      {/* Bot search bar */}
      <View style={[styles.searchContainer, { marginBottom: Spacing.two }]}>
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
            placeholder="Bot adı ara..."
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

      {/* Bot filters and add button */}
      <View
        style={[
          styles.filterRow,
          {
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          },
        ]}
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={[
              styles.filterBtn,
              botFilter === "all" && {
                backgroundColor: colors.primary,
                borderColor: colors.primary,
              },
              botFilter !== "all" && {
                backgroundColor: "transparent",
                borderColor: colors.border,
              },
            ]}
            onPress={() => {
              setBotFilter("all");
              setTimeout(loadData, 0);
            }}
          >
            <Text
              style={[
                styles.filterBtnText,
                {
                  color:
                    botFilter === "all"
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
              botFilter === "online" && {
                backgroundColor: "#10B981",
                borderColor: "#10B981",
              },
              botFilter !== "online" && {
                backgroundColor: "transparent",
                borderColor: colors.border,
              },
            ]}
            onPress={() => {
              setBotFilter("online");
              setTimeout(loadData, 0);
            }}
          >
            <Text
              style={[
                styles.filterBtnText,
                {
                  color:
                    botFilter === "online" ? "#FFF" : colors.textSecondary,
                },
              ]}
            >
              Çevrimiçi
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterBtn,
              botFilter === "vip" && {
                backgroundColor: colors.vip,
                borderColor: colors.vip,
              },
              botFilter !== "vip" && {
                backgroundColor: "transparent",
                borderColor: colors.border,
              },
            ]}
            onPress={() => {
              setBotFilter("vip");
              setTimeout(loadData, 0);
            }}
          >
            <Text
              style={[
                styles.filterBtnText,
                {
                  color: botFilter === "vip" ? "#FFF" : colors.textSecondary,
                },
              ]}
            >
              VIP
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.filterBtn,
            {
              backgroundColor: "#10B981",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: Spacing.three,
              borderColor: "#10B981",
            },
          ]}
          onPress={openAddBotModal}
        >
          <Ionicons name="add-circle" size={16} color="#FFF" />
          <Text style={[styles.filterBtnText, { color: "#FFF" }]}>
            Bot Ekle
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={bots}
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
            <View style={styles.cardHeader}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View style={styles.avatarContainer}>
                  <Image
                    source={
                      item.avatar_url
                        ? { uri: item.avatar_url }
                        : require("../../../assets/images/place-holder.png")
                    }
                    style={styles.avatarImage}
                  />
                  <View
                    style={[
                      styles.onlineDot,
                      {
                        backgroundColor: item.is_online
                          ? "#10B981"
                          : "#6B7280",
                        borderColor: colors.backgroundElement,
                      },
                    ]}
                  />
                </View>
                <View>
                  <Text
                    style={[
                      styles.userNameTitle,
                      { color: colors.text, fontSize: 16 },
                    ]}
                  >
                    {item.username}
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {item.gender === "male"
                      ? "Erkek"
                      : item.gender === "female"
                        ? "Kadın"
                        : "Belirtilmemiş"}
                    , {item.age || "?"} Yaş • {item.city || "Şehir Yok"}
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
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: item.is_online
                        ? "rgba(16, 185, 129, 0.12)"
                        : "rgba(107, 114, 128, 0.12)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      { color: item.is_online ? "#10B981" : "#6B7280" },
                    ]}
                  >
                    {item.is_online ? "ONLINE" : "OFFLINE"}
                  </Text>
                </View>
              </View>
            </View>

            {item.bio && (
              <View
                style={[
                  styles.botBioContainer,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(0,0,0,0.02)",
                    padding: 10,
                    borderRadius: 10,
                    marginVertical: 8,
                  },
                ]}
              >
                <View style={{ flexDirection: "row", gap: 4 }}>
                  <Ionicons
                    name={"quote" as any}
                    size={12}
                    color={colors.textSecondary}
                    style={{ marginTop: 2 }}
                  />
                  <Text
                    style={{
                      color: colors.text,
                      fontStyle: "italic",
                      fontSize: 13,
                      flex: 1,
                      lineHeight: 18,
                    }}
                  >
                    {item.bio}
                  </Text>
                </View>
              </View>
            )}

            <View style={[styles.cardActions, { marginTop: 10 }]}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderWidth: 1,
                  },
                ]}
                onPress={() => openEditBotModal(item)}
              >
                <Ionicons
                  name="create-outline"
                  size={14}
                  color={colors.text}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  Düzenle
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: item.is_online
                      ? "rgba(107, 114, 128, 0.1)"
                      : "rgba(16, 185, 129, 0.1)",
                  },
                ]}
                onPress={() => handleToggleBotOnline(item)}
              >
                <Ionicons
                  name={item.is_online ? "eye-off-outline" : "eye-outline"}
                  size={14}
                  color={item.is_online ? colors.textSecondary : "#10B981"}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.actionBtnText,
                    {
                      color: item.is_online ? colors.textSecondary : "#10B981",
                    },
                  ]}
                >
                  {item.is_online ? "Gizle" : "Göster"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { backgroundColor: "rgba(239, 68, 68, 0.1)" },
                ]}
                onPress={() => handleDeleteBot(item)}
              >
                <Ionicons
                  name="trash-outline"
                  size={14}
                  color="#EF4444"
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>
                  Sil
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Bot bulunamadı.
          </Text>
        }
      />
    </View>
  );
}
