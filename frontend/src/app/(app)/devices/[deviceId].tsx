import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart, type lineDataItem } from 'react-native-gifted-charts';

import { MobileShell } from '@/components/navigation/mobile-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppGradients, AppSpacing, AppTypography } from '@/constants/design';
import { useAuth } from '@/features/auth/auth-provider';
import { getDeviceDetailErrorMessage } from '@/features/devices/devices.errors';
import {
  formatEnergyKwh,
  formatIncidentRange,
  formatRelativeTime,
  formatTrendValue,
  formatWatts,
  getDeviceDetailStatus,
  getDevicePowerState,
  getIncidentTitle,
} from '@/features/devices/devices.format';
import type {
  DeviceAnomaly,
  DeviceChartPeriod,
  DeviceConsumptionPoint,
  DeviceDetailData,
  DeviceDetailStatus,
  DeviceSummaryPeriod,
} from '@/features/devices/devices.types';
import { useDeviceDetail } from '@/features/devices/use-device-detail';

const CARD_BACKGROUND = 'rgba(24, 29, 37, 0.82)';
const PRIMARY_GRADIENT = { experimental_backgroundImage: AppGradients.primary } as const;
const PERIODS: DeviceChartPeriod[] = ['24h', '7d', '30d'];
const STATUS_COLORS = {
  anomaly: AppColors.anomaly,
  normal: AppColors.success,
  warning: '#D99A2B',
} as const satisfies Record<DeviceDetailStatus, string>;

type ChartPoint = lineDataItem & {
  energyWh: number;
  powerW: number;
  timestamp: string;
};

export default function DeviceDetailScreen() {
  const params = useLocalSearchParams<{ deviceId?: string }>();
  const deviceId = typeof params.deviceId === 'string' ? params.deviceId : null;
  const { status: authStatus } = useAuth();
  const { data, error, period, reload, setPeriod, status } = useDeviceDetail(deviceId);

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
              data,
              deviceId,
              error,
              period,
              reload,
              setPeriod,
              status,
            })}
          </ScrollView>
        </SafeAreaView>
      </MobileShell>
    </ScreenBackground>
  );
}

function renderContent({
  data,
  deviceId,
  error,
  period,
  reload,
  setPeriod,
  status,
}: {
  data: DeviceDetailData | null;
  deviceId: string | null;
  error: unknown;
  period: DeviceChartPeriod;
  reload: () => void;
  setPeriod: (period: DeviceChartPeriod) => void;
  status: string;
}) {
  if (!deviceId) {
    return (
      <EmptyState
        action={{ label: 'Volver al inicio', onPress: () => router.replace('/home-dashboard') }}
        description="Necesitamos un dispositivo valido para mostrar el detalle."
        icon="cpu"
        title="Dispositivo no seleccionado"
      />
    );
  }

  if (status === 'loading' && !data) {
    return <LoadingState />;
  }

  if (status === 'error' && !data) {
    return (
      <EmptyState
        action={{ label: 'Intentar de nuevo', onPress: reload }}
        description={getDeviceDetailErrorMessage(error)}
        icon="alert-circle"
        title="No pudimos cargar el dispositivo"
      />
    );
  }

  if (!data) {
    return <LoadingState />;
  }

  return <DeviceDetailContent data={data} period={period} setPeriod={setPeriod} />;
}

