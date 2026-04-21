import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
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
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart, type lineDataItem } from 'react-native-gifted-charts';

import { MobileShell } from '@/components/navigation/mobile-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppGradients, AppSpacing, AppTypography } from '@/constants/design';
import { useAuth } from '@/features/auth/auth-provider';
import {
  getConsumptionErrorMessage,
  isConsumptionHomeNotFound,
} from '@/features/consumption/consumption.errors';
import {
  formatAverageLabel,
  formatChartTitle,
  formatConsumptionEnergyKwh,
  formatConsumptionPercentage,
  formatConsumptionPointerTime,
  formatConsumptionTickLabel,
  formatConsumptionTrend,
  formatTotalLabel,
  getConsumptionPeriodOptions,
} from '@/features/consumption/consumption.format';
import type {
  ConsumptionBreakdownItem,
  ConsumptionPeriodKey,
  HomeConsumptionSummaryResponse,
} from '@/features/consumption/consumption.types';
import { useConsumptionScreen } from '@/features/consumption/use-consumption-screen';
import type { ConsumptionSeriesPoint } from '@/features/homes/homes.types';
import { useActiveHome } from '@/features/homes/use-active-home';

const CARD_BACKGROUND = 'rgba(24, 29, 37, 0.82)';
const PRIMARY_GRADIENT = { experimental_backgroundImage: AppGradients.primary } as const;
const PERIODS = getConsumptionPeriodOptions();
const TREND_UP_COLOR = '#D99A2B';

type ChartPoint = lineDataItem & {
  energyWh: number;
  powerW: number;
  timestamp: string;
};

