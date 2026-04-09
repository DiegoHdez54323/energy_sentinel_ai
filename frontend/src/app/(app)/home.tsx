import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppSpacing, AppTypography } from '@/constants/design';
import { getAuthErrorMessage } from '@/features/auth/auth.errors';
import { useAuth } from '@/features/auth/auth-provider';

const ITEMS = [
  'Dashboard principal de consumo',
  'Dispositivos y detalle por hogar',
  'Integracion con la API real de autenticacion',
];

export default function HomePlaceholderScreen() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { logout, status, user } = useAuth();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
    }
  }, [status]);

  const handleLogout = async () => {
    setIsSigningOut(true);

    try {
      await logout();
      router.replace('/login');
    } catch (error) {
      console.warn(getAuthErrorMessage(error, 'logout'));
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Animated.View entering={FadeInUp.duration(450)} style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Energy Sentinel</Text>
              <Text style={styles.title}>Aplicacion en construccion</Text>
              <Text style={styles.subtitle}>
                Este es el destino temporal despues del auth mientras portamos las demas pantallas
                del template a Expo.
              </Text>
              {user ? <Text style={styles.userEmail}>{user.email}</Text> : null}
            </View>

            <Pressable onPress={handleLogout} style={styles.iconButton}>
              <Feather color={AppColors.text} name="log-out" size={18} />
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={styles.card}>
            <Text style={styles.cardTitle}>Siguiente bloque</Text>
            <View style={styles.list}>
              {ITEMS.map((item) => (
                <View key={item} style={styles.listItem}>
                  <View style={styles.bullet} />
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(540)} style={styles.footer}>
            <PrimaryButton
              accessibilityLabel="Cerrar sesion"
              label={isSigningOut ? 'Cerrando sesion...' : 'Cerrar sesion'}
              onPress={handleLogout}
              disabled={isSigningOut}
            />
          </Animated.View>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: AppSpacing.screenHorizontal,
    paddingTop: AppSpacing.screenTop,
    paddingBottom: AppSpacing.screenBottom,
    justifyContent: 'space-between',
    gap: AppSpacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: AppSpacing.md,
  },
  eyebrow: {
    color: AppColors.primary,
    fontSize: 13,
    fontWeight: AppTypography.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  title: {
    marginTop: 10,
    color: AppColors.text,
    fontSize: AppTypography.titleSize,
    fontWeight: AppTypography.bold,
    letterSpacing: AppTypography.tightLetterSpacing,
  },
  subtitle: {
    marginTop: AppSpacing.sm,
    color: AppColors.mutedText,
    fontSize: AppTypography.bodySize,
    lineHeight: 24,
    maxWidth: 300,
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
    borderRadius: 28,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: AppSpacing.xl,
    gap: AppSpacing.lg,
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
});
