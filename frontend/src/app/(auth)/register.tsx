import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand/brand-mark';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenBackground } from '@/components/ui/screen-background';
import { TextField } from '@/components/ui/text-field';
import { AppColors, AppRadius, AppSpacing, AppTypography } from '@/constants/design';
import { getAuthErrorMessage } from '@/features/auth/auth.errors';
import { useAuth } from '@/features/auth/auth-provider';
import { getFirstFormError, type RegisterFormValues, toRegisterPayload, validateRegisterForm } from '@/features/auth/form-state';

const INITIAL_VALUES: RegisterFormValues = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export default function RegisterScreen() {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, status } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/home');
    }
  }, [status]);

  const updateField = <K extends keyof RegisterFormValues>(
    field: K,
    value: RegisterFormValues[K]
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleRegister = async () => {
    const validationMessage = getFirstFormError(validateRegisterForm(values));

    if (validationMessage) {
      Alert.alert('Revisa tus datos', validationMessage);
      return;
    }

    setIsSubmitting(true);

    try {
      await register(toRegisterPayload(values));
    } catch (error) {
      Alert.alert('No se pudo crear la cuenta', getAuthErrorMessage(error, 'register'));
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
            <Animated.View entering={FadeInUp.duration(420)} style={styles.header}>
              <Pressable onPress={() => router.replace('/login')} style={styles.backButton}>
                <Feather color={AppColors.text} name="arrow-left" size={18} />
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(100).duration(450)} style={styles.topSection}>
              <BrandMark size={56} iconSize={28} variant="gradient" />
              <View style={styles.copyBlock}>
                <Text style={styles.title}>Crear cuenta</Text>
                <Text style={styles.subtitle}>
                  Empieza a monitorear tu consumo de energia
                </Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(180).duration(500)} style={styles.formArea}>
              <View style={styles.formFields}>
                <TextField
                  autoCapitalize="words"
                  autoComplete="name"
                  icon={<Feather color={AppColors.mutedText} name="user" size={18} />}
                  onChangeText={(value) => updateField('fullName', value)}
                  placeholder="Nombre completo"
                  textContentType="name"
                  value={values.fullName}
                />

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
                  autoComplete="new-password"
                  icon={<Feather color={AppColors.mutedText} name="lock" size={18} />}
                  onChangeText={(value) => updateField('password', value)}
                  onToggleSecureEntry={() => setShowPassword((current) => !current)}
                  placeholder="Contrasena"
                  secureTextEntry={!showPassword}
                  textContentType="newPassword"
                  value={values.password}
                />

                <TextField
                  autoCapitalize="none"
                  autoComplete="new-password"
                  icon={<Feather color={AppColors.mutedText} name="lock" size={18} />}
                  placeholder="Confirmar contrasena"
                  secureTextEntry={!showPassword}
                  textContentType="newPassword"
                  onChangeText={(value) => updateField('confirmPassword', value)}
                  value={values.confirmPassword}
                />
              </View>

              <View style={styles.bottomBlock}>
                <PrimaryButton
                  accessibilityLabel="Crear cuenta"
                  disabled={isSubmitting}
                  label={isSubmitting ? 'Creando cuenta...' : 'Crear cuenta'}
                  onPress={handleRegister}
                />

                <View style={styles.footerRow}>
                  <Text style={styles.footerText}>Ya tienes cuenta? </Text>
                  <Pressable onPress={() => router.replace('/login')} style={styles.inlineLink}>
                    <Text style={styles.inlineLinkText}>Inicia sesion</Text>
                  </Pressable>
                </View>
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
    paddingBottom: AppSpacing.xxxl,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadius.input,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  topSection: {
    flex: 1,
    paddingHorizontal: AppSpacing.xl,
    paddingTop: AppSpacing.xxl,
  },
  copyBlock: {
    marginTop: 20,
  },
  title: {
    color: AppColors.text,
    fontSize: AppTypography.titleSize,
    fontWeight: AppTypography.bold,
  },
  subtitle: {
    marginTop: AppSpacing.xs,
    color: AppColors.mutedText,
    fontSize: AppTypography.smallSize,
  },
  formArea: {
    paddingHorizontal: AppSpacing.xl,
    gap: AppSpacing.xxxl,
  },
  formFields: {
    gap: AppSpacing.md,
    marginTop: AppSpacing.xxl,
  },
  bottomBlock: {
    gap: AppSpacing.lg,
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
