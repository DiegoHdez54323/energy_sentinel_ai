import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MobileShell } from '@/components/navigation/mobile-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppGradients, AppSpacing, AppTypography } from '@/constants/design';
import { getDashboardErrorMessage } from '@/features/dashboard/dashboard.errors';
import {
  formatDashboardEnergy,
  formatDashboardTrend,
  getDashboardStatusLabel,
} from '@/features/dashboard/dashboard.format';
import type {
  DashboardDevice,
  DashboardDeviceStatus,
  DashboardSummaryPeriod,
  HomeDashboardResponse,
} from '@/features/dashboard/dashboard.types';
import { useHomeDashboard } from '@/features/dashboard/use-home-dashboard';
import { useAuth } from '@/features/auth/auth-provider';
import { useActiveHome } from '@/features/homes/use-active-home';

const CARD_BACKGROUND = 'rgba(24, 29, 37, 0.82)';
const PRIMARY_GRADIENT = { experimental_backgroundImage: AppGradients.primary } as const;
const STATUS_COLORS = {
  anomaly: AppColors.anomaly,
  normal: AppColors.success,
  warning: '#D99A2B',
} as const satisfies Record<DashboardDeviceStatus, string>;

export default function HomeDashboardScreen() {
  const params = useLocalSearchParams<{ homeId?: string; homeName?: string }>();
  const { home: activeHome, isLoading: isActiveHomeLoading } = useActiveHome();
  const { status: authStatus } = useAuth();
  const requestedHomeId = typeof params.homeId === 'string' ? params.homeId : activeHome?.id;
  const requestedHomeName =
    typeof params.homeName === 'string' ? params.homeName : activeHome?.name ?? 'Casa Principal';
  const { dashboard, error, reload, status } = useHomeDashboard(requestedHomeId);

  useEffect(() => {
    if (authStatus === 'anonymous') {
      router.replace('/login');
    }
  }, [authStatus]);

  if (authStatus !== 'authenticated') {
    return <ScreenBackground />;
  }

  return (
    <ScreenBackground>
      <MobileShell activeTab="home">
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {renderContent({
              dashboard,
              error,
              isActiveHomeLoading,
              reload,
              requestedHomeId,
              requestedHomeName,
              status,
            })}
          </ScrollView>
        </SafeAreaView>
      </MobileShell>
    </ScreenBackground>
  );
}

function renderContent({
  dashboard,
  error,
  isActiveHomeLoading,
  reload,
  requestedHomeId,
  requestedHomeName,
  status,
}: {
  dashboard: HomeDashboardResponse | null;
  error: unknown;
  isActiveHomeLoading: boolean;
  reload: () => void;
  requestedHomeId?: string;
  requestedHomeName: string;
  status: string;
}) {
  if (isActiveHomeLoading) {
    return <LoadingState label="Cargando hogar..." />;
  }

  if (!requestedHomeId) {
    return (
      <EmptyState
        action={{ label: 'Seleccionar hogar', onPress: () => router.replace('/home') }}
        description="Elige una casa para ver el consumo y los dispositivos conectados."
        icon="home"
        title="Selecciona un hogar"
      />
    );
  }

  if (status === 'loading' && !dashboard) {
    return <LoadingState label="Cargando dashboard..." />;
  }

  if (status === 'error' && !dashboard) {
    return (
      <EmptyState
        action={{ label: 'Intentar de nuevo', onPress: reload }}
        description={getDashboardErrorMessage(error)}
        icon="alert-circle"
        title="No pudimos cargar el dashboard"
      />
    );
  }

  if (!dashboard) {
    return <LoadingState label="Cargando dashboard..." />;
  }

  return <DashboardContent dashboard={dashboard} fallbackHomeName={requestedHomeName} />;
}

