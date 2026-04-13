import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MobileShell } from '@/components/navigation/mobile-shell';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppSpacing, AppTypography } from '@/constants/design';
import { getAuthErrorMessage } from '@/features/auth/auth.errors';
import { useAuth } from '@/features/auth/auth-provider';
import { useActiveHome } from '@/features/homes/use-active-home';

export default function HomeDashboardPlaceholderScreen() {
  const params = useLocalSearchParams<{ homeId?: string; homeName?: string }>();
  const { home: activeHome } = useActiveHome();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { logout, status, user } = useAuth();
  const homeName =
    typeof params.homeName === 'string' ? params.homeName : activeHome?.name ?? 'Mi hogar';
  const homeId = typeof params.homeId === 'string' ? params.homeId : activeHome?.id;

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
      <MobileShell activeTab="home">
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <Animated.View entering={FadeInUp.duration(420)} style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>Mi hogar</Text>
                <Text style={styles.title}>{homeName}</Text>
                <Text style={styles.subtitle}>
                  Este es el destino temporal mientras portamos el dashboard real del template.
                </Text>
                {user ? <Text style={styles.userEmail}>{user.email}</Text> : null}
              </View>

              <Pressable
                accessibilityLabel="Cerrar sesion"
                accessibilityRole="button"
                onPress={handleLogout}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <Feather color={AppColors.text} name="log-out" size={18} />
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(120).duration(480)} style={styles.card}>
              <Text style={styles.cardTitle}>Home seleccionado</Text>
              <View style={styles.list}>
                <View style={styles.listItem}>
                  <View style={styles.bullet} />
                  <Text style={styles.listText}>{homeName}</Text>
                </View>
                {homeId ? (
                  <View style={styles.listItem}>
                    <View style={styles.bullet} />
                    <Text numberOfLines={1} style={styles.listText}>
                      {homeId}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(520)} style={styles.footer}>
              <PrimaryButton
                accessibilityLabel="Cambiar hogar"
                label="Cambiar hogar"
                onPress={() => router.replace('/home')}
              />
              <PrimaryButton
                accessibilityLabel="Cerrar sesion"
                disabled={isSigningOut}
                label={isSigningOut ? 'Cerrando sesion...' : 'Cerrar sesion'}
                onPress={handleLogout}
              />
            </Animated.View>
          </View>
        </SafeAreaView>
      </MobileShell>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    gap: AppSpacing.xl,
    paddingHorizontal: AppSpacing.screenHorizontal,
    paddingTop: AppSpacing.screenTop,
    paddingBottom: AppSpacing.screenBottom,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  eyebrow: {
    color: AppColors.mutedText,
    fontSize: 12,
    fontWeight: AppTypography.medium,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 2,
    color: AppColors.text,
    fontSize: 20,
    fontWeight: AppTypography.bold,
    letterSpacing: AppTypography.tightLetterSpacing,
  },
  subtitle: {
    maxWidth: 300,
    marginTop: AppSpacing.sm,
    color: AppColors.mutedText,
    fontSize: AppTypography.bodySize,
    lineHeight: 24,
  },
  userEmail: {
    marginTop: AppSpacing.md,
    color: AppColors.text,
    fontSize: AppTypography.captionSize,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.surface,
  },
  card: {
    gap: AppSpacing.lg,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.surface,
    padding: AppSpacing.xl,
  },
  cardTitle: {
    color: AppColors.text,
    fontSize: 20,
    fontWeight: AppTypography.semiBold,
  },
  list: {
    gap: AppSpacing.md,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  bullet: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: AppColors.primary,
  },
  listText: {
    flex: 1,
    color: AppColors.text,
    fontSize: AppTypography.bodySize,
    lineHeight: 22,
  },
  footer: {
    gap: AppSpacing.md,
  },
  pressed: {
    opacity: 0.88,
  },
});
