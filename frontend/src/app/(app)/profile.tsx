import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MobileShell } from '@/components/navigation/mobile-shell';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppGradients, AppSpacing, AppTypography } from '@/constants/design';
import { getAuthErrorMessage } from '@/features/auth/auth.errors';
import { useAuth } from '@/features/auth/auth-provider';
import { useActiveHome } from '@/features/homes/use-active-home';

const ENERGY_GRADIENT = { experimental_backgroundImage: AppGradients.energy } as const;

export default function ProfileScreen() {
  const { home } = useActiveHome();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { logout, status, user } = useAuth();
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'Energy Sentinel';

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
    }
  }, [status]);

  if (status !== 'authenticated') {
    return <ScreenBackground />;
  }

  const handleLogout = async () => {
    setIsSigningOut(true);

    try {
      await logout();
    } catch (error) {
      console.warn(getAuthErrorMessage(error, 'logout'));
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <ScreenBackground>
      <MobileShell activeTab="profile">
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(380)}>
              <Text style={styles.title}>Perfil</Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(60).duration(400)} style={styles.userCard}>
              <View style={[styles.userIcon, ENERGY_GRADIENT]}>
                <Feather color={AppColors.text} name="user" size={28} />
              </View>
              <View style={styles.cardTextBlock}>
                <Text style={styles.userName}>{displayName}</Text>
                <Text style={styles.userEmail}>{user?.email ?? 'Cuenta activa'}</Text>
              </View>
              <Feather color={AppColors.mutedText} name="chevron-right" size={16} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(120).duration(420)}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/home')}
                style={({ pressed }) => [styles.homeCard, pressed && styles.pressed]}>
                <View style={styles.homeIcon}>
                  <Feather color={AppColors.secondaryText} name="home" size={20} />
                </View>
                <View style={styles.cardTextBlock}>
                  <Text style={styles.homeName}>{home?.name ?? 'Seleccionar hogar'}</Text>
                  <Text style={styles.homeMeta}>
                    {home?.deviceCountLabel
                      ? `${home.deviceCountLabel} · Cambiar hogar`
                      : 'Cambiar hogar'}
                  </Text>
                </View>
                <Feather color={AppColors.mutedText} name="chevron-right" size={16} />
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(180).duration(440)} style={styles.menu}>
              <MenuItem
                color={AppColors.primary}
                description="Conectar o administrar"
                icon="link-2"
                label="Integracion Shelly"
                onPress={() => router.push('/shelly-integration')}
              />
              <MenuItem
                color={AppColors.mutedText}
                description="Cambiar contrasena"
                icon="shield"
                label="Seguridad"
              />
              <MenuItem
                color={AppColors.mutedText}
                description="Preguntas frecuentes"
                icon="help-circle"
                label="Ayuda"
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(240).duration(460)}>
              <Pressable
                accessibilityRole="button"
                disabled={isSigningOut}
                onPress={handleLogout}
                style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}>
                <Feather color={AppColors.destructive} name="log-out" size={16} />
                <Text style={styles.logoutText}>
                  {isSigningOut ? 'Cerrando sesion...' : 'Cerrar sesion'}
                </Text>
              </Pressable>
            </Animated.View>
          </ScrollView>
        </SafeAreaView>
      </MobileShell>
    </ScreenBackground>
  );
}

function MenuItem({
  color,
  description,
  icon,
  label,
  onPress,
}: {
  color: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
      <Feather color={color} name={icon} size={20} />
      <View style={styles.cardTextBlock}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuDescription}>{description}</Text>
      </View>
      <Feather color={AppColors.mutedText} name="chevron-right" size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    gap: AppSpacing.xl,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 24,
  },
  title: {
    color: AppColors.text,
    fontSize: 20,
    fontWeight: AppTypography.bold,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: 'rgba(24, 29, 37, 0.8)',
    padding: 20,
  },
  userIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  cardTextBlock: {
    flex: 1,
  },
  userName: {
    color: AppColors.text,
    fontSize: 16,
    fontWeight: AppTypography.semiBold,
  },
  userEmail: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 14,
  },
  homeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: 'rgba(24, 29, 37, 0.8)',
    padding: AppSpacing.lg,
  },
  homeIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: AppColors.secondary,
  },
  homeName: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  homeMeta: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 12,
  },
  menu: {
    gap: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    borderRadius: 12,
    padding: 14,
  },
  menuItemPressed: {
    backgroundColor: 'rgba(35, 39, 47, 0.5)',
  },
  menuLabel: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.medium,
  },
  menuDescription: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 12,
  },
  logoutButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.sm,
    borderRadius: 12,
  },
  logoutText: {
    color: AppColors.destructive,
    fontSize: 14,
    fontWeight: AppTypography.medium,
  },
  pressed: {
    opacity: 0.86,
  },
});