export default function ConsumptionScreen() {
  const { status: authStatus } = useAuth();
  const { home: activeHome, isLoading: isActiveHomeLoading } = useActiveHome();
  const { data, error, period, reload, setPeriod, status } = useConsumptionScreen(activeHome?.id);

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
      <MobileShell activeTab="consumption">
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {renderContent({
              hasActiveHome: Boolean(activeHome),
              activeHomeName: activeHome?.name ?? 'Casa Principal',
              data,
              error,
              isActiveHomeLoading,
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
  activeHomeName,
  data,
  error,
  hasActiveHome,
  isActiveHomeLoading,
  period,
  reload,
  setPeriod,
  status,
}: {
  activeHomeName: string;
  data: HomeConsumptionSummaryResponse | null;
  error: unknown;
  hasActiveHome: boolean;
  isActiveHomeLoading: boolean;
  period: ConsumptionPeriodKey;
  reload: () => void;
  setPeriod: (period: ConsumptionPeriodKey) => void;
  status: string;
}) {
  if (isActiveHomeLoading) {
    return <LoadingState label="Cargando consumo..." />;
  }

  if (!hasActiveHome) {
    return (
      <EmptyState
        action={{ label: 'Seleccionar hogar', onPress: () => router.replace('/home') }}
        description="Elige una casa para ver su consumo historico."
        icon="home"
        title="Selecciona un hogar"
      />
    );
  }

  if (status === 'loading' && !data) {
    return <LoadingState label="Cargando consumo..." />;
  }

  if (status === 'error' && !data) {
    return (
      <EmptyState
        action={{
          label: isConsumptionHomeNotFound(error) ? 'Cambiar hogar' : 'Intentar de nuevo',
          onPress: isConsumptionHomeNotFound(error) ? () => router.replace('/home') : reload,
        }}
        description={getConsumptionErrorMessage(error)}
        icon="alert-circle"
        title="No pudimos cargar el consumo"
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        action={{ label: 'Seleccionar hogar', onPress: () => router.replace('/home') }}
        description="Elige una casa para ver su consumo historico."
        icon="home"
        title="Selecciona un hogar"
      />
    );
  }

  return (
    <ConsumptionContent
      data={data}
      fallbackHomeName={activeHomeName}
      period={period}
      setPeriod={setPeriod}
    />
  );
}

function ConsumptionContent({
  data,
  fallbackHomeName,
  period,
  setPeriod,
}: {
  data: HomeConsumptionSummaryResponse;
  fallbackHomeName: string;
  period: ConsumptionPeriodKey;
  setPeriod: (period: ConsumptionPeriodKey) => void;
}) {
  const homeName = data.home.name || fallbackHomeName;

  return (
    <>
      <Animated.View entering={FadeInUp.duration(420)}>
        <Text style={styles.eyebrow}>{homeName}</Text>
        <Text style={styles.title}>Consumo</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(60).duration(420)} style={styles.periodSelector}>
        {PERIODS.map((candidate) => (
          <Pressable
            accessibilityRole="button"
            key={candidate.key}
            onPress={() => setPeriod(candidate.key)}
            style={({ pressed }) => [
              styles.periodButton,
              period === candidate.key && [styles.periodButtonActive, PRIMARY_GRADIENT],
              pressed && styles.pressed,
            ]}>
            <Text
              style={[
                styles.periodButtonText,
                period === candidate.key && styles.periodButtonTextActive,
              ]}>
              {candidate.tabLabel}
            </Text>
          </Pressable>
        ))}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(110).duration(420)} style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Feather color={AppColors.primary} name="bar-chart-2" size={16} />
          <Text style={styles.chartTitle}>{formatChartTitle(data.period)}</Text>
        </View>
        <HomeConsumptionChart period={period} series={data.chart.series} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(440)} style={styles.summaryGrid}>
        <SummaryCard
          energyWh={data.summary.totalEnergyWh}
          label={formatTotalLabel(data.period)}
          trend={data.summary.trend}
          trendPercent={data.summary.trendPercent}
        />
        <AverageCard
          energyWh={data.summary.averageEnergyWh}
          label={formatAverageLabel(data.summary.averageUnit)}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(220).duration(460)} style={styles.breakdownSection}>
        <Text style={styles.sectionTitle}>Por dispositivo</Text>

        {data.breakdown.items.length > 0 ? (
          <View style={styles.breakdownList}>
            {data.breakdown.items.map((item, index) => (
              <Animated.View
                entering={FadeInDown.delay(260 + index * 30).duration(380)}
                key={item.deviceId}>
                <BreakdownCard item={item} />
              </Animated.View>
            ))}
          </View>
        ) : data.breakdown.deviceCount > 0 ? (
          <InlineEmptyCard
            description="Aun no hay suficiente historial para calcular el consumo por dispositivo en este periodo."
            icon="bar-chart"
            title="Sin datos por dispositivo"
          />
        ) : (
          <InlineEmptyCard
            action={{ label: 'Importar dispositivos', onPress: () => router.push('/shelly-discovery') }}
            description="Importa tus dispositivos Shelly para ver el desglose de consumo aqui."
            icon="cpu"
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

function HomeConsumptionChart({
  period,
  series,
}: {
  period: ConsumptionPeriodKey;
  series: ConsumptionSeriesPoint[];
}) {
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(screenWidth - 72, 360);
  const chartData = buildChartData(period, series);
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
        <Text style={styles.axisCaption}>{period === 'today' ? 'Hora' : 'Tiempo'}</Text>
      </View>
      <LineChart
        adjustToWidth
        allowFontScaling={false}
        areaChart
        backgroundColor="transparent"
        color={AppColors.success}
        curved
        data={chartData}
        dataPointsColor={AppColors.success}
        dataPointsRadius={2.5}
        disableScroll={chartData.length <= 8}
        endFillColor={AppColors.success}
        endOpacity={0.03}
        height={176}
        initialSpacing={8}
        maxValue={maxValue}
        noOfSections={4}
        pointerConfig={{
          activatePointersInstantlyOnTouch: true,
          autoAdjustPointerLabelPosition: true,
          pointerColor: AppColors.success,
          pointerLabelComponent: (items: ChartPoint | ChartPoint[]) =>
            renderPointerLabel(items, period),
          pointerLabelHeight: 68,
          pointerLabelWidth: 132,
          pointerStripColor: 'rgba(129, 136, 152, 0.36)',
          pointerStripWidth: 1,
          radius: 5,
          showPointerStrip: true,
        }}
        rulesColor="rgba(129, 136, 152, 0.16)"
        rulesThickness={1}
        spacing={spacing}
        startFillColor={AppColors.success}
        startOpacity={0.22}
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

function buildChartData(period: ConsumptionPeriodKey, series: ConsumptionSeriesPoint[]): ChartPoint[] {
  const visibleLabelIndexes = getVisibleLabelIndexes(series.length);

  return series.map((point, index) => {
    const powerW = Math.round(point.avgPowerW ?? point.maxPowerW ?? 0);

    return {
      energyWh: point.energyWh,
      label: visibleLabelIndexes.has(index)
        ? formatConsumptionTickLabel({ period, timestamp: point.ts })
        : '',
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

function renderPointerLabel(items: ChartPoint | ChartPoint[], period: ConsumptionPeriodKey) {
  const point = Array.isArray(items) ? items[0] : items;

  if (!point) {
    return null;
  }

  return (
    <View style={styles.pointerTooltip}>
      <Text style={styles.pointerTime}>
        {formatConsumptionPointerTime({ period, timestamp: point.timestamp })}
      </Text>
      <Text style={styles.pointerPower}>{point.powerW} W</Text>
      <Text style={styles.pointerEnergy}>{point.energyWh.toFixed(1)} Wh</Text>
    </View>
  );
}

function SummaryCard({
  energyWh,
  label,
  trend,
  trendPercent,
}: {
  energyWh: number;
  label: string;
  trend: HomeConsumptionSummaryResponse['summary']['trend'];
  trendPercent: number | null;
}) {
  const trendLabel = formatConsumptionTrend({ trend, trendPercent });
  const trendIcon = trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'minus';
  const trendColor =
    trend === 'down'
      ? AppColors.success
      : trend === 'up'
        ? TREND_UP_COLOR
        : AppColors.mutedText;

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <View style={styles.summaryValueRow}>
        <Text style={styles.summaryValue}>{formatConsumptionEnergyKwh(energyWh)}</Text>
        <Text style={styles.summaryUnit}>kWh</Text>
      </View>
      {trendLabel ? (
        <View style={styles.trendRow}>
          <Feather color={trendColor} name={trendIcon} size={12} />
          <Text style={[styles.trendText, { color: trendColor }]}>
            {trendLabel} vs. periodo anterior
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function AverageCard({
  energyWh,
  label,
}: {
  energyWh: number;
  label: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <View style={styles.summaryValueRow}>
        <Text style={styles.summaryValue}>{formatConsumptionEnergyKwh(energyWh)}</Text>
        <Text style={styles.summaryUnit}>kWh</Text>
      </View>
    </View>
  );
}

function BreakdownCard({ item }: { item: ConsumptionBreakdownItem }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/devices/${item.deviceId}`)}
      style={({ pressed }) => [styles.breakdownCard, pressed && styles.pressed]}>
      <View style={styles.breakdownTopRow}>
        <Text numberOfLines={1} style={styles.breakdownName}>
          {item.name}
        </Text>
        <Text style={styles.breakdownValue}>{formatConsumptionEnergyKwh(item.energyWh)} kWh</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(item.percentage, item.energyWh > 0 ? 4 : 0)}%` }, PRIMARY_GRADIENT]} />
      </View>
      <Text style={styles.breakdownMeta}>{formatConsumptionPercentage(item.percentage)}</Text>
    </Pressable>
  );
}

function InlineEmptyCard({
  action,
  description,
  icon,
  title,
}: {
  action?: {
    label: string;
    onPress: () => void;
  };
  description: string;
  icon: keyof typeof Feather.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.inlineEmptyCard}>
      <View style={styles.inlineEmptyIcon}>
        <Feather color={AppColors.mutedText} name={icon} size={22} />
      </View>
      <Text style={styles.inlineEmptyTitle}>{title}</Text>
      <Text style={styles.inlineEmptyText}>{description}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [styles.inlineEmptyButton, PRIMARY_GRADIENT, pressed && styles.pressed]}>
          <Text style={styles.inlineEmptyButtonText}>{action.label}</Text>
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
  periodSelector: {
    flexDirection: 'row',
    gap: 4,
    borderRadius: 12,
    backgroundColor: AppColors.mutedSurface,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 10,
  },
  periodButtonActive: {
    backgroundColor: CARD_BACKGROUND,
  },
  periodButtonText: {
    color: AppColors.mutedText,
    fontSize: 12,
    fontWeight: AppTypography.semiBold,
  },
  periodButtonTextActive: {
    color: AppColors.text,
  },
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    padding: 16,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    marginBottom: 12,
  },
  chartTitle: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  chartWrapper: {
    minHeight: 220,
  },
  axisCaptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  axisCaption: {
    color: AppColors.mutedText,
    fontSize: 11,
    fontWeight: AppTypography.medium,
  },
  chartAxisText: {
    color: AppColors.mutedText,
    fontSize: 11,
  },
  emptyChart: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.sm,
  },
  emptyChartText: {
    color: AppColors.mutedText,
    fontSize: 13,
    textAlign: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: AppSpacing.md,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    padding: 16,
  },
  summaryLabel: {
    color: AppColors.mutedText,
    fontSize: 11,
    fontWeight: AppTypography.medium,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  summaryValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 8,
  },
  summaryValue: {
    color: AppColors.text,
    fontSize: 28,
    fontWeight: AppTypography.bold,
  },
  summaryUnit: {
    color: AppColors.mutedText,
    fontSize: 14,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  trendText: {
    flex: 1,
    fontSize: 11,
    fontWeight: AppTypography.medium,
  },
  breakdownSection: {
    gap: AppSpacing.md,
  },
  sectionTitle: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  breakdownList: {
    gap: AppSpacing.md,
  },
  breakdownCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    padding: 16,
  },
  breakdownTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
    marginBottom: 10,
  },
  breakdownName: {
    flex: 1,
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.medium,
  },
  breakdownValue: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: AppColors.mutedSurface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  breakdownMeta: {
    marginTop: 8,
    color: AppColors.mutedText,
    fontSize: 12,
  },
  inlineEmptyCard: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: CARD_BACKGROUND,
    paddingHorizontal: AppSpacing.xl,
    paddingVertical: 28,
  },
  inlineEmptyIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: AppSpacing.lg,
    borderRadius: 16,
    backgroundColor: AppColors.mutedSurface,
  },
  inlineEmptyTitle: {
    color: AppColors.text,
    fontSize: 16,
    fontWeight: AppTypography.semiBold,
    textAlign: 'center',
  },
  inlineEmptyText: {
    marginTop: 6,
    color: AppColors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  inlineEmptyButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: AppSpacing.xl,
    borderRadius: 12,
    paddingHorizontal: AppSpacing.xl,
  },
  inlineEmptyButtonText: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  pointerTooltip: {
    minWidth: 124,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: 'rgba(24, 29, 37, 0.96)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pointerTime: {
    color: AppColors.mutedText,
    fontSize: 11,
  },
  pointerPower: {
    marginTop: 4,
    color: AppColors.text,
    fontSize: 16,
    fontWeight: AppTypography.bold,
  },
  pointerEnergy: {
    marginTop: 2,
    color: AppColors.secondaryText,
    fontSize: 12,
    fontWeight: AppTypography.medium,
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