function DashboardContent({
  dashboard,
  fallbackHomeName,
}: {
  dashboard: HomeDashboardResponse;
  fallbackHomeName: string;
}) {
  const activeAnomalies = dashboard.summary.activeAnomaliesCount;
  const homeName = dashboard.home.name || fallbackHomeName;

  return (
    <>
      <Animated.View entering={FadeInUp.duration(420)} style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Mi hogar</Text>
          <Text style={styles.title}>{homeName}</Text>
        </View>

        {activeAnomalies > 0 ? (
          <StatusBadge label={`${activeAnomalies} alerta`} size="md" status="anomaly" />
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(420)} style={styles.summaryGrid}>
        <ConsumptionSummary label="Hoy" period={dashboard.summary.today} />
        <ConsumptionSummary label="Esta semana" period={dashboard.summary.week} />
      </Animated.View>

      {dashboard.alert ? (
        <Animated.View entering={FadeInDown.delay(140).duration(440)}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/devices')}
            style={({ pressed }) => [styles.alertBanner, pressed && styles.pressed]}>
            <View style={styles.alertIcon}>
              <Feather color={AppColors.anomaly} name="zap" size={20} />
            </View>
            <View style={styles.alertTextBlock}>
              <Text style={styles.alertTitle}>Anomalía detectada</Text>
              <Text style={styles.alertText}>{dashboard.alert.message}</Text>
            </View>
            <Feather color={AppColors.mutedText} name="chevron-right" size={16} />
          </Pressable>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(200).duration(460)} style={styles.devicesSection}>
        <View style={styles.devicesHeader}>
          <Text style={styles.sectionTitle}>Dispositivos</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/shelly-discovery')}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <Feather color={AppColors.primary} name="plus" size={14} />
            <Text style={styles.addButtonText}>Añadir</Text>
          </Pressable>
        </View>

        {dashboard.devices.length > 0 ? (
          <View style={styles.deviceList}>
            {dashboard.devices.map((device, index) => (
              <Animated.View
                entering={FadeInDown.delay(240 + index * 45).duration(420)}
                key={device.id}>
                <DeviceCard device={device} />
              </Animated.View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyDevicesCard}>
            <Text style={styles.emptyDevicesTitle}>Sin dispositivos</Text>
            <Text style={styles.emptyDevicesText}>
              Importa tus dispositivos Shelly para empezar a ver consumo.
            </Text>
          </View>
        )}
      </Animated.View>
    </>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={AppColors.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

function ConsumptionSummary({
  label,
  period,
}: {
  label: string;
  period: DashboardSummaryPeriod;
}) {
  const trendLabel = formatDashboardTrend(period);
  const TrendIcon =
    period.trend === 'up' ? 'trending-up' : period.trend === 'down' ? 'trending-down' : 'minus';
  const trendColor =
    period.trend === 'down'
      ? AppColors.success
      : period.trend === 'up'
        ? STATUS_COLORS.warning
        : AppColors.mutedText;

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <View style={styles.summaryValueRow}>
        <Text style={styles.summaryValue}>{formatDashboardEnergy(period.energyWh)}</Text>
        <Text style={styles.summaryUnit}>kWh</Text>
      </View>
      {trendLabel ? (
        <View style={styles.trendRow}>
          <Feather color={trendColor} name={TrendIcon} size={12} />
          <Text style={[styles.trendText, { color: trendColor }]}>
            {trendLabel} vs. semana pasada
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function DeviceCard({ device }: { device: DashboardDevice }) {
  const isOn = device.isOn;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/devices')}
      style={({ pressed }) => [styles.deviceCard, pressed && styles.deviceCardPressed]}>
      <View style={[styles.deviceIcon, isOn ? PRIMARY_GRADIENT : styles.deviceIconOff]}>
        <Feather
          color={isOn ? AppColors.text : AppColors.mutedText}
          name="zap"
          size={20}
        />
      </View>
      <View style={styles.deviceTextBlock}>
        <View style={styles.deviceTitleRow}>
          <Text numberOfLines={1} style={styles.deviceName}>
            {device.name}
          </Text>
          <StatusBadge status={device.status} />
        </View>
        <Text style={styles.deviceMeta}>
          {isOn ? `${device.currentWatts}W` : 'Apagado'}
        </Text>
      </View>
      <Feather color={AppColors.mutedText} name="chevron-right" size={16} />
    </Pressable>
  );
}

function StatusBadge({
  label,
  size = 'sm',
  status,
}: {
  label?: string;
  size?: 'md' | 'sm';
  status: DashboardDeviceStatus;
}) {
  const icon = status === 'normal' ? 'check-circle' : status === 'warning' ? 'alert-triangle' : 'alert-circle';
  const color = STATUS_COLORS[status];

  return (
    <View
      style={[
        styles.statusBadge,
        size === 'md' && styles.statusBadgeMd,
        { backgroundColor: `${color}1A`, borderColor: `${color}40` },
      ]}>
      <Feather color={color} name={icon} size={size === 'md' ? 14 : 12} />
      <Text style={[styles.statusBadgeText, size === 'md' && styles.statusBadgeTextMd, { color }]}>
        {label ?? getDashboardStatusLabel(status)}
      </Text>
    </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  summaryGrid: {
    flexDirection: 'row',
    gap: AppSpacing.md,
  },
  summaryCard: {
    flex: 1,
    minHeight: 124,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    padding: AppSpacing.lg,
  },
  summaryLabel: {
    color: AppColors.mutedText,
    fontSize: 12,
    fontWeight: AppTypography.medium,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  summaryValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: AppSpacing.sm,
  },
  summaryValue: {
    color: AppColors.text,
    fontSize: 24,
    fontWeight: AppTypography.bold,
    letterSpacing: AppTypography.tightLetterSpacing,
  },
  summaryUnit: {
    color: AppColors.mutedText,
    fontSize: 14,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: AppSpacing.sm,
  },
  trendText: {
    flex: 1,
    fontSize: 11,
    fontWeight: AppTypography.medium,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(210, 56, 45, 0.18)',
    backgroundColor: 'rgba(210, 56, 45, 0.07)',
    padding: AppSpacing.lg,
  },
  alertIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(210, 56, 45, 0.12)',
  },
  alertTextBlock: {
    flex: 1,
  },
  alertTitle: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  alertText: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  devicesSection: {
    gap: AppSpacing.md,
  },
  devicesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  addButtonText: {
    color: AppColors.primary,
    fontSize: 12,
    fontWeight: AppTypography.medium,
  },
  deviceList: {
    gap: 10,
  },
  deviceCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    padding: AppSpacing.lg,
  },
  deviceCardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  deviceIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  deviceIconOff: {
    backgroundColor: AppColors.mutedSurface,
  },
  deviceTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  deviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  deviceName: {
    flex: 1,
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  deviceMeta: {
    marginTop: 4,
    color: AppColors.mutedText,
    fontSize: 12,
    fontWeight: AppTypography.medium,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeMd: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: AppTypography.medium,
  },
  statusBadgeTextMd: {
    fontSize: 13,
  },
  emptyDevicesCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    padding: AppSpacing.lg,
  },
  emptyDevicesTitle: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  emptyDevicesText: {
    marginTop: 4,
    color: AppColors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  loadingState: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.md,
  },
  loadingText: {
    color: AppColors.mutedText,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.86,
  },
});
