import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/empty-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppGradients, AppSpacing, AppTypography } from '@/constants/design';
import { useAuth } from '@/features/auth/auth-provider';
import { clearActiveHomeSelection } from '@/features/homes/active-home.storage';
import { useActiveHome } from '@/features/homes/use-active-home';
import { discoverShellyDevices, importShellyDevices } from '@/features/shelly/shelly.api';
import { getShellyErrorMessage } from '@/features/shelly/shelly.errors';
import {
  getShellyDeviceDisplayName,
  getShellyDeviceMetaLabel,
  toShellyImportDevicePayload,
} from '@/features/shelly/shelly.format';
import type {
  ShellyDiscoveredDevice,
  ShellyDiscovery,
  ShellyImportResult,
  ShellyKnownDevice,
} from '@/features/shelly/shelly.types';
import { isApiError } from '@/lib/api/api-client';

type DiscoveryPhase = 'done' | 'idle' | 'importing' | 'results' | 'scanning';

const PRIMARY_TINT = 'rgba(38, 128, 217, 0.1)';
const PRIMARY_BORDER = 'rgba(38, 128, 217, 0.2)';
const MUTED_CARD = 'rgba(24, 29, 37, 0.8)';
const PRIMARY_GRADIENT = { experimental_backgroundImage: AppGradients.primary } as const;

