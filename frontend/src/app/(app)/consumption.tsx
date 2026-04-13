import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MobileShell } from '@/components/navigation/mobile-shell';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppSpacing, AppTypography } from '@/constants/design';

export default function ConsumptionPlaceholderScreen() {
  return (
    <ScreenBackground>
      <MobileShell activeTab="consumption">
        <SafeAreaView style={styles.safeArea}>
          <Animated.View entering={FadeInDown.duration(420)} style={styles.container}>
            <Text style={styles.eyebrow}>Consumo</Text>
            <Text style={styles.title}>Analitica de energia</Text>
            <View style={styles.card}>
              <Feather color={AppColors.primary} name="zap" size={28} />
              <Text style={styles.cardTitle}>Pantalla pendiente</Text>
              <Text style={styles.cardText}>
                Aqui conectaremos graficas y resumenes de consumo del home activo.
              </Text>
            </View>
          </Animated.View>
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
    paddingHorizontal: 20,
    paddingTop: 40,
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
  },
  card: {
    alignItems: 'center',
    gap: AppSpacing.md,
    marginTop: AppSpacing.xl,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.cardBorder,
    backgroundColor: 'rgba(24, 29, 37, 0.8)',
    padding: AppSpacing.xl,
  },
  cardTitle: {
    color: AppColors.text,
    fontSize: 16,
    fontWeight: AppTypography.semiBold,
  },
  cardText: {
    color: AppColors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
