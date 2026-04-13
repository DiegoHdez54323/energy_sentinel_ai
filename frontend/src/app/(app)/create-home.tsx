import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppRadius, AppSpacing, AppTypography } from '@/constants/design';
import { useAuth } from '@/features/auth/auth-provider';
import { writeActiveHomeSelection } from '@/features/homes/active-home.storage';
import { createHome } from '@/features/homes/homes.api';
import { getHomesErrorMessage } from '@/features/homes/homes.errors';
import {
  type CreateHomeFormValues,
  toCreateHomePayload,
  validateCreateHomeForm,
} from '@/features/homes/homes.form';
import type { Home } from '@/features/homes/homes.types';

const INITIAL_VALUES = {
  address: '',
  name: '',
} satisfies CreateHomeFormValues;

export default function CreateHomeScreen() {
  const { authenticatedRequest, status } = useAuth();
  const [createdHome, setCreatedHome] = useState<Home | null>(null);
  const [focusedField, setFocusedField] = useState<keyof CreateHomeFormValues | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [values, setValues] = useState<CreateHomeFormValues>(INITIAL_VALUES);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
    }
  }, [status]);

  useEffect(() => {
    if (!createdHome) {
      return;
    }

    const navigationTimer = setTimeout(() => {
      router.replace({
        pathname: '/home-dashboard',
        params: {
          homeId: createdHome.id,
          homeName: createdHome.name,
        },
      });
    }, 0);

    return () => {
      clearTimeout(navigationTimer);
    };
  }, [createdHome]);

  if (status !== 'authenticated') {
    return <ScreenBackground />;
  }

  const updateField = (field: keyof CreateHomeFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/home');
  };

  const handleCreateHome = async () => {
    const errors = validateCreateHomeForm(values);
    const firstError = Object.values(errors).find(Boolean);

    if (firstError) {
      Alert.alert('No se pudo crear el hogar', firstError);
      return;
    }

    setIsSubmitting(true);

    try {
      const { home } = await createHome(authenticatedRequest, toCreateHomePayload(values));
      await writeActiveHomeSelection({ id: home.id, name: home.name });
      setCreatedHome(home);
    } catch (error) {
      setIsSubmitting(false);
      Alert.alert('No se pudo crear el hogar', getHomesErrorMessage(error, 'create'));
    }
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Volver"
              accessibilityRole="button"
              onPress={goBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Feather color={AppColors.text} name="arrow-left" size={16} />
            </Pressable>
            <Text style={styles.headerTitle}>Nuevo hogar</Text>
          </View>

          <Animated.View entering={FadeInDown.duration(420)} style={styles.content}>
            <View style={styles.iconWrap}>
              <View style={styles.homeIcon}>
                <Feather color={AppColors.secondaryText} name="home" size={40} />
              </View>
            </View>

            <View style={styles.form}>
              <LabeledInput
                focused={focusedField === 'name'}
                label="Nombre del hogar"
                onBlur={() => setFocusedField(null)}
                onChangeText={(value) => updateField('name', value)}
                onFocus={() => setFocusedField('name')}
                placeholder="Ej: Casa Principal"
                value={values.name}
              />

              <LabeledInput
                focused={focusedField === 'address'}
                icon="map-pin"
                label="Dirección (opcional)"
                onBlur={() => setFocusedField(null)}
                onChangeText={(value) => updateField('address', value)}
                onFocus={() => setFocusedField('address')}
                placeholder="Ciudad o dirección"
                value={values.address}
              />
            </View>

            <View style={styles.submit}>
              <PrimaryButton
                accessibilityLabel="Crear hogar"
                disabled={isSubmitting}
                label={isSubmitting ? 'Creando hogar...' : 'Crear hogar'}
                onPress={handleCreateHome}
              />
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function LabeledInput({
  focused,
  icon,
  label,
  onBlur,
  onChangeText,
  onFocus,
  placeholder,
  value,
}: {
  focused: boolean;
  icon?: keyof typeof Feather.glyphMap;
  label: string;
  onBlur: () => void;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputFrame, focused && styles.inputFrameFocused]}>
        {icon ? (
          <Feather color={AppColors.mutedText} name={icon} size={16} style={styles.inputIcon} />
        ) : null}
        <TextInput
          autoCapitalize="words"
          onBlur={onBlur}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder={placeholder}
          placeholderTextColor={AppColors.placeholder}
          selectionColor={AppColors.primary}
          style={styles.input}
          value={value}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    marginBottom: 32,
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
  content: {
    gap: 20,
  },
  iconWrap: {
    alignItems: 'center',
  },
  homeIcon: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: AppColors.secondary,
  },
  form: {
    gap: AppSpacing.md,
  },
  label: {
    marginBottom: 6,
    color: AppColors.mutedText,
    fontSize: 12,
    fontWeight: AppTypography.medium,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inputFrame: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: AppRadius.input,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.surface,
    paddingHorizontal: AppSpacing.lg,
  },
  inputFrameFocused: {
    borderColor: AppColors.primary,
  },
  inputIcon: {
    marginRight: AppSpacing.md,
  },
  input: {
    flex: 1,
    color: AppColors.text,
    fontSize: 14,
    paddingVertical: AppSpacing.md,
  },
  submit: {
    marginTop: AppSpacing.sm,
  },
  pressed: {
    opacity: 0.88,
  },
});
