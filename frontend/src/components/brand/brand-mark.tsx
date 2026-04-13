import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppColors, AppGradients, AppRadius } from '@/constants/design';

type BrandMarkProps = {
  iconColor?: string;
  size?: number;
  iconSize?: number;
  variant?: 'gradient' | 'frosted';
};

const ENERGY_GRADIENT = { experimental_backgroundImage: AppGradients.energy } as const;

export function BrandMark({
  iconColor = AppColors.text,
  size = 80,
  iconSize = 34,
  variant = 'gradient',
}: BrandMarkProps) {
  return (
    <View
      style={[
        styles.container,
        variant === 'gradient' && ENERGY_GRADIENT,
        variant === 'frosted' && styles.frosted,
        {
          width: size,
          height: size,
          borderRadius:
            variant === 'frosted'
              ? AppRadius.splash
              : size >= 80
                ? AppRadius.xl
                : AppRadius.lg,
        },
      ]}>
      <Feather color={iconColor} name="zap" size={iconSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frosted: {
    backgroundColor: AppColors.frostedSurface,
    borderWidth: 1,
    borderColor: AppColors.frostedBorder,
  },
});
