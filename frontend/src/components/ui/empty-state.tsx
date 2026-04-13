import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors, AppGradients, AppRadius, AppSpacing, AppTypography } from '@/constants/design';

type FeatherIconName = keyof typeof Feather.glyphMap;

type EmptyStateProps = {
  action?: {
    label: string;
    onPress: () => void;
  };
  description: string;
  icon: FeatherIconName;
  title: string;
};

const PRIMARY_GRADIENT = { experimental_backgroundImage: AppGradients.primary } as const;

export function EmptyState({ action, description, icon, title }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconFrame}>
        <Feather color={AppColors.mutedText} name={icon} size={28} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [styles.actionButton, PRIMARY_GRADIENT, pressed && styles.pressed]}>
          <Text style={styles.actionLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.xl,
    paddingVertical: 64,
  },
  iconFrame: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: AppSpacing.lg,
    borderRadius: 16,
    backgroundColor: AppColors.mutedSurface,
  },
  title: {
    marginBottom: 6,
    color: AppColors.text,
    fontSize: 16,
    fontWeight: AppTypography.semiBold,
    textAlign: 'center',
  },
  description: {
    maxWidth: 260,
    color: AppColors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  actionButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: AppSpacing.xl,
    paddingHorizontal: AppSpacing.xl,
    borderRadius: AppRadius.input,
  },
  actionLabel: {
    color: AppColors.text,
    fontSize: 14,
    fontWeight: AppTypography.semiBold,
  },
  pressed: {
    opacity: 0.92,
  },
});
