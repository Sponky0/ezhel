/* eslint-disable react-hooks/immutability */
import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Platform,
} from 'react-native';
import { useColorScheme } from '../hooks/use-color-scheme';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Colors, Fonts } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadMessages } from '@/contexts/UnreadMessagesContext';

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

// Sekme çubuğundaki görsel sıra. Navigatördeki bildirim sırasından bağımsızdır;
// böylece başlangıç sekmesi (index) navigatörde ilk olsa da çubukta istenen
// konumda görünür.
const TAB_ORDER = ['stories', 'chat', 'index', 'explore', 'profile'];


interface CustomTabItemProps {
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  renderIcon: () => React.ReactNode;
  label: string;
  colors: typeof Colors.light | typeof Colors.dark;
  badgeCount?: number;
}

function CustomTabItem({
  isFocused,
  onPress,
  onLongPress,
  renderIcon,
  label,
  colors,
  badgeCount = 0,
}: CustomTabItemProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 12, stiffness: 350 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 350 });
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabItem}
    >
      <Animated.View style={[styles.tabItemContent, animatedStyle]}>
        <View style={styles.iconContainer}>
          {renderIcon()}
          {badgeCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {badgeCount > 99 ? '99+' : badgeCount}
              </Text>
            </View>
          )}
        </View>
        <Text
          style={[
            styles.labelText,
            {
              color: isFocused ? colors.primary : colors.textSecondary,
              fontWeight: isFocused ? '600' : '500',
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function CustomTabBar({
  state,
  descriptors,
  navigation,
}: CustomTabBarProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = Colors[isDark ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const { user, showLoginModal } = useAuth();
  const { totalUnread } = useUnreadMessages();

  // Hide tab bar if active screen option specifies tabBarStyle.display = 'none'
  const activeRoute = state.routes[state.index];
  const activeOptions = descriptors[activeRoute?.key]?.options;
  if (activeOptions?.tabBarStyle?.display === 'none') {
    return null;
  }

  // Calculate bottom margin: dynamic based on safe area home indicator
  const bottomMargin = insets.bottom > 0 ? insets.bottom + 8 : 16;

  // Outer container background for android/web when blur isn't fully transparent
  const blurBgColor = isDark
    ? 'rgba(12, 16, 20, 0.85)'
    : 'rgba(255, 255, 255, 0.82)';

  const barBorderColor = isDark
    ? 'rgba(255, 255, 255, 0.07)'
    : 'rgba(0, 0, 0, 0.05)';

  return (
    <View style={[styles.container, { bottom: bottomMargin }]}>
      <View
        style={[
          styles.shadowContainer,
          {
            shadowColor: isDark ? '#000000' : '#0F172A',
            backgroundColor: 'transparent',
          },
        ]}
      >
        <BlurView
          intensity={85}
          tint={isDark ? 'dark' : 'light'}
          style={[
            styles.blurView,
            {
              borderColor: barBorderColor,
              backgroundColor: blurBgColor,
            },
          ]}
        >
          {/* Tab Buttons */}
          <View style={styles.tabsWrapper}>
            {[...state.routes]
              .sort(
                (a: any, b: any) =>
                  TAB_ORDER.indexOf(a.name) - TAB_ORDER.indexOf(b.name),
              )
              .map((route: any) => {
              const { options } = descriptors[route.key];
              const label =
                options.tabBarLabel !== undefined
                  ? options.tabBarLabel
                  : options.title !== undefined
                  ? options.title
                  : route.name;

              const isFocused = state.routes[state.index]?.key === route.key;

              const onPress = () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  if (!user) {
                    showLoginModal();
                    return;
                  }
                  navigation.navigate(route.name);
                }
              };

              const onLongPress = () => {
                navigation.emit({
                  type: 'tabLongPress',
                  target: route.key,
                });
              };

              const renderIcon = () => {
                if (options.tabBarIcon) {
                  return options.tabBarIcon({
                    focused: isFocused,
                    color: isFocused ? colors.primary : colors.textSecondary,
                    size: 20,
                  });
                }
                return null;
              };

              return (
                <CustomTabItem
                  key={route.key}
                  isFocused={isFocused}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  renderIcon={renderIcon}
                  label={typeof label === 'string' ? label : route.name}
                  colors={colors}
                  badgeCount={route.name === 'chat' ? totalUnread : 0}
                />
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    zIndex: 99,
  },
  shadowContainer: {
    width: '92%',
    maxWidth: 440,
    borderRadius: 35,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
      web: {
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      },
    }),
  },
  blurView: {
    height: 64,
    borderRadius: 35,
    overflow: 'hidden',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    position: 'relative',
    justifyContent: 'center',
  },
  tabsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: '100%',
    zIndex: 2,
  },
  tabItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconContainer: {
    height: 24,
    minWidth: 28,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -7,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    fontFamily: Fonts.bodyMedium,
  },
  labelText: {
    fontSize: 10,
    marginTop: 2,
    fontFamily: Fonts.bodyMedium,
  },
});
