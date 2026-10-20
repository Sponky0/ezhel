import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useColorScheme } from "../hooks/use-color-scheme";

import CustomTabBar from "@/components/custom-tab-bar";
import { AppIcons } from "@/constants/icons";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const { profile } = useAuth();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* index (Keşfet) navigatörde İLK sırada => uygulama açılışta bu sekmeyle
          başlar. Sekme çubuğundaki görsel sıra custom-tab-bar.tsx'te
          TAB_ORDER ile ayrıca sabitlenir (görsel sıra: Güncellemeler, Sohbetler,
          Keşfet, Eşleş, Siz). */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Keşfet",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "compass" : AppIcons.explore}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="stories"
        options={{
          title: "Güncellemeler",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "flame" : AppIcons.hot}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Sohbetler",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : AppIcons.chat}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Eşleş",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "infinite" : AppIcons.unlimited}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Siz",
          tabBarIcon: ({ color, focused }) => {
            if (profile?.avatar_url) {
              return (
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: focused ? color : colors.border,
                    overflow: "hidden",
                  }}
                >
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={{
                      width: "100%",
                      height: "100%",
                    }}
                  />
                </View>
              );
            }
            return (
              <Ionicons
                name={focused ? "person" : "person-outline"}
                size={24}
                color={color}
              />
            );
          },
        }}
      />
    </Tabs>
  );
}
