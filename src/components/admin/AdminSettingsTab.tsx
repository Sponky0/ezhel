import React from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { DiamondPackage } from "./admin.types";
import { adminStyles as styles } from "./admin.styles";
import { Spacing } from "../../constants/theme";

interface AdminSettingsTabProps {
  colors: any;
  isDark: boolean;
  maintenanceModeActive: boolean;
  setMaintenanceModeActive: (val: boolean) => void;
  voiceChatLimit: string;
  setVoiceChatLimit: (val: string) => void;
  cashWithdrawalEnabled: boolean;
  setCashWithdrawalEnabled: (val: boolean) => void;
  cashoutUserPercentage: string;
  setCashoutUserPercentage: (val: string) => void;
  dailyMatchLimit: string;
  setDailyMatchLimit: (val: string) => void;
  diamondPackages: DiamondPackage[];
  openPackageModal: (pkg?: DiamondPackage) => void;
  handleDeletePackage: (pkg: DiamondPackage) => void;
  handleSaveSettings: () => void;
  getBadgeColor: (badge: string | null) => string;
  getBadgeLabel: (badge: string | null) => string | null;
}

export function AdminSettingsTab({
  colors,
  isDark,
  maintenanceModeActive,
  setMaintenanceModeActive,
  voiceChatLimit,
  setVoiceChatLimit,
  cashWithdrawalEnabled,
  setCashWithdrawalEnabled,
  cashoutUserPercentage,
  setCashoutUserPercentage,
  dailyMatchLimit,
  setDailyMatchLimit,
  diamondPackages,
  openPackageModal,
  handleDeletePackage,
  handleSaveSettings,
  getBadgeColor,
  getBadgeLabel,
}: AdminSettingsTabProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.settingsContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Warnings if Maintenance active */}
      {maintenanceModeActive && (
        <View
          style={[
            styles.warningBanner,
            {
              backgroundColor: "rgba(245, 158, 11, 0.12)",
              borderColor: "#F59E0B",
              marginBottom: Spacing.three,
            },
          ]}
        >
          <Ionicons name="warning" size={18} color="#F59E0B" />
          <Text
            style={{
              color: "#F59E0B",
              fontSize: 12,
              fontWeight: "600",
              flex: 1,
              marginLeft: 6,
              lineHeight: 16,
            }}
          >
            Dikkat: Bakım modu şu anda aktif. Yöneticiler haricindeki tüm
            kullanıcıların uygulamaya erişimi engellenmiş durumdadır.
          </Text>
        </View>
      )}

      <View
        style={[
          styles.adminCard,
          {
            backgroundColor: colors.backgroundElement,
            borderColor: colors.border,
            borderRadius: 16,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Sesli Görüşme Ayarları
        </Text>
        <Text
          style={[
            styles.inputLabel,
            {
              color: colors.textSecondary,
              marginTop: Spacing.three,
              marginBottom: Spacing.one,
            },
          ]}
        >
          Maksimum Sesli Görüşme Süresi (Saniye)
        </Text>

        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: isDark ? "#1C212E" : "#F2F4F7",
              borderColor: isDark ? "#2A3347" : "#E2E8F0",
            },
          ]}
          keyboardType="numeric"
          value={voiceChatLimit}
          onChangeText={setVoiceChatLimit}
        />
      </View>

      <View
        style={[
          styles.adminCard,
          {
            backgroundColor: colors.backgroundElement,
            borderColor: colors.border,
            marginTop: Spacing.three,
            borderRadius: 16,
          },
        ]}
      >
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.text, marginBottom: Spacing.two },
          ]}
        >
          Elmas Nakit Çekim Ayarları
        </Text>
        <View style={[styles.switchRow, { marginBottom: Spacing.two }]}>
          <View style={{ flex: 1, paddingRight: Spacing.three }}>
            <Text
              style={[
                styles.inputLabel,
                { color: colors.textSecondary, marginTop: 0 },
              ]}
            >
              Nakit Çekimini Aktifleştir
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 11,
                marginTop: 4,
                lineHeight: 14,
              }}
            >
              Aktif edildiğinde kullanıcılar elmaslarını nakite çevirebilir ve
              nakit çekim talebinde bulunabilir.
            </Text>
          </View>
          <Switch
            value={cashWithdrawalEnabled}
            onValueChange={setCashWithdrawalEnabled}
            trackColor={{ false: "#767577", true: colors.primary }}
            thumbColor={cashWithdrawalEnabled ? "#f4f3f4" : "#f4f3f4"}
          />
        </View>
        {cashWithdrawalEnabled && (
          <>
            <Text
              style={[
                styles.inputLabel,
                {
                  color: colors.textSecondary,
                  marginTop: Spacing.two,
                  marginBottom: Spacing.one,
                },
              ]}
            >
              Kullanıcıya Ödenecek Yüzde (%)
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: isDark ? "#1C212E" : "#F2F4F7",
                  borderColor: isDark ? "#2A3347" : "#E2E8F0",
                },
              ]}
              keyboardType="decimal-pad"
              value={cashoutUserPercentage}
              onChangeText={setCashoutUserPercentage}
              placeholder="50"
              placeholderTextColor={colors.textSecondary}
            />
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12,
                marginTop: Spacing.two,
                lineHeight: 16,
              }}
            >
              Örnek: 50 girilirse, elmas nakit değerinin yarısı kullanıcıya
              transfer edilir, kalan yarısı uygulamada kalır.
            </Text>
          </>
        )}
      </View>

      <View
        style={[
          styles.adminCard,
          {
            backgroundColor: colors.backgroundElement,
            borderColor: colors.border,
            marginTop: Spacing.three,
            borderRadius: 16,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Eşleşme Ayarları
        </Text>
        <Text
          style={[
            styles.inputLabel,
            {
              color: colors.textSecondary,
              marginTop: Spacing.three,
              marginBottom: Spacing.one,
            },
          ]}
        >
          VIP Olmayanlar için Günlük Eşleşme Sınırı
        </Text>

        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: isDark ? "#1C212E" : "#F2F4F7",
              borderColor: isDark ? "#2A3347" : "#E2E8F0",
            },
          ]}
          keyboardType="numeric"
          value={dailyMatchLimit}
          onChangeText={setDailyMatchLimit}
        />
      </View>

      {/* Diamond Package Management */}
      <View
        style={[
          styles.adminCard,
          {
            backgroundColor: colors.backgroundElement,
            borderColor: colors.border,
            marginTop: Spacing.three,
            borderRadius: 16,
          },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            <Ionicons name="diamond" size={18} color="#A855F7" /> Elmas Paketleri
            Yönetimi
          </Text>
          <TouchableOpacity
            onPress={() => openPackageModal()}
            style={{
              backgroundColor: "#A855F7",
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 10,
              gap: 4,
            }}
          >
            <Ionicons name="add" size={16} color="#FFF" />
            <Text
              style={{
                color: "#FFF",
                fontWeight: "bold",
                fontSize: 12,
              }}
            >
              Paket Ekle
            </Text>
          </TouchableOpacity>
        </View>

        {diamondPackages.length === 0 ? (
          <Text
            style={{
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: Spacing.four,
              fontSize: 14,
            }}
          >
            Henüz paket oluşturulmamış.
          </Text>
        ) : (
          diamondPackages.map((pkg) => (
            <View
              key={pkg.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: pkg.is_active
                  ? isDark
                    ? "#1E1B3A"
                    : "#F3F0FF"
                  : isDark
                    ? "#161922"
                    : "#F5F5F5",
                borderRadius: 12,
                padding: 12,
                marginTop: Spacing.two,
                borderWidth: 1,
                borderColor: pkg.is_active ? "#A855F730" : colors.border,
                opacity: pkg.is_active ? 1 : 0.6,
              }}
            >
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="diamond" size={16} color="#A855F7" />
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: "bold",
                      fontSize: 15,
                    }}
                  >
                    {pkg.amount} Elmas
                  </Text>
                  {pkg.badge && (
                    <View
                      style={{
                        backgroundColor: getBadgeColor(pkg.badge) + "20",
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: getBadgeColor(pkg.badge),
                          fontSize: 10,
                          fontWeight: "bold",
                        }}
                      >
                        {getBadgeLabel(pkg.badge)}
                      </Text>
                    </View>
                  )}
                  {!pkg.is_active && (
                    <View
                      style={{
                        backgroundColor: "#EF444420",
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: "#EF4444",
                          fontSize: 10,
                          fontWeight: "bold",
                        }}
                      >
                        Pasif
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 13,
                    marginTop: 4,
                  }}
                >
                  {Number(pkg.price).toFixed(2)} TL • Sıra: {pkg.sort_order}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TouchableOpacity
                  onPress={() => openPackageModal(pkg)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: colors.primary + "15",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="pencil" size={14} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeletePackage(pkg)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: "#EF444415",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="trash" size={14} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Maintenance Mode Card */}
      <View
        style={[
          styles.adminCard,
          {
            backgroundColor: colors.backgroundElement,
            borderColor: colors.border,
            marginTop: Spacing.three,
            borderRadius: 16,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Bakım Modu Ayarı
        </Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: Spacing.three }}>
            <Text
              style={[
                styles.inputLabel,
                { color: colors.textSecondary, marginTop: 0 },
              ]}
            >
              Bakım Modunu Aktifleştir
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 11,
                marginTop: 4,
                lineHeight: 14,
              }}
            >
              Aktif edildiğinde yöneticiler hariç tüm üyelerin uygulamaya
              erişimi engellenir.
            </Text>
          </View>
          <Switch
            value={maintenanceModeActive}
            onValueChange={setMaintenanceModeActive}
            trackColor={{ false: "#767577", true: colors.primary }}
            thumbColor={maintenanceModeActive ? "#f4f3f4" : "#f4f3f4"}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, { backgroundColor: colors.primary }]}
        onPress={handleSaveSettings}
      >
        <Ionicons
          name="save-outline"
          size={18}
          color={isDark ? "#000" : "#FFF"}
          style={{ marginRight: 6 }}
        />
        <Text
          style={[styles.saveButtonText, { color: isDark ? "#000" : "#FFF" }]}
        >
          Ayarları Kaydet
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
