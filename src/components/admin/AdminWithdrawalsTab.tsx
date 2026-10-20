import React from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { DiamondWithdrawalRequest } from "./admin.types";
import { adminStyles as styles } from "./admin.styles";
import { Fonts } from "../../constants/theme";

interface AdminWithdrawalsTabProps {
  withdrawalRequests: DiamondWithdrawalRequest[];
  colors: any;
  isDark: boolean;
  getWithdrawalStatusColor: (status: any) => string;
  getWithdrawalStatusLabel: (status: any) => string;
  handleCopyText: (text: string, label: string) => void;
  handleUpdateWithdrawalStatus: (
    item: DiamondWithdrawalRequest,
    newStatus: "approved" | "completed" | "cancelled",
  ) => void;
}

export function AdminWithdrawalsTab({
  withdrawalRequests,
  colors,
  isDark,
  getWithdrawalStatusColor,
  getWithdrawalStatusLabel,
  handleCopyText,
  handleUpdateWithdrawalStatus,
}: AdminWithdrawalsTabProps) {
  return (
    <FlatList
      data={withdrawalRequests}
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
              padding: 16,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <View>
              <Text
                style={[styles.cardLabel, { color: colors.textSecondary }]}
              >
                TALEP SAHİBİ
              </Text>
              <Text
                style={[
                  styles.userNameTitle,
                  { color: colors.text, fontSize: 16, marginTop: 2 },
                ]}
              >
                @{item.username || "Bilinmiyor"}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    getWithdrawalStatusColor(item.status) + "20",
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  { color: getWithdrawalStatusColor(item.status) },
                ]}
              >
                {getWithdrawalStatusLabel(item.status)}
              </Text>
            </View>
          </View>

          {/* Financial calculations visualization */}
          <View
            style={[
              styles.financialSplitBox,
              {
                borderColor: colors.border,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.02)"
                  : "rgba(0,0,0,0.02)",
                marginVertical: 10,
              },
            ]}
          >
            <View style={styles.splitItem}>
              <Text style={styles.splitLabel}>Elmas Miktarı</Text>
              <Text style={[styles.splitValue, { color: colors.text }]}>
                <Ionicons name="diamond" size={12} color="#A855F7" />{" "}
                {item.diamond_amount}
              </Text>
            </View>
            <View
              style={[
                styles.splitDivider,
                { backgroundColor: colors.border },
              ]}
            />
            <View style={styles.splitItem}>
              <Text style={styles.splitLabel}>
                Kullanıcı Payı (%
                {Number(item.payout_percentage).toFixed(0)})
              </Text>
              <Text
                style={[
                  styles.splitValue,
                  { color: "#10B981", fontWeight: "700" },
                ]}
              >
                {Number(item.user_cash_amount).toFixed(2)} TL
              </Text>
            </View>
            <View
              style={[
                styles.splitDivider,
                { backgroundColor: colors.border },
              ]}
            />
            <View style={styles.splitItem}>
              <Text style={styles.splitLabel}>Uygulama Payı</Text>
              <Text
                style={[
                  styles.splitValue,
                  { color: colors.textSecondary },
                ]}
              >
                {Number(item.app_cash_amount).toFixed(2)} TL
              </Text>
            </View>
          </View>

          {/* Bank card details */}
          <View
            style={[
              styles.bankAccountCard,
              {
                backgroundColor: isDark ? "#1C212E" : "#F8FAFC",
                borderColor: isDark ? "#2D3748" : "#E2E8F0",
              },
            ]}
          >
            <View style={styles.bankDetailRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bankDetailLabel}>Banka Adı</Text>
                <Text
                  style={[styles.bankDetailValue, { color: colors.text }]}
                >
                  {item.bank_name}
                </Text>
              </View>
            </View>

            <View style={[styles.bankDetailRow, { marginTop: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bankDetailLabel}>Hesap Sahibi</Text>
                <Text
                  style={[styles.bankDetailValue, { color: colors.text }]}
                >
                  {item.account_holder_name}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={() =>
                  handleCopyText(
                    item.account_holder_name,
                    "Hesap Sahibi",
                  )
                }
              >
                <Ionicons
                  name="copy-outline"
                  size={14}
                  color={colors.primary}
                />
                <Text
                  style={[styles.copyBtnText, { color: colors.primary }]}
                >
                  Kopyala
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.bankDetailRow, { marginTop: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bankDetailLabel}>IBAN</Text>
                <Text
                  style={[
                    styles.bankDetailValue,
                    {
                      color: colors.text,
                      fontFamily: Fonts.mono,
                      fontSize: 13,
                    },
                  ]}
                >
                  {item.iban}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={() => handleCopyText(item.iban, "IBAN")}
              >
                <Ionicons
                  name="copy-outline"
                  size={14}
                  color={colors.primary}
                />
                <Text
                  style={[styles.copyBtnText, { color: colors.primary }]}
                >
                  Kopyala
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {!!item.user_note && (
            <View style={{ marginTop: 10, paddingHorizontal: 4 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.textSecondary,
                  fontWeight: "600",
                }}
              >
                Kullanıcı Notu:
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.text,
                  marginTop: 2,
                }}
              >
                {item.user_note}
              </Text>
            </View>
          )}

          {item.status !== "completed" && item.status !== "cancelled" && (
            <View style={[styles.cardActions, { marginTop: 14 }]}>
              {item.status === "pending" && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#3B82F6" }]}
                  onPress={() =>
                    handleUpdateWithdrawalStatus(item, "approved")
                  }
                >
                  <Text style={styles.actionBtnText}>Onayla</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#10B981" }]}
                onPress={() =>
                  handleUpdateWithdrawalStatus(item, "completed")
                }
              >
                <Text style={styles.actionBtnText}>Tamamla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#EF4444" }]}
                onPress={() =>
                  handleUpdateWithdrawalStatus(item, "cancelled")
                }
              >
                <Text style={styles.actionBtnText}>İptal</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      ListEmptyComponent={
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Nakit çekim talebi bulunmuyor.
        </Text>
      }
    />
  );
}
