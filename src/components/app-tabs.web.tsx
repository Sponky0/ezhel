// @ts-nocheck
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { Tabs } from "expo-router";
import React, { useEffect } from "react";
import {
  Pressable,
  View,
  StyleSheet,
  Text,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useColorScheme } from "../hooks/use-color-scheme";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";

const SIDEBAR_WIDTH_EXPANDED = 244;
const SIDEBAR_WIDTH_COLLAPSED = 72;
const MOBILE_TAB_BAR_HEIGHT = 64;

// Tab Order on Web (Instagram-like: Home/Explore first, then updates, Match, Chat, Profile)
const TAB_ORDER_WEB = ["index", "stories", "explore", "chat", "profile"];

interface RouteInfo {
  name: string;
  key: string;
}

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const { width } = useWindowDimensions();

  // Dynamically update the main screen container's margin/padding on Web
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const updateLayout = () => {
      // Find the sidebar element in the DOM
      const sidebar = document.querySelector('[data-sidebar="true"]');
      if (sidebar && sidebar.parentElement) {
        // Find the sibling screen container
        const screenContainer = Array.from(sidebar.parentElement.children).find(
          (child) => child !== sidebar
        );
        if (screenContainer) {
          const w = window.innerWidth;
          if (w < 768) {
            (screenContainer as HTMLElement).style.marginLeft = "0px";
            (screenContainer as HTMLElement).style.paddingBottom = `${MOBILE_TAB_BAR_HEIGHT}px`;
          } else if (w < 1264) {
            (screenContainer as HTMLElement).style.marginLeft = `${SIDEBAR_WIDTH_COLLAPSED}px`;
            (screenContainer as HTMLElement).style.paddingBottom = "0px";
          } else {
            (screenContainer as HTMLElement).style.marginLeft = `${SIDEBAR_WIDTH_EXPANDED}px`;
            (screenContainer as HTMLElement).style.paddingBottom = "0px";
          }
        }
      }
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    const timer = setTimeout(updateLayout, 100);

    return () => {
      window.removeEventListener("resize", updateLayout);
      clearTimeout(timer);
    };
  }, [width]);

  return (
    <Tabs
      tabBar={(props) => <WebTabBar {...props} />}
      // @ts-ignore
      sceneContainerStyle={{
        backgroundColor: colors.background,
        flex: 1,
      }}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Keşfet",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "compass" : "compass-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="stories"
        options={{
          title: "Hikayeler",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "flame" : "flame-outline"}
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
              name={focused ? "radio" : "radio-outline"}
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
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person-circle" : "person-circle-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

/* ─── Custom Web Tab Bar ────────────────────────────────────────── */

function WebTabBar({ state, descriptors, navigation }: any) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const colors = Colors[isDark ? "dark" : "light"];
  const { profile } = useAuth();
  const { width } = useWindowDimensions();

  const isMobile = width < 768;
  const isExpanded = width >= 1264;

  const sortedRoutes = [...state.routes].sort((a: RouteInfo, b: RouteInfo) => {
    return TAB_ORDER_WEB.indexOf(a.name) - TAB_ORDER_WEB.indexOf(b.name);
  });

  // Render Mobile Bottom Tab Bar
  if (isMobile) {
    return (
      <View
        style={[
          styles.mobileTabBar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
        ]}
      >
        {sortedRoutes.map((route: any) => {
          const { options } = descriptors[route.key];
          const isFocused = state.routes[state.index]?.key === route.key;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const renderIcon = () => {
            if (route.name === "profile" && profile?.avatar_url) {
              return (
                <View
                  style={[
                    styles.avatarContainer,
                    isFocused && { borderColor: colors.text, borderWidth: 1.5 },
                  ]}
                >
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={styles.avatarImage}
                  />
                </View>
              );
            }
            if (options.tabBarIcon) {
              return options.tabBarIcon({
                focused: isFocused,
                color: isFocused ? colors.text : colors.textSecondary,
                size: 24,
              });
            }
            return null;
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.mobileTabItem}
            >
              {renderIcon()}
            </Pressable>
          );
        })}
      </View>
    );
  }

  // Render Desktop Left Sidebar
  return (
    // @ts-ignore
    <View
      dataSet={{ sidebar: "true" }} // Add data-sidebar attribute for DOM lookup
      style={[
        styles.sidebar,
        {
          width: isExpanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED,
          backgroundColor: colors.background,
          borderRightColor: colors.border,
        },
      ]}
    >
      {/* Brand Section */}
      <View style={styles.brandSection}>
        {isExpanded ? (
          <Text style={[styles.brandText, { color: colors.text }]}>Napan</Text>
        ) : (
          <View style={[styles.brandIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="chatbubble-ellipses" size={20} color="#FFFFFF" />
          </View>
        )}
      </View>

      {/* Navigation Items */}
      <View style={styles.navSection}>
        {sortedRoutes.map((route: any) => {
          const { options } = descriptors[route.key];
          const isFocused = state.routes[state.index]?.key === route.key;

          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const renderIcon = () => {
            if (route.name === "profile" && profile?.avatar_url) {
              return (
                <View
                  style={[
                    styles.avatarContainer,
                    isFocused && { borderColor: colors.text, borderWidth: 2 },
                  ]}
                >
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={styles.avatarImage}
                  />
                </View>
              );
            }
            if (options.tabBarIcon) {
              return options.tabBarIcon({
                focused: isFocused,
                color: isFocused ? colors.text : colors.textSecondary,
                size: 24,
              });
            }
            return null;
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ hovered }: any) => [
                styles.sidebarItemPressable,
                hovered && { backgroundColor: colors.backgroundElement },
              ]}
            >
              <View
                style={[
                  styles.sidebarItemInner,
                  !isExpanded && { justifyContent: "center" },
                ]}
              >
                <View style={styles.iconWrapper}>{renderIcon()}</View>
                {isExpanded && (
                  <Text
                    style={[
                      styles.sidebarLabel,
                      {
                        color: colors.text,
                        fontFamily: Fonts.body,
                      },
                      isFocused && {
                        fontWeight: "700",
                        fontFamily: Fonts.bodyMedium,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Bottom section (Menu / More button) */}
      <View style={styles.bottomSection}>
        <Pressable
          style={({ hovered }: any) => [
            styles.sidebarItemPressable,
            hovered && { backgroundColor: colors.backgroundElement },
          ]}
        >
          <View
            style={[
              styles.sidebarItemInner,
              !isExpanded && { justifyContent: "center" },
            ]}
          >
            <Ionicons name="menu-outline" size={26} color={colors.text} />
            {isExpanded && (
              <Text
                style={[
                  styles.sidebarLabel,
                  {
                    color: colors.text,
                    fontFamily: Fonts.body,
                  },
                ]}
              >
                Daha Fazla
              </Text>
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

/* ─── Styles ──────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  sidebar: {
    position: "fixed",
    left: 0,
    top: 0,
    bottom: 0,
    borderRightWidth: 1,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.three,
    justifyContent: "flex-start",
    zIndex: 100,
  },
  brandSection: {
    height: 60,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.five,
    justifyContent: "center",
  },
  brandText: {
    fontSize: 22,
    fontWeight: "bold",
    letterSpacing: -0.5,
    fontFamily: Fonts.heading,
  },
  brandIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  navSection: {
    flex: 1,
    gap: 4,
  },
  bottomSection: {
    borderTopWidth: 0,
    paddingTop: Spacing.two,
  },
  sidebarItemPressable: {
    borderRadius: 8,
    overflow: "hidden",
    marginVertical: 2,
    // @ts-ignore — web-only transition
    transition: "background-color 0.15s ease",
  },
  sidebarItemInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.four,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  iconWrapper: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  sidebarLabel: {
    fontSize: 16,
    lineHeight: 22,
  },
  avatarContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  // Mobile Bottom Tab Bar Styles
  mobileTabBar: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    height: MOBILE_TAB_BAR_HEIGHT,
    flexDirection: "row",
    borderTopWidth: 1,
    justifyContent: "space-around",
    alignItems: "center",
    zIndex: 100,
    paddingBottom: 4,
  },
  mobileTabItem: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
});
