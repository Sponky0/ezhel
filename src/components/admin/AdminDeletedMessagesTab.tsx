import React from "react";
import { View, Text, FlatList, Image } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { DeletedMessage } from "./admin.types";
import { adminStyles as styles } from "./admin.styles";

interface AdminDeletedMessagesTabProps {
  deletedMsgs: DeletedMessage[];
  colors: any;
  isDark: boolean;
}

export function AdminDeletedMessagesTab({
  deletedMsgs,
  colors,
  isDark,
}: AdminDeletedMessagesTabProps) {
  return (
    <FlatList
      data={deletedMsgs}
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
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons
                name="person-circle-outline"
                size={20}
                color={colors.textSecondary}
              />
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                @{item.sender_username}
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              {new Date(item.deleted_at).toLocaleString([], {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>

          <View
            style={[
              styles.deletedMsgBubble,
              {
                backgroundColor: isDark ? "#161922" : "#F1F5F9",
                padding: 12,
                borderRadius: 12,
              },
            ]}
          >
            {item.media_url ? (
              <View style={{ position: "relative" }}>
                <Image
                  source={{ uri: item.media_url }}
                  style={styles.msgImagePreview}
                />
                <View style={styles.imageBadge}>
                  <Ionicons name="image" size={10} color="#FFF" />
                  <Text
                    style={{
                      color: "#FFF",
                      fontSize: 9,
                      fontWeight: "700",
                      marginLeft: 2,
                    }}
                  >
                    Fotoğraf
                  </Text>
                </View>
              </View>
            ) : (
              <Text
                style={{
                  color: colors.text,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {item.content}
              </Text>
            )}
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 10, color: colors.textSecondary }}>
              Silinme: {new Date(item.deleted_at).toLocaleDateString()}
            </Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Silinen mesaj kaydı bulunmuyor.
        </Text>
      }
    />
  );
}
