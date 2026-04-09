import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { startTransition, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand/brand-mark';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenBackground } from '@/components/ui/screen-background';
import { TextField } from '@/components/ui/text-field';
import { AppColors, AppSpacing, AppTypography } from '@/constants/design';
import { getAuthErrorMessage } from '@/features/auth/auth.errors';
import { useAuth } from '@/features/auth/auth-provider';
import { getFirstFormError, type LoginFormValues, toLoginPayload, validateLoginForm } from '@/features/auth/form-state';

const INITIAL_VALUES: LoginFormValues = {
  email: '',
  password: '',
};

export default function LoginScreen() {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, status } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/home');
    }
  }, [status]);

  const updateField = <K extends keyof LoginFormValues>(field: K, value: LoginFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleLogin = async () => {
    const validationMessage = getFirstFormError(validateLoginForm(values));

    if (validationMessage) {
      Alert.alert('Revisa tus datos', validationMessage);
      return;
    }

    setIsSubmitting(true);

    try {
      await login(toLoginPayload(values));
      startTransition(() => {
        router.replace('/home');
      });
    } catch (error) {
      Alert.alert('No se pudo iniciar sesion', getAuthErrorMessage(error, 'login'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoiding}>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInUp.duration(500)} style={styles.hero}>
              <Animated.View entering={ZoomIn.duration(450)}>
                <BrandMark size={80} iconSize={40} variant="gradient" />
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.brandBlock}>
                <Text style={styles.brandTitle}>Energy Sentinel</Text>
                <Text style={styles.brandSubtitle}>Monitoreo inteligente de energia</Text>
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(180).duration(520)} style={styles.formSection}>
              <View style={styles.formFields}>
                <TextField
                  autoCapitalize="none"
                  autoComplete="email"
                  icon={<Feather color={AppColors.mutedText} name="mail" size={18} />}
                  keyboardType="email-address"
                  onChangeText={(value) => updateField('email', value)}
                  placeholder="Correo electronico"
                  textContentType="emailAddress"
                  value={values.email}
                />

                <TextField
                  autoCapitalize="none"
                  autoComplete="password"
                  icon={<Feather color={AppColors.mutedText} name="lock" size={18} />}
                  onChangeText={(value) => updateField('password', value)}
                  onToggleSecureEntry={() => setShowPassword((current) => !current)}
                  placeholder="Contrasena"
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  value={values.password}
                />
              </View>

              <PrimaryButton
                accessibilityLabel="Iniciar sesion"
                label={isSubmitting ? 'Entrando...' : 'Iniciar sesion'}
                onPress={handleLogin}
                disabled={isSubmitting}
              />

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>No tienes cuenta? </Text>
                <Pressable onPress={() => router.push('/register')} style={styles.inlineLink}>
                  <Text style={styles.inlineLinkText}>Registrate</Text>
                </Pressable>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: AppSpacing.xxxl,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.xxl,
    paddingTop: 80,
  },
  brandBlock: {
    marginTop: AppSpacing.xl,
    alignItems: 'center',
  },
  brandTitle: {
    color: AppColors.text,
    fontSize: AppTypography.heroSize,
    fontWeight: AppTypography.bold,
  },
  brandSubtitle: {
    marginTop: AppSpacing.xs,
    color: AppColors.mutedText,
    fontSize: AppTypography.smallSize,
    fontWeight: AppTypography.regular,
  },
  formSection: {
    gap: AppSpacing.lg,
    paddingHorizontal: AppSpacing.xl,
  },
  formFields: {
    gap: AppSpacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    color: AppColors.mutedText,
    fontSize: AppTypography.bodySize,
  },
  inlineLink: {
    paddingVertical: 2,
  },
  inlineLinkText: {
    color: AppColors.primary,
    fontSize: AppTypography.bodySize,
    fontWeight: AppTypography.semiBold,
  },
});
