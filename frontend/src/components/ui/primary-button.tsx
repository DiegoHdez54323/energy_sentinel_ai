import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors, AppGradients, AppRadius, AppTypography } from '@/constants/design';

type PrimaryButtonProps = {
  accessibilityLabel?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  label: string;
  onPress: () => void;
};

const PRIMARY_GRADIENT = { experimental_backgroundImage: AppGradients.primary } as const;

export function PrimaryButton({
  accessibilityLabel,
  disabled = false,
  fullWidth = true,
  label,
  onPress,
}: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        fullWidth && styles.fullWidth,
        pressed && !disabled && styles.pressed,
      ]}>
      <View style={[styles.inner, PRIMARY_GRADIENT, disabled && styles.disabled]}>
        <Text style={styles.label}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
  inner: {
    minHeight: 48,
    borderRadius: AppRadius.input,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pressed: {
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.7,
  },
  label: {
    color: AppColors.text,
    fontSize: AppTypography.bodySize,
    fontWeight: AppTypography.semiBold,
  },
});
