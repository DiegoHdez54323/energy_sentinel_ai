import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppColors, AppGradients } from '@/constants/design';

type ScreenBackgroundProps = PropsWithChildren<{
  variant?: 'base' | 'energy';
}>;

const ENERGY_GRADIENT = { experimental_backgroundImage: AppGradients.energy } as const;

export function ScreenBackground({
  children,
  variant = 'base',
}: ScreenBackgroundProps) {
  return (
    <View style={[styles.container, variant === 'energy' && ENERGY_GRADIENT]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
});