export default function ShellyDiscoveryScreen() {
  const { authenticatedRequest, status } = useAuth();
  const { home, isLoading: isHomeLoading } = useActiveHome();
  const [discovery, setDiscovery] = useState<ShellyDiscovery | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [importResult, setImportResult] = useState<ShellyImportResult | null>(null);
  const [phase, setPhase] = useState<DiscoveryPhase>('idle');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
    }
  }, [status]);

  const selectedDevices = useMemo(() => {
    if (!discovery) {
      return [];
    }

    return discovery.newDevices.filter((device) => selectedIds.has(device.externalDeviceId));
  }, [discovery, selectedIds]);

  if (status !== 'authenticated') {
    return <ScreenBackground />;
  }

  const startDiscovery = async () => {
    setError(null);
    setImportResult(null);
    setPhase('scanning');

    try {
      const response = await discoverShellyDevices(authenticatedRequest);
      setDiscovery(response.discovery);
      setSelectedIds(new Set(response.discovery.newDevices.map((device) => device.externalDeviceId)));
      setPhase('results');
    } catch (discoveryError) {
      setError(discoveryError);
      setPhase('idle');
    }
  };

  const toggleDevice = (externalDeviceId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(externalDeviceId)) {
        next.delete(externalDeviceId);
      } else {
        next.add(externalDeviceId);
      }

      return next;
    });
  };

  const selectAll = () => {
    if (!discovery) {
      return;
    }

    setSelectedIds(new Set(discovery.newDevices.map((device) => device.externalDeviceId)));
  };

  const importSelectedDevices = async () => {
    if (!home) {
      Alert.alert('Selecciona un hogar', 'Necesitas un hogar activo para importar dispositivos.');
      return;
    }

    if (selectedDevices.length === 0) {
      return;
    }

    setError(null);
    setPhase('importing');

    try {
      const response = await importShellyDevices(authenticatedRequest, home.id, {
        devices: selectedDevices.map(toShellyImportDevicePayload),
      });
      setImportResult(response.import);
      setPhase('done');
    } catch (importError) {
      if (isApiError(importError) && importError.code === 'HOME_NOT_FOUND') {
        await clearActiveHomeSelection();
      }

      setError(importError);
      setPhase('results');
      Alert.alert('No se pudo importar', getShellyErrorMessage(importError, 'import'));
    }
  };

  const renderBody = () => {
    if (!home && !isHomeLoading) {
      return (
        <EmptyState
          action={{ label: 'Seleccionar hogar', onPress: () => router.push('/home') }}
          description="Elige un hogar antes de importar dispositivos desde Shelly Cloud."
          icon="home"
          title="Selecciona un hogar"
        />
      );
    }

    if (phase === 'scanning') {
      return <ScanningState />;
    }

    if (phase === 'importing') {
      return <ImportingState selectedCount={selectedDevices.length} />;
    }

    if (phase === 'done' && importResult) {
      return <DoneState importResult={importResult} />;
    }

    if (phase === 'results' && discovery) {
      return (
        <ResultsState
          discovery={discovery}
          error={error}
          onImport={importSelectedDevices}
          onSelectAll={selectAll}
          onToggleDevice={toggleDevice}
          selectedCount={selectedDevices.length}
          selectedIds={selectedIds}
        />
      );
    }

    return (
      <View style={styles.idleWrap}>
        <EmptyState
          action={{ label: 'Iniciar descubrimiento', onPress: () => void startDiscovery() }}
          description="Escanearemos tu cuenta Shelly Cloud para encontrar dispositivos disponibles para importar."
          icon="search"
          title="Buscar dispositivos Shelly"
        />
        {error ? (
          <View style={styles.errorCard}>
            <Feather color={AppColors.anomaly} name="alert-circle" size={18} />
            <Text style={styles.errorText}>{getShellyErrorMessage(error, 'discover')}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(360)} style={styles.header}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/shelly-integration')}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Feather color={AppColors.text} name="arrow-left" size={16} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>Descubrir dispositivos</Text>
              <Text style={styles.headerSubtitle}>Importa dispositivos desde Shelly Cloud</Text>
            </View>
          </Animated.View>

          {renderBody()}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function ScanningState() {
  return (
    <Animated.View entering={FadeInUp.duration(320)} style={styles.centerState}>
      <View style={styles.loaderIcon}>
        <ActivityIndicator color={AppColors.primary} size="large" />
      </View>
      <Text style={styles.centerTitle}>Buscando dispositivos...</Text>
      <Text style={styles.centerSubtitle}>Conectando con Shelly Cloud</Text>
    </Animated.View>
  );
}

function ImportingState({ selectedCount }: { selectedCount: number }) {
  return (
    <Animated.View entering={FadeInUp.duration(320)} style={styles.centerState}>
      <ActivityIndicator color={AppColors.primary} size="large" />
      <Text style={styles.centerTitle}>Importando dispositivos...</Text>
      <Text style={styles.centerSubtitle}>{selectedCount} dispositivos seleccionados</Text>
    </Animated.View>
  );
}

function ResultsState({
  discovery,
  error,
  onImport,
  onSelectAll,
  onToggleDevice,
  selectedCount,
  selectedIds,
}: {
  discovery: ShellyDiscovery;
  error: unknown;
  onImport: () => void;
  onSelectAll: () => void;
  onToggleDevice: (externalDeviceId: string) => void;
  selectedCount: number;
  selectedIds: Set<string>;
}) {
  const hasNewDevices = discovery.newDevices.length > 0;

  if (!hasNewDevices && discovery.alreadyKnown.length === 0) {
    return (
      <EmptyState
        description="No encontramos dispositivos Shelly disponibles en esta cuenta."
        icon="cpu"
        title="Sin dispositivos"
      />
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(360)} style={styles.results}>
      <View style={styles.summaryRow}>
        <Text style={styles.resultCount}>
          {discovery.counts.totalShelly} dispositivos encontrados
        </Text>
        {hasNewDevices ? (
          <Pressable accessibilityRole="button" onPress={onSelectAll}>
            <Text style={styles.selectAllText}>Seleccionar todos</Text>
          </Pressable>
        ) : null}
      </View>

      {discovery.invalidEntries.length > 0 ? (
        <Text style={styles.invalidText}>
          {discovery.invalidEntries.length} entradas no se pudieron normalizar.
        </Text>
      ) : null}

      {hasNewDevices ? (
        <View style={styles.devicesList}>
          {discovery.newDevices.map((device) => (
            <DiscoveredDeviceCard
              device={device}
              key={device.externalDeviceId}
              onPress={() => onToggleDevice(device.externalDeviceId)}
              selected={selectedIds.has(device.externalDeviceId)}
            />
          ))}
        </View>
      ) : null}

      {discovery.alreadyKnown.length > 0 ? (
        <KnownDevicesList devices={discovery.alreadyKnown} />
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Feather color={AppColors.anomaly} name="alert-circle" size={18} />
          <Text style={styles.errorText}>{getShellyErrorMessage(error, 'import')}</Text>
        </View>
      ) : null}

      {hasNewDevices ? (
        <PrimaryButton
          accessibilityLabel="Importar dispositivos seleccionados"
          disabled={selectedCount === 0}
          label={`Importar ${selectedCount} dispositivo${selectedCount === 1 ? '' : 's'}`}
          onPress={onImport}
        />
      ) : (
        <Text style={styles.allKnownText}>Todos los dispositivos encontrados ya estan importados.</Text>
      )}
    </Animated.View>
  );
}

function DiscoveredDeviceCard({
  device,
  onPress,
  selected,
}: {
  device: ShellyDiscoveredDevice;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.deviceCard,
        selected ? styles.deviceCardSelected : styles.deviceCardIdle,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.deviceIcon, selected ? [styles.deviceIconSelected, PRIMARY_GRADIENT] : styles.deviceIconIdle]}>
        <Feather
          color={selected ? AppColors.text : AppColors.mutedText}
          name={selected ? 'check-circle' : 'cpu'}
          size={20}
        />
      </View>
      <View style={styles.deviceCopy}>
        <Text numberOfLines={1} style={styles.deviceName}>
          {getShellyDeviceDisplayName(device)}
        </Text>
        <Text numberOfLines={1} style={styles.deviceMeta}>
          {getShellyDeviceMetaLabel(device)}
        </Text>
      </View>
    </Pressable>
  );
}

function KnownDevicesList({ devices }: { devices: ShellyKnownDevice[] }) {
  return (
    <View style={styles.knownSection}>
      <Text style={styles.knownTitle}>Ya importados</Text>
      <View style={styles.knownList}>
        {devices.map((device) => (
          <View key={device.deviceId} style={styles.knownCard}>
            <Feather color={AppColors.success} name="check-circle" size={18} />
            <View style={styles.deviceCopy}>
              <Text numberOfLines={1} style={styles.knownName}>
                {device.displayName}
              </Text>
              <Text numberOfLines={1} style={styles.deviceMeta}>
                {device.status} · {device.externalDeviceId}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function DoneState({ importResult }: { importResult: ShellyImportResult }) {
  const createdCount = importResult.summary.created;

  return (
    <Animated.View entering={FadeInUp.duration(360)} style={styles.doneState}>
      <View style={styles.doneIcon}>
        <Feather color={AppColors.success} name="check-circle" size={40} />
      </View>
      <Text style={styles.doneTitle}>Importacion completa</Text>
      <Text style={styles.doneDescription}>
        {createdCount} dispositivos importados correctamente a tu hogar.
      </Text>

      <View style={styles.importSummary}>
        <SummaryPill label="Creados" value={importResult.summary.created} />
        <SummaryPill label="Omitidos" value={importResult.summary.skipped} />
        <SummaryPill label="Errores" value={importResult.summary.errors} />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/devices')}
        style={({ pressed }) => [styles.doneButton, PRIMARY_GRADIENT, pressed && styles.pressed]}>
        <Feather color={AppColors.text} name="zap" size={16} />
        <Text style={styles.doneButtonText}>Ver mis dispositivos</Text>
      </Pressable>
    </Animated.View>
  );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryPill}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
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
    paddingTop: 32,
    paddingBottom: 40,
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
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: AppColors.text,
    fontSize: 18,
    fontWeight: AppTypography.bold,
  },
  headerSubtitle: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 12,
  },
  idleWrap: {
    gap: AppSpacing.md,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loaderIcon: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: PRIMARY_TINT,
  },
  centerTitle: {
    marginTop: AppSpacing.xl,
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  centerSubtitle: {
    marginTop: 4,
    color: AppColors.mutedText,
    fontSize: 12,
  },
  results: {
    gap: AppSpacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  resultCount: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  selectAllText: {
    color: AppColors.primary,
    fontSize: 12,
    fontWeight: AppTypography.medium,
  },
  invalidText: {
    color: AppColors.mutedText,
    fontSize: 12,
  },
  devicesList: {
    gap: AppSpacing.sm,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    borderRadius: 12,
    borderWidth: 1,
    padding: AppSpacing.lg,
  },
  deviceCardIdle: {
    borderColor: AppColors.cardBorder,
    backgroundColor: MUTED_CARD,
  },
  deviceCardSelected: {
    borderColor: PRIMARY_BORDER,
    backgroundColor: 'rgba(38, 128, 217, 0.05)',
  },
  deviceIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  deviceIconIdle: {
    backgroundColor: AppColors.mutedSurface,
  },
  deviceIconSelected: {
    backgroundColor: AppColors.primary,
  },
  deviceCopy: {
    flex: 1,
    minWidth: 0,
  },
  deviceName: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.medium,
  },
  deviceMeta: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 12,
  },
  knownSection: {
    gap: AppSpacing.sm,
  },
  knownTitle: {
    color: AppColors.text,
    fontSize: 13,
    fontWeight: AppTypography.semiBold,
  },
  knownList: {
    gap: AppSpacing.sm,
  },
  knownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: MUTED_CARD,
    padding: AppSpacing.md,
  },
  knownName: {
    color: AppColors.text,
    fontSize: 13,
    fontWeight: AppTypography.medium,
  },
  allKnownText: {
    color: AppColors.mutedText,
    fontSize: 13,
    textAlign: 'center',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(210, 56, 45, 0.2)',
    backgroundColor: 'rgba(210, 56, 45, 0.05)',
    padding: AppSpacing.md,
  },
  errorText: {
    flex: 1,
    color: AppColors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  doneState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
  },
  doneIcon: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: AppSpacing.xl,
    borderRadius: 24,
    backgroundColor: 'rgba(57, 172, 121, 0.1)',
  },
  doneTitle: {
    color: AppColors.text,
    fontSize: 18,
    fontWeight: AppTypography.bold,
    textAlign: 'center',
  },
  doneDescription: {
    maxWidth: 260,
    marginTop: 4,
    color: AppColors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  importSummary: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.xl,
    marginBottom: AppSpacing.xl,
  },
  summaryPill: {
    minWidth: 74,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: MUTED_CARD,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
  },
  summaryValue: {
    color: AppColors.text,
    fontSize: 16,
    fontWeight: AppTypography.bold,
  },
  summaryLabel: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 11,
  },
  doneButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.sm,
    borderRadius: 12,
    paddingHorizontal: AppSpacing.xl,
  },
  doneButtonText: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  pressed: {
    opacity: 0.86,
  },
});
