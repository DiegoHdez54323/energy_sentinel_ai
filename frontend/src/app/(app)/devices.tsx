import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MobileShell } from '@/components/navigation/mobile-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppGradients, AppSpacing, AppTypography } from '@/constants/design';
import { useAuth } from '@/features/auth/auth-provider';
import {
  getDevicesScreenErrorMessage,
  isDevicesHomeNotFound,
} from '@/features/devices/devices.errors';
import { getDashboardStatusLabel } from '@/features/dashboard/dashboard.format';
import type {
  DeviceDetailStatus,
  DeviceListItem,
  DeviceListSummary,
} from '@/features/devices/devices.types';
import { useDevicesScreen } from '@/features/devices/use-devices-screen';
import { useActiveHome } from '@/features/homes/use-active-home';

const CARD_BACKGROUND = 'rgba(24, 29, 37, 0.82)';
const PRIMARY_GRADIENT = { experimental_backgroundImage: AppGradients.primary } as const;
const STATUS_COLORS = {
  anomaly: AppColors.anomaly,
  normal: AppColors.success,
  warning: '#D99A2B',
} as const satisfies Record<DeviceDetailStatus, string>;

export default function DevicesScreen() {
  const { status: authStatus } = useAuth();
  const { home: activeHome, isLoading: isActiveHomeLoading } = useActiveHome();
  const {
    error,
    filteredDevices,
    query,
    reload,
    setQuery,
    status,
    summary,
  } = useDevicesScreen(activeHome?.id);

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
      <MobileShell activeTab="devices">
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {renderContent({
              activeHomeName: activeHome?.name ?? 'Casa Principal',
              error,
              filteredDevices,
              isActiveHomeLoading,
              query,
              reload,
              setQuery,
              status,
              summary,
            })}
          </ScrollView>
        </SafeAreaView>
      </MobileShell>
    </ScreenBackground>
  );
}

function renderContent({
  activeHomeName,
  error,
  filteredDevices,
  isActiveHomeLoading,
  query,
  reload,
  setQuery,
  status,
  summary,
}: {
  activeHomeName: string;
  error: unknown;
  filteredDevices: DeviceListItem[];
  isActiveHomeLoading: boolean;
  query: string;
  reload: () => void;
  setQuery: (value: string) => void;
  status: string;
  summary: DeviceListSummary;
}) {
  if (isActiveHomeLoading) {
    return <LoadingState label="Cargando dispositivos..." />;
  }

  if (!summary.totalCount && status === 'idle') {
    return (
      <EmptyState
        action={{ label: 'Seleccionar hogar', onPress: () => router.replace('/home') }}
        description="Elige una casa para ver sus dispositivos conectados."
        icon="home"
        title="Selecciona un hogar"
      />
    );
  }

  if (status === 'loading' && summary.totalCount === 0) {
    return <LoadingState label="Cargando dispositivos..." />;
  }

  if (status === 'error' && summary.totalCount === 0) {
    return (
      <EmptyState
        action={{
          label: isDevicesHomeNotFound(error) ? 'Cambiar hogar' : 'Intentar de nuevo',
          onPress: isDevicesHomeNotFound(error) ? () => router.replace('/home') : reload,
        }}
        description={getDevicesScreenErrorMessage(error)}
        icon="alert-circle"
        title="No pudimos cargar los dispositivos"
      />
    );
  }

  return (
    <DevicesContent
      activeHomeName={activeHomeName}
      devices={filteredDevices}
      hasDevices={summary.totalCount > 0}
      query={query}
      setQuery={setQuery}
      summary={summary}
    />
  );
}

