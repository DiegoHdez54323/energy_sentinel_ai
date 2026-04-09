import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

import { AppColors, AppNavigationTheme } from '@/constants/design';
import { AuthProvider } from '@/features/auth/auth-provider';

export default function RootLayout() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(AppColors.background);
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider value={AppNavigationTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            contentStyle: { backgroundColor: AppColors.background },
          }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