function DeviceDetailContent({
  data,
  period,
  setPeriod,
}: {
  data: DeviceDetailData;
  period: DeviceChartPeriod;
  setPeriod: (period: DeviceChartPeriod) => void;
}) {
  const { state } = data;
  const latestReading = state.latestReading;
  const deviceStatus = getDeviceDetailStatus({
    activeAnomaly: state.activeAnomaly,
    deviceStatus: state.device.status,
    latestReading,
    model: state.model,
  });
  const powerState = getDevicePowerState(latestReading);

  return (
    <>
      <Animated.View entering={FadeInDown.duration(380)} style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Feather color={AppColors.text} name="arrow-left" size={18} />
        </Pressable>
        <View style={styles.headerTextBlock}>
          <Text numberOfLines={1} style={styles.title}>
            {state.device.displayName}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {state.device.deviceCode ?? state.device.vendor}
          </Text>
        </View>
        <StatusBadge status={deviceStatus} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(60).duration(400)} style={styles.liveCard}>
        <View style={styles.liveTopRow}>
          <View style={styles.powerStateRow}>
            <View style={[styles.powerDot, powerState.isOn && styles.powerDotOn]} />
            <Text style={styles.liveMeta}>{powerState.label}</Text>
          </View>
          <View style={styles.updatedRow}>
            <Feather color={AppColors.mutedText} name="clock" size={12} />
            <Text style={styles.liveMeta}>{formatRelativeTime(latestReading?.ts)}</Text>
          </View>
        </View>

        <View style={styles.liveValueRow}>
          <Text style={styles.liveValue}>{formatWatts(latestReading?.apower)}</Text>
          <Text style={styles.liveUnit}>W</Text>
        </View>
        <Text style={styles.liveLabel}>Consumo actual</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(420)} style={styles.chartSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Consumo hoy</Text>
          <View style={styles.periodRow}>
            {PERIODS.map((candidate) => (
              <Pressable
                accessibilityRole="button"
                key={candidate}
                onPress={() => setPeriod(candidate)}
                style={({ pressed }) => [
                  styles.periodButton,
                  period === candidate && [styles.periodButtonActive, PRIMARY_GRADIENT],
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[
                    styles.periodText,
                    period === candidate && styles.periodTextActive,
                  ]}>
                  {candidate}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.chartCard}>
          <ConsumptionChart series={data.chart.series} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(180).duration(440)} style={styles.summaryGrid}>
        <ConsumptionSummary label="Hoy" period={data.summary.today} />
        <ConsumptionSummary label="Esta semana" period={data.summary.week} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(240).duration(460)} style={styles.incidentsSection}>
        <View style={styles.incidentsHeader}>
          <View style={styles.incidentsTitleRow}>
            <Feather color={AppColors.anomaly} name="activity" size={16} />
            <Text style={styles.sectionTitle}>Incidentes</Text>
          </View>
          <Text style={styles.incidentsCount}>{data.anomalies.length} total</Text>
        </View>

        {data.anomalies.length > 0 ? (
          <View style={styles.incidentList}>
            {data.anomalies.map((incident, index) => (
              <Animated.View
                entering={FadeInDown.delay(280 + index * 45).duration(420)}
                key={incident.id}>
                <IncidentItem incident={incident} />
              </Animated.View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyIncidentsCard}>
            <Text style={styles.emptyIncidentsTitle}>Sin incidentes</Text>
            <Text style={styles.emptyIncidentsText}>
              No hay anomalías registradas para este dispositivo.
            </Text>
          </View>
        )}
      </Animated.View>
    </>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={AppColors.primary} />
      <Text style={styles.loadingText}>Cargando dispositivo...</Text>
    </View>
  );
}

function ConsumptionChart({ series }: { series: DeviceConsumptionPoint[] }) {
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(screenWidth - 72, 360);
  const chartData = buildChartData(series);
  const maxValue = getRoundedMaxValue(chartData);
  const spacing = getChartSpacing(width, chartData.length);

  if (series.length === 0) {
    return (
      <View style={styles.emptyChart}>
        <Feather color={AppColors.mutedText} name="bar-chart-2" size={24} />
        <Text style={styles.emptyChartText}>Sin datos de consumo para este periodo</Text>
      </View>
    );
  }

  return (
    <View style={styles.chartWrapper}>
      <View style={styles.axisCaptionRow}>
        <Text style={styles.axisCaption}>Power (W)</Text>
        <Text style={styles.axisCaption}>Hora</Text>
      </View>
      <LineChart
        adjustToWidth
        allowFontScaling={false}
        areaChart
        backgroundColor="transparent"
        color={AppColors.primary}
        curved
        data={chartData}
        dataPointsColor={AppColors.primary}
        dataPointsRadius={2.5}
        disableScroll={chartData.length <= 8}
        endFillColor={AppColors.primary}
        endOpacity={0.03}
        height={144}
        initialSpacing={8}
        maxValue={maxValue}
        noOfSections={4}
        pointerConfig={{
          activatePointersInstantlyOnTouch: true,
          autoAdjustPointerLabelPosition: true,
          pointerColor: AppColors.primary,
          pointerLabelComponent: renderPointerLabel,
          pointerLabelHeight: 68,
          pointerLabelWidth: 128,
          pointerStripColor: 'rgba(129, 136, 152, 0.36)',
          pointerStripWidth: 1,
          radius: 5,
          showPointerStrip: true,
        }}
        rulesColor="rgba(129, 136, 152, 0.16)"
        rulesThickness={1}
        spacing={spacing}
        startFillColor={AppColors.primary}
        startOpacity={0.3}
        thickness={2.5}
        width={width - 52}
        xAxisColor="rgba(129, 136, 152, 0.24)"
        xAxisLabelTextStyle={styles.chartAxisText}
        xAxisLabelsHeight={24}
        xAxisThickness={1}
        yAxisColor="rgba(129, 136, 152, 0.24)"
        yAxisLabelSuffix=" W"
        yAxisLabelWidth={48}
        yAxisTextStyle={styles.chartAxisText}
        yAxisThickness={1}
      />
    </View>
  );
}

function buildChartData(series: DeviceConsumptionPoint[]): ChartPoint[] {
  const visibleLabelIndexes = getVisibleLabelIndexes(series.length);

  return series.map((point, index) => {
    const powerW = Math.round(point.avgPowerW ?? point.maxPowerW ?? 0);

    return {
      energyWh: point.energyWh,
      label: visibleLabelIndexes.has(index) ? formatChartTick(point.ts) : '',
      powerW,
      timestamp: point.ts,
      value: powerW,
    };
  });
}

function getVisibleLabelIndexes(length: number) {
  if (length <= 1) {
    return new Set([0]);
  }

  const indexes = new Set<number>();
  const slots = Math.min(4, length);

  for (let index = 0; index < slots; index += 1) {
    indexes.add(Math.round((index / (slots - 1)) * (length - 1)));
  }

  return indexes;
}

function getRoundedMaxValue(data: ChartPoint[]) {
  const maxPower = Math.max(1, ...data.map((point) => point.powerW));
  const magnitude = maxPower >= 1000 ? 500 : maxPower >= 200 ? 100 : 50;

  return Math.ceil(maxPower / magnitude) * magnitude;
}

function getChartSpacing(width: number, length: number) {
  if (length <= 1) {
    return width / 2;
  }

  return Math.max(28, Math.min(54, (width - 52) / Math.max(length - 1, 1)));
}

function renderPointerLabel(items: ChartPoint | ChartPoint[]) {
  const point = Array.isArray(items) ? items[0] : items;

  if (!point) {
    return null;
  }

  return (
    <View style={styles.pointerTooltip}>
      <Text style={styles.pointerTime}>{formatPointerTime(point.timestamp)}</Text>
      <Text style={styles.pointerPower}>{point.powerW} W</Text>
      <Text style={styles.pointerEnergy}>{point.energyWh.toFixed(1)} Wh</Text>
    </View>
  );
}

function ConsumptionSummary({
  label,
  period,
}: {
  label: string;
  period: DeviceSummaryPeriod;
}) {
  const trendLabel = formatTrendValue(period);
  const trendIcon = period.trend === 'up' ? 'trending-up' : period.trend === 'down' ? 'trending-down' : 'minus';
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
        <Text style={styles.summaryValue}>{formatEnergyKwh(period.energyWh)}</Text>
        <Text style={styles.summaryUnit}>kWh</Text>
      </View>
      {trendLabel ? (
        <View style={styles.trendRow}>
          <Feather color={trendColor} name={trendIcon} size={12} />
          <Text style={[styles.trendText, { color: trendColor }]}>
            {trendLabel} vs. semana pasada
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function IncidentItem({ incident }: { incident: DeviceAnomaly }) {
  const isOpen = incident.status === 'open';

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.incidentItem,
        isOpen && styles.incidentItemOpen,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.incidentIcon, isOpen && styles.incidentIconOpen]}>
        <Feather
          color={isOpen ? AppColors.anomaly : AppColors.mutedText}
          name="alert-circle"
          size={16}
        />
      </View>
      <View style={styles.incidentTextBlock}>
        <View style={styles.incidentTitleRow}>
          <Text style={[styles.incidentTitle, isOpen && styles.incidentTitleOpen]}>
            {getIncidentTitle(incident)}
          </Text>
          {isOpen ? (
            <View style={styles.activePill}>
              <Text style={styles.activePillText}>Activo</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.incidentMetaRow}>
          <View style={styles.incidentMetaItem}>
            <Feather color={AppColors.mutedText} name="clock" size={12} />
            <Text style={styles.incidentMetaText}>{formatIncidentRange(incident)}</Text>
          </View>
          <Text style={styles.incidentMetaText}>{incident.readingsCount} lecturas anómalas</Text>
        </View>
      </View>
      <Feather color={AppColors.mutedText} name="chevron-right" size={16} />
    </Pressable>
  );
}

function StatusBadge({ status }: { status: DeviceDetailStatus }) {
  const label = status === 'anomaly' ? 'Anomalía' : status === 'warning' ? 'Atención' : 'Normal';
  const icon = status === 'normal' ? 'check-circle' : status === 'warning' ? 'alert-triangle' : 'alert-circle';
  const color = STATUS_COLORS[status];

  return (
    <View style={[styles.statusBadge, { backgroundColor: `${color}1A`, borderColor: `${color}40` }]}>
      <Feather color={color} name={icon} size={14} />
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function formatChartTick(value: string | undefined) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatPointerTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
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
    gap: AppSpacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.surface,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: AppColors.text,
    fontSize: 18,
    fontWeight: AppTypography.bold,
    letterSpacing: AppTypography.tightLetterSpacing,
  },
  subtitle: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: AppTypography.medium,
  },
  liveCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    padding: 20,
  },
  liveTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
    marginBottom: AppSpacing.lg,
  },
  powerStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  powerDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: AppColors.mutedText,
  },
  powerDotOn: {
    backgroundColor: AppColors.success,
  },
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveMeta: {
    color: AppColors.mutedText,
    fontSize: 12,
    fontWeight: AppTypography.medium,
  },
  liveValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: AppSpacing.sm,
  },
  liveValue: {
    color: AppColors.text,
    fontSize: 40,
    fontWeight: AppTypography.bold,
    letterSpacing: -1,
  },
  liveUnit: {
    color: AppColors.mutedText,
    fontSize: 18,
  },
  liveLabel: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 12,
  },
  chartSection: {
    gap: AppSpacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  sectionTitle: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 4,
  },
  periodButton: {
    minWidth: 42,
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: AppSpacing.sm,
    paddingVertical: 5,
  },
  periodButtonActive: {
    shadowColor: AppColors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  periodText: {
    color: AppColors.mutedText,
    fontSize: 12,
    fontWeight: AppTypography.medium,
  },
  periodTextActive: {
    color: AppColors.text,
  },
  chartCard: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    padding: AppSpacing.lg,
  },
  chartWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  axisCaptionRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 48,
    paddingRight: 6,
    marginBottom: 4,
  },
  axisCaption: {
    color: AppColors.mutedText,
    fontSize: 11,
    fontWeight: AppTypography.medium,
  },
  chartAxisText: {
    color: AppColors.mutedText,
    fontSize: 10,
  },
  pointerTooltip: {
    minWidth: 118,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: AppColors.surface,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
  },
  pointerTime: {
    color: AppColors.mutedText,
    fontSize: 11,
  },
  pointerPower: {
    marginTop: 2,
    color: AppColors.text,
    fontSize: 16,
    fontWeight: AppTypography.bold,
  },
  pointerEnergy: {
    marginTop: 1,
    color: AppColors.primaryBright,
    fontSize: 11,
    fontWeight: AppTypography.medium,
  },
  emptyChart: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.sm,
  },
  emptyChartText: {
    color: AppColors.mutedText,
    fontSize: 12,
    textAlign: 'center',
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
  incidentsSection: {
    gap: AppSpacing.md,
  },
  incidentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  incidentsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  incidentsCount: {
    color: AppColors.mutedText,
    fontSize: 12,
  },
  incidentList: {
    gap: 10,
  },
  incidentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    padding: AppSpacing.lg,
  },
  incidentItemOpen: {
    borderColor: 'rgba(210, 56, 45, 0.22)',
    backgroundColor: 'rgba(210, 56, 45, 0.06)',
  },
  incidentIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    borderRadius: 10,
    backgroundColor: AppColors.mutedSurface,
  },
  incidentIconOpen: {
    backgroundColor: 'rgba(210, 56, 45, 0.12)',
  },
  incidentTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  incidentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  incidentTitle: {
    flex: 1,
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  incidentTitleOpen: {
    color: AppColors.anomaly,
  },
  activePill: {
    borderRadius: 999,
    backgroundColor: 'rgba(210, 56, 45, 0.12)',
    paddingHorizontal: AppSpacing.sm,
    paddingVertical: 2,
  },
  activePillText: {
    color: AppColors.anomaly,
    fontSize: 10,
    fontWeight: AppTypography.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  incidentMetaRow: {
    gap: AppSpacing.sm,
    marginTop: 6,
  },
  incidentMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  incidentMetaText: {
    color: AppColors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
  emptyIncidentsCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    padding: AppSpacing.lg,
  },
  emptyIncidentsTitle: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  emptyIncidentsText: {
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
