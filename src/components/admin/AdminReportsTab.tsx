import React from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Report } from "./admin.types";
import { adminStyles as styles } from "./admin.styles";

interface AdminReportsTabProps {
  reports: Report[];
  colors: any;
  isDark: boolean;
  handleResolveReport: (reportId: string) => void;
  handleBanUser: (targetUserId: string, currentBanStatus: boolean) => void;
}

export function AdminReportsTab({
  reports,
  colors,
  isDark,
  handleResolveReport,
  handleBanUser,
}: AdminReportsTabProps) {
  return (
    <FlatList
      data={reports}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View
          style={[
            styles.adminCard,
            {
              backgroundColor: colors.backgroundElement,
              borderColor: colors.border,
              padding: 16,
              borderRadius: 16,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <View>
              <Text
                style={[styles.cardLabel, { color: colors.textSecondary }]}
              >
                Şikayet Edilen
              </Text>
              <Text
                style={[
                  styles.userNameTitle,
                  { color: colors.text, fontSize: 16, marginTop: 2 },
                ]}
              >
                @{item.reported_username}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    item.status === "resolved"
                      ? "rgba(16, 185, 129, 0.12)"
                      : "rgba(245, 158, 11, 0.12)",
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color:
                      item.status === "resolved" ? "#10B981" : "#F59E0B",
                  },
                ]}
              >
                {item.status === "resolved" ? "Çözüldü" : "Beklemede"}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.reportReasonBox,
              {
                backgroundColor: isDark ? "#1D191B" : "#FFF7ED",
                borderLeftColor: "#F59E0B",
                padding: 12,
                paddingLeft: 14,
                borderRadius: 10,
                marginVertical: 10,
              },
            ]}
          >
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Ionicons
                name="chatbox-ellipses-outline"
                size={16}
                color="#F59E0B"
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: "#F59E0B",
                    textTransform: "uppercase",
                  }}
                >
                  Gerekçe / Detay
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.text,
                    marginTop: 4,
                    lineHeight: 18,
                  }}
                >
                  {item.reason}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>
              Şikayet Eden:{" "}
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                {item.reporter_username}
              </Text>
            </Text>
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
          </View>

          <View style={[styles.cardActions, { marginTop: 14 }]}>
            {item.status !== "resolved" && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#10B981" }]}
                onPress={() => handleResolveReport(item.id)}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={15}
                  color="#FFFFFF"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.actionBtnText}>Çözüldü</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#EF4444" }]}
              onPress={() => handleBanUser(item.reported_id, false)}
            >
              <Ionicons
                name="ban-outline"
                size={15}
                color="#FFFFFF"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.actionBtnText}>Yasakla</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Aktif şikayet bulunmuyor.
        </Text>
      }
    />
  );
}
