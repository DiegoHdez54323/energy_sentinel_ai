import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/empty-state';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppGradients, AppSpacing, AppTypography } from '@/constants/design';
import { useAuth } from '@/features/auth/auth-provider';
import { writeActiveHomeSelection } from '@/features/homes/active-home.storage';
import { getHomesErrorMessage } from '@/features/homes/homes.errors';
import type { HomeCardSummary } from '@/features/homes/homes.types';
import { useHomeSummaries } from '@/features/homes/use-home-summaries';

const ENERGY_GRADIENT = { experimental_backgroundImage: AppGradients.energy } as const;

export default function HomeSelectorScreen() {
  const { status } = useAuth();
  const { error, homes, reload, status: homesStatus } = useHomeSummaries();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
    }
  }, [status]);

  if (status !== 'authenticated') {
    return <ScreenBackground />;
  }

  const navigateToCreateHome = () => {
    router.push('/create-home');
  };

  const navigateToHome = async (home: HomeCardSummary) => {
    await writeActiveHomeSelection({
      deviceCountLabel: home.deviceCountLabel,
      id: home.id,
      name: home.name,
    });

    router.push({
      pathname: '/home-dashboard',
      params: {
        homeId: home.id,
        homeName: home.name,
      },
    });
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        {homesStatus === 'loading' ? (
          <View style={styles.centered}>
            <ActivityIndicator color={AppColors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              homes.length === 0 && styles.emptyScrollContent,
            ]}
            showsVerticalScrollIndicator={false}>
            {homesStatus === 'error' && homes.length === 0 ? (
              <EmptyState
                action={{ label: 'Reintentar', onPress: reload }}
                description={getHomesErrorMessage(error, 'list')}
                icon="home"
                title="No se pudieron cargar tus hogares"
              />
            ) : homes.length === 0 ? (
              <EmptyState
                action={{ label: 'Crear hogar', onPress: navigateToCreateHome }}
                description="Crea tu primer hogar para empezar a monitorear el consumo de tus dispositivos."
                icon="home"
                title="Sin hogares registrados"
              />
            ) : (
              <>
                <Animated.View entering={FadeInUp.duration(420)} style={styles.header}>
                  <View style={[styles.headerIcon, ENERGY_GRADIENT]}>
                    <Feather color={AppColors.text} name="zap" size={24} />
                  </View>
                  <Text style={styles.title}>Mis hogares</Text>
                  <Text style={styles.subtitle}>Selecciona un hogar para ver su consumo</Text>
                </Animated.View>

                <View style={styles.homesList}>
                  {homes.map((home, index) => (
                    <Animated.View
                      entering={FadeInDown.delay(80 + index * 60).duration(380)}
                      key={home.id}>
                      <HomeCard home={home} onPress={() => void navigateToHome(home)} />
                    </Animated.View>
                  ))}
                </View>

                <Animated.View entering={FadeInDown.delay(180).duration(420)}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={navigateToCreateHome}
                    style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                    <Feather color={AppColors.primary} name="plus" size={20} />
                    <Text style={styles.addButtonText}>Añadir nuevo hogar</Text>
                  </Pressable>
                </Animated.View>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

function HomeCard({
  home,
  onPress,
}: {
  home: HomeCardSummary;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardRow}>
        <View style={styles.homeIcon}>
          <Feather color={AppColors.secondaryText} name="home" size={24} />
        </View>

        <View style={styles.cardContent}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.homeName}>
              {home.name}
            </Text>
            {home.hasAnomaly ? <View style={styles.anomalyDot} /> : null}
          </View>

          <View style={styles.locationRow}>
            <Feather color={AppColors.mutedText} name="map-pin" size={12} />
            <Text numberOfLines={1} style={styles.locationText}>
              {home.locationLabel}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.deviceCount}>{home.deviceCountLabel}</Text>
            <Text style={styles.consumption}>{home.consumptionLabel}</Text>
          </View>
        </View>

        <Feather color={AppColors.mutedText} name="chevron-right" size={20} style={styles.chevron} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },
  emptyScrollContent: {
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
  },
  headerIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: AppSpacing.lg,
    borderRadius: 16,
  },
  title: {
    color: AppColors.text,
    fontSize: 24,
    fontWeight: AppTypography.bold,
    letterSpacing: AppTypography.tightLetterSpacing,
  },
  subtitle: {
    marginTop: 4,
    color: AppColors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  homesList: {
    gap: AppSpacing.md,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: 'rgba(24, 29, 37, 0.8)',
    padding: 20,
  },
  cardPressed: {
    borderColor: 'rgba(38, 128, 217, 0.2)',
    opacity: 0.94,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing.lg,
  },
  homeIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: AppColors.secondary,
  },
  cardContent: {
    flex: 1,
  },
  nameRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  homeName: {
    flexShrink: 1,
    color: AppColors.text,
    fontSize: 16,
    fontWeight: AppTypography.semiBold,
  },
  anomalyDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: AppColors.anomaly,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: AppSpacing.sm,
  },
  locationText: {
    color: AppColors.mutedText,
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    marginTop: AppSpacing.md,
  },
  deviceCount: {
    color: AppColors.mutedText,
    fontSize: 12,
  },
  consumption: {
    color: AppColors.primary,
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: AppTypography.medium,
  },
  chevron: {
    marginTop: 4,
  },
  addButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.xl,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: AppColors.border,
  },
  addButtonText: {
    color: AppColors.primary,
    fontSize: 14,
    fontWeight: AppTypography.medium,
  },
  pressed: {
    opacity: 0.88,
  },
});
