import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface HeaderProps {
  title: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  showSearch?: boolean;
  rightElement?: React.ReactNode;
}

export function Header({
  title,
  searchPlaceholder = 'Ara...',
  searchValue = '',
  onSearchChange,
  showSearch = true,
  rightElement,
}: HeaderProps) {
  const colors = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.container}>
      {/* Title Row */}
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        {rightElement && (
          <View style={styles.rightContainer}>
            {rightElement}
          </View>
        )}
      </View>

      {/* Search Input Row */}
      {showSearch && onSearchChange && (
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: isFocused ? colors.primary : colors.border,
              },
            ]}
          >
            <Ionicons
              name="search"
              size={18}
              color={isFocused ? colors.primary : colors.textSecondary}
              style={styles.searchIcon}
            />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={searchValue}
              onChangeText={onSearchChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchValue.length > 0 && (
              <TouchableOpacity
                onPress={() => onSearchChange('')}
                style={styles.clearButton}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
    minHeight: 40,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.headingBlack,
    fontWeight: Platform.OS === 'web' ? '800' : undefined,
    letterSpacing: -0.5,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchContainer: {
    width: '100%',
    marginTop: Spacing.one,
    marginBottom: Spacing.one,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
  },
  searchIcon: {
    marginRight: Spacing.two,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontFamily: Fonts.body,
    fontSize: 15,
    paddingVertical: 0, // fix for vertical alignment on Android
  },
  clearButton: {
    padding: Spacing.one,
  },
});
