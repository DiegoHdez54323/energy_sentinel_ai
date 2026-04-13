import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppColors, AppGradients, AppSpacing, AppTypography } from '@/constants/design';

type TabId = 'consumption' | 'devices' | 'home' | 'profile';

type MobileShellProps = PropsWithChildren<{
  activeTab: TabId;
}>;

const ACTIVE_INDICATOR = { experimental_backgroundImage: AppGradients.primary } as const;

const TABS: {
  icon: keyof typeof Feather.glyphMap;
  id: TabId;
  label: string;
  route: '/consumption' | '/devices' | '/home-dashboard' | '/profile';
}[] = [
  { icon: 'home', id: 'home', label: 'Inicio', route: '/home-dashboard' },
  { icon: 'cpu', id: 'devices', label: 'Dispositivos', route: '/devices' },
  { icon: 'zap', id: 'consumption', label: 'Consumo', route: '/consumption' },
  { icon: 'user', id: 'profile', label: 'Perfil', route: '/profile' },
];

export function MobileShell({ activeTab, children }: MobileShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.shell}>
      <View style={[styles.content, { paddingBottom: 76 + insets.bottom }]}>{children}</View>

      <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.tabsRow}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <Pressable
                accessibilityRole="button"
                key={tab.id}
                onPress={() => router.replace(tab.route)}
                style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
                <Feather
                  color={isActive ? AppColors.primary : AppColors.mutedText}
                  name={tab.icon}
                  size={20}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
                {isActive ? <View style={[styles.activeIndicator, ACTIVE_INDICATOR]} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  content: {
    flex: 1,
  },
  nav: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    borderTopWidth: 1,
    borderTopColor: AppColors.cardBorder,
    backgroundColor: 'rgba(24, 29, 37, 0.9)',
    paddingTop: AppSpacing.sm,
    paddingHorizontal: AppSpacing.sm,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    minWidth: 72,
    alignItems: 'center',
    gap: 2,
    borderRadius: 12,
    paddingHorizontal: AppSpacing.md,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabLabel: {
    color: AppColors.mutedText,
    fontSize: 10,
    fontWeight: AppTypography.semiBold,
  },
  tabLabelActive: {
    color: AppColors.primary,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 32,
    height: 2,
    borderRadius: 999,
  },
  pressed: {
    opacity: 0.84,
  },
});