function DevicesContent({
  activeHomeName,
  devices,
  hasDevices,
  query,
  setQuery,
  summary,
}: {
  activeHomeName: string;
  devices: DeviceListItem[];
  hasDevices: boolean;
  query: string;
  setQuery: (value: string) => void;
  summary: DeviceListSummary;
}) {
  return (
    <>
      <Animated.View entering={FadeInUp.duration(420)} style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>{activeHomeName}</Text>
          <Text style={styles.title}>Dispositivos</Text>
        </View>

        <Pressable
          accessibilityLabel="Importar dispositivos"
          accessibilityRole="button"
          onPress={() => router.push('/shelly-discovery')}
          style={({ pressed }) => [styles.plusButton, PRIMARY_GRADIENT, pressed && styles.pressed]}>
          <Feather color={AppColors.text} name="plus" size={20} />
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(60).duration(420)} style={styles.searchShell}>
        <Feather color={AppColors.mutedText} name="search" size={16} style={styles.searchIcon} />
        <TextInput
          accessibilityLabel="Buscar dispositivo"
          onChangeText={setQuery}
          placeholder="Buscar dispositivo..."
          placeholderTextColor={AppColors.placeholder}
          style={styles.searchInput}
          value={query}
        />
        <Pressable
          accessibilityLabel="Filtros proximamente"
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.filterButton}>
          <Feather color={AppColors.mutedText} name="sliders" size={16} />
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(110).duration(420)} style={styles.summaryRow}>
        <SummaryCard label="Total" tone="default" value={summary.totalCount} />
        <SummaryCard label="Activos" tone="success" value={summary.activeCount} />
        <SummaryCard label="Alertas" tone="anomaly" value={summary.alertCount} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(440)} style={styles.listSection}>
        {devices.length > 0 ? (
          <View style={styles.list}>
            {devices.map((device, index) => (
              <Animated.View
                entering={FadeInDown.delay(190 + index * 40).duration(380)}
                key={device.id}>
                <DeviceRowCard device={device} />
              </Animated.View>
            ))}
          </View>
        ) : hasDevices ? (
          <ListEmptyCard
            description="Prueba con otro nombre o limpia la busqueda para ver todos tus dispositivos."
            icon="search"
            title="Sin resultados"
          />
        ) : (
          <ListEmptyCard
            actionLabel="Importar dispositivos"
            description="Importa tus dispositivos Shelly para empezar a monitorear el consumo desde esta pantalla."
            icon="cpu"
            onPress={() => router.push('/shelly-discovery')}
            title="Sin dispositivos"
          />
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

function SummaryCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'anomaly' | 'default' | 'success';
  value: number;
}) {
  const valueColor =
    tone === 'success'
      ? AppColors.success
      : tone === 'anomaly'
        ? AppColors.anomaly
        : AppColors.text;

  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, { color: valueColor }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function DeviceRowCard({ device }: { device: DeviceListItem }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/devices/${device.id}`)}
      style={({ pressed }) => [styles.deviceCard, pressed && styles.deviceCardPressed]}>
      <View style={[styles.deviceIcon, device.isOn ? PRIMARY_GRADIENT : styles.deviceIconOff]}>
        <Feather
          color={device.isOn ? AppColors.text : AppColors.mutedText}
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
          {device.isOn ? `${device.currentWatts}W` : 'Apagado'}
        </Text>
      </View>

      <Feather color={AppColors.mutedText} name="chevron-right" size={16} />
    </Pressable>
  );
}

function StatusBadge({ status }: { status: DeviceDetailStatus }) {
  const icon = status === 'normal' ? 'check-circle' : status === 'warning' ? 'alert-triangle' : 'alert-circle';
  const color = STATUS_COLORS[status];

  return (
    <View style={[styles.statusBadge, { backgroundColor: `${color}1A`, borderColor: `${color}40` }]}>
      <Feather color={color} name={icon} size={12} />
      <Text style={[styles.statusBadgeText, { color }]}>{getDashboardStatusLabel(status)}</Text>
    </View>
  );
}

function ListEmptyCard({
  actionLabel,
  description,
  icon,
  onPress,
  title,
}: {
  actionLabel?: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  title: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIconFrame}>
        <Feather color={AppColors.mutedText} name={icon} size={24} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>

      {actionLabel && onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.emptyActionButton, PRIMARY_GRADIENT, pressed && styles.pressed]}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
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
    gap: AppSpacing.lg,
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
  plusButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  searchShell: {
    position: 'relative',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    minHeight: 44,
    paddingLeft: 42,
    paddingRight: 44,
  },
  searchIcon: {
    position: 'absolute',
    left: 16,
    top: 14,
  },
  searchInput: {
    color: AppColors.text,
    fontSize: 14,
    paddingVertical: 12,
  },
  filterButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: AppSpacing.md,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: AppTypography.bold,
  },
  summaryLabel: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 10,
    fontWeight: AppTypography.medium,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  listSection: {
    flex: 1,
  },
  list: {
    gap: AppSpacing.md,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    padding: 16,
  },
  deviceCardPressed: {
    opacity: 0.94,
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
    flexShrink: 1,
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
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: AppTypography.medium,
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    paddingHorizontal: AppSpacing.xl,
    paddingVertical: 32,
  },
  emptyIconFrame: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: AppSpacing.lg,
    borderRadius: 16,
    backgroundColor: AppColors.mutedSurface,
  },
  emptyTitle: {
    color: AppColors.text,
    fontSize: 16,
    fontWeight: AppTypography.semiBold,
    textAlign: 'center',
  },
  emptyDescription: {
    marginTop: 6,
    color: AppColors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyActionButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: AppSpacing.xl,
    borderRadius: 12,
    paddingHorizontal: AppSpacing.xl,
  },
  emptyActionText: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: AppSpacing.md,
  },
  loadingText: {
    color: AppColors.mutedText,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.92,
  },
});
