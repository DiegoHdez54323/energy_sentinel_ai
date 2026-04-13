import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppGradients, AppSpacing, AppTypography } from '@/constants/design';
import { useAuth } from '@/features/auth/auth-provider';
import { getShellyErrorMessage } from '@/features/shelly/shelly.errors';
import type { ShellyIntegration } from '@/features/shelly/shelly.types';
import { useShellyIntegration } from '@/features/shelly/use-shelly-integration';

const PRIMARY_TINT = 'rgba(38, 128, 217, 0.1)';
const SUCCESS_TINT = 'rgba(57, 172, 121, 0.1)';
const SUCCESS_BORDER = 'rgba(57, 172, 121, 0.2)';
const MUTED_CARD = 'rgba(24, 29, 37, 0.8)';
const PRIMARY_GRADIENT = { experimental_backgroundImage: AppGradients.primary } as const;

type ActionState = 'connecting' | 'disconnecting' | 'refreshing' | 'verifying' | null;

export default function ShellyIntegrationScreen() {
  const { status: authStatus } = useAuth();
  const [actionState, setActionState] = useState<ActionState>(null);
  const {
    disconnect,
    error,
    integration,
    refreshAccess,
    reload,
    startOAuth,
    status,
  } = useShellyIntegration();

  useEffect(() => {
    if (authStatus === 'anonymous') {
      router.replace('/login');
    }
  }, [authStatus]);

  if (authStatus !== 'authenticated') {
    return <ScreenBackground />;
  }

  const isConnected = Boolean(integration?.connected && integration.status === 'active');
  const isBusy = actionState !== null || status === 'loading';

  const handleConnect = async () => {
    setActionState('connecting');

    try {
      const authUrl = await startOAuth();
      await WebBrowser.openBrowserAsync(authUrl);
      setActionState('verifying');
      reload();
    } catch (connectError) {
      Alert.alert('No se pudo conectar Shelly', getShellyErrorMessage(connectError, 'connect'));
    } finally {
      setActionState(null);
    }
  };

  const handleRefresh = async () => {
    setActionState('refreshing');

    try {
      await refreshAccess();
    } catch (refreshError) {
      Alert.alert('No se pudo re-sincronizar', getShellyErrorMessage(refreshError, 'refresh'));
    } finally {
      setActionState(null);
    }
  };

  const handleVerify = () => {
    setActionState('verifying');
    reload();
    setTimeout(() => setActionState(null), 500);
  };

  const handleDisconnect = () => {
    Alert.alert('Desconectar Shelly', 'Esto quitara la cuenta Shelly vinculada a Energy Sentinel.', [
      { style: 'cancel', text: 'Cancelar' },
      {
        style: 'destructive',
        text: 'Desconectar',
        onPress: () => {
          void disconnectShelly();
        },
      },
    ]);
  };

  const disconnectShelly = async () => {
    setActionState('disconnecting');

    try {
      await disconnect();
    } catch (disconnectError) {
      Alert.alert('No se pudo desconectar', getShellyErrorMessage(disconnectError, 'delete'));
    } finally {
      setActionState(null);
    }
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(360)} style={styles.header}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/profile')}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Feather color={AppColors.text} name="arrow-left" size={16} />
            </Pressable>
            <Text style={styles.headerTitle}>Integracion Shelly</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).duration(400)}>
            <ConnectionCard
              actionState={actionState}
              integration={integration}
              isBusy={isBusy}
              isConnected={isConnected}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onRefresh={handleRefresh}
              onVerify={handleVerify}
              status={status}
            />
          </Animated.View>

          {status === 'error' ? (
            <Animated.View entering={FadeInDown.delay(90).duration(400)} style={styles.errorCard}>
              <Feather color={AppColors.anomaly} name="alert-circle" size={18} />
              <Text style={styles.errorText}>{getShellyErrorMessage(error, 'list')}</Text>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(120).duration(420)} style={styles.infoCard}>
            <Text style={styles.infoTitle}>Como funciona?</Text>
            <View style={styles.steps}>
              <Step
                description="Vincula tu cuenta de Shelly Cloud con OAuth seguro."
                index="1"
                title="Conecta tu cuenta"
              />
              <Step
                description="Luego buscaremos automaticamente los smart plugs de tu cuenta."
                index="2"
                title="Descubre dispositivos"
              />
              <Step
                description="Selecciona los dispositivos que quieres monitorear en Energy Sentinel."
                index="3"
                title="Importa y monitorea"
              />
            </View>
          </Animated.View>

          {isConnected ? (
            <Animated.View entering={FadeInDown.delay(180).duration(440)}>
              <PrimaryButton
                accessibilityLabel="Descubrir dispositivos Shelly"
                disabled
                label="Descubrir dispositivos Shelly"
                onPress={() => undefined}
              />
              <Text style={styles.disabledHint}>
                Discovery e importacion quedan para el siguiente sprint.
              </Text>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(220).duration(460)} style={styles.endpointCard}>
            <Text style={styles.endpointText}>
              <Text style={styles.endpointStrong}>Endpoints:</Text> GET /integrations/shelly ·
              POST /integrations/shelly
            </Text>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function ConnectionCard({
  actionState,
  integration,
  isBusy,
  isConnected,
  onConnect,
  onDisconnect,
  onRefresh,
  onVerify,
  status,
}: {
  actionState: ActionState;
  integration: ShellyIntegration | null;
  isBusy: boolean;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onVerify: () => void;
  status: 'error' | 'loading' | 'refreshing' | 'success';
}) {
  const needsAttention = Boolean(integration?.needsRefresh || integration?.isAccessTokenValid === false);

  return (
    <View
      style={[
        styles.connectionCard,
        isConnected ? styles.connectionCardConnected : styles.connectionCardIdle,
      ]}>
      <View style={styles.statusHeader}>
        <View style={[styles.statusIcon, isConnected ? styles.statusIconConnected : styles.statusIconIdle]}>
          {status === 'loading' ? (
            <ActivityIndicator color={AppColors.primary} />
          ) : (
            <Feather
              color={isConnected ? AppColors.success : AppColors.mutedText}
              name={isConnected ? 'check-circle' : 'x-circle'}
              size={24}
            />
          )}
        </View>
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>
            {isConnected ? 'Shelly Cloud conectado' : 'Sin conexion'}
          </Text>
          <Text style={styles.statusSubtitle}>
            {isConnected
              ? 'Cuenta vinculada correctamente'
              : 'Conecta tu cuenta Shelly para importar dispositivos'}
          </Text>
        </View>
      </View>

      {isConnected ? (
        <View style={styles.statusMeta}>
          <MetaRow label="Estado" value={needsAttention ? 'Requiere refresh' : integration?.status ?? 'active'} />
          <MetaRow label="Ultima sincronizacion" value={formatDate(integration?.lastSyncAt)} />
          <MetaRow label="API Shelly" value={integration?.userApiUrl ?? 'No disponible'} />
        </View>
      ) : null}

      {isConnected ? (
        <View style={styles.actionsRow}>
          <OutlineButton
            disabled={isBusy}
            icon="x-circle"
            label={actionState === 'disconnecting' ? 'Desconectando' : 'Desconectar'}
            onPress={onDisconnect}
          />
          <OutlineButton
            disabled={isBusy}
            icon="refresh-cw"
            label={actionState === 'refreshing' ? 'Sincronizando' : 'Re-sincronizar'}
            onPress={onRefresh}
          />
        </View>
      ) : (
        <View style={styles.connectArea}>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={onConnect}
            style={({ pressed }) => [
              styles.connectButton,
              PRIMARY_GRADIENT,
              (pressed || isBusy) && styles.pressed,
            ]}>
            <Feather color={AppColors.text} name="external-link" size={16} />
            <Text style={styles.connectButtonText}>
              {actionState === 'connecting' ? 'Abriendo Shelly...' : 'Conectar con Shelly Cloud'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={onVerify}
            style={({ pressed }) => [styles.verifyButton, pressed && styles.pressed]}>
            <Text style={styles.verifyText}>
              {actionState === 'verifying' ? 'Verificando...' : 'Ya conecte, verificar'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function OutlineButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.outlineButton, pressed && !disabled && styles.pressed]}>
      <Feather color={AppColors.text} name={icon} size={14} />
      <Text style={styles.outlineButtonText}>{label}</Text>
    </Pressable>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metaValue}>
        {value}
      </Text>
    </View>
  );
}

function Step({
  description,
  index,
  title,
}: {
  description: string;
  index: string;
  title: string;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIndex}>
        <Text style={styles.stepIndexText}>{index}</Text>
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDescription}>{description}</Text>
      </View>
    </View>
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'No disponible';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'No disponible';
  }

  return date.toLocaleString();
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
  headerTitle: {
    color: AppColors.text,
    fontSize: 18,
    fontWeight: AppTypography.bold,
  },
  connectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
  },
  connectionCardConnected: {
    borderColor: SUCCESS_BORDER,
    backgroundColor: 'rgba(57, 172, 121, 0.05)',
  },
  connectionCardIdle: {
    borderColor: AppColors.border,
    backgroundColor: MUTED_CARD,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
  },
  statusIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  statusIconConnected: {
    backgroundColor: SUCCESS_TINT,
  },
  statusIconIdle: {
    backgroundColor: AppColors.mutedSurface,
  },
  statusCopy: {
    flex: 1,
  },
  statusTitle: {
    color: AppColors.text,
    fontSize: 16,
    fontWeight: AppTypography.semiBold,
  },
  statusSubtitle: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 12,
  },
  statusMeta: {
    gap: AppSpacing.sm,
    marginTop: AppSpacing.lg,
    borderTopWidth: 1,
    borderTopColor: AppColors.cardBorder,
    paddingTop: AppSpacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing.md,
  },
  metaLabel: {
    color: AppColors.mutedText,
    fontSize: 12,
  },
  metaValue: {
    flex: 1,
    color: AppColors.text,
    fontSize: 12,
    textAlign: 'right',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.lg,
  },
  outlineButton: {
    minHeight: 36,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  outlineButtonText: {
    color: AppColors.text,
    fontSize: 12,
    fontWeight: AppTypography.medium,
  },
  connectArea: {
    gap: AppSpacing.md,
    marginTop: AppSpacing.lg,
  },
  connectButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.sm,
    borderRadius: 12,
  },
  connectButtonText: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  verifyButton: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: PRIMARY_TINT,
  },
  verifyText: {
    color: AppColors.primary,
    fontSize: 12,
    fontWeight: AppTypography.medium,
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
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: MUTED_CARD,
    padding: 20,
  },
  infoTitle: {
    marginBottom: AppSpacing.md,
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  steps: {
    gap: AppSpacing.lg,
  },
  step: {
    flexDirection: 'row',
    gap: AppSpacing.md,
  },
  stepIndex: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: PRIMARY_TINT,
  },
  stepIndexText: {
    color: AppColors.primary,
    fontSize: 12,
    fontWeight: AppTypography.bold,
  },
  stepCopy: {
    flex: 1,
  },
  stepTitle: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.medium,
  },
  stepDescription: {
    marginTop: 2,
    color: AppColors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  disabledHint: {
    marginTop: AppSpacing.sm,
    color: AppColors.mutedText,
    fontSize: 12,
    textAlign: 'center',
  },
  endpointCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: MUTED_CARD,
    padding: AppSpacing.lg,
  },
  endpointText: {
    color: AppColors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  endpointStrong: {
    color: AppColors.text,
    fontWeight: AppTypography.medium,
  },
  pressed: {
    opacity: 0.84,
  },
});
