import { DarkTheme, type Theme } from '@react-navigation/native';

export const AppColors = {
  background: '#101318',
  surface: '#181D25',
  text: '#EDF0F3',
  mutedText: '#818898',
  placeholder: '#818898',
  primary: '#2680D9',
  primaryBright: '#4799EB',
  primaryDeep: '#2952A3',
  border: '#272C35',
  frostedSurface: 'rgba(255, 255, 255, 0.15)',
  frostedBorder: 'rgba(255, 255, 255, 0.2)',
  loaderDot: 'rgba(255, 255, 255, 0.4)',
} as const;

export const AppGradients = {
  energy: 'linear-gradient(135deg, #2680D9 0%, #2952A3 100%)',
  primary: 'linear-gradient(135deg, #2680D9 0%, #4799EB 100%)',
} as const;

export const AppSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  screenTop: 24,
  screenBottom: 24,
  screenHorizontal: 24,
} as const;

export const AppRadius = {
  input: 12,
  lg: 16,
  xl: 24,
  splash: 32,
} as const;

export const AppTypography = {
  heroSize: 24,
  titleSize: 24,
  bodySize: 15,
  captionSize: 14,
  smallSize: 13,
  tightLetterSpacing: -0.3,
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
} as const;

export const AppNavigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: AppColors.primary,
    background: AppColors.background,
    card: AppColors.surface,
    text: AppColors.text,
    border: AppColors.border,
    notification: AppColors.primary,
  },
};
