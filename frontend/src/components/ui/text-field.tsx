import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { useState } from 'react';

import { AppColors, AppRadius, AppTypography } from '@/constants/design';

type TextFieldProps = TextInputProps & {
  icon: ReactNode;
  onToggleSecureEntry?: () => void;
};

export function TextField({ icon, onToggleSecureEntry, ...inputProps }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <View style={styles.icon}>{icon}</View>

        <TextInput
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          placeholderTextColor={AppColors.placeholder}
          selectionColor={AppColors.primary}
          style={styles.input}
          {...inputProps}
        />

        {onToggleSecureEntry ? (
          <Pressable
            accessibilityLabel="Mostrar u ocultar contrasena"
            accessibilityRole="button"
            onPress={onToggleSecureEntry}
            style={styles.toggle}>
            <Feather
              color={AppColors.mutedText}
              name={inputProps.secureTextEntry ? 'eye' : 'eye-off'}
              size={18}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: AppRadius.input,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.surface,
    paddingLeft: 16,
    paddingRight: 12,
  },
  fieldFocused: {
    borderColor: AppColors.primary,
  },
  icon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: AppColors.text,
    fontSize: AppTypography.bodySize,
    paddingVertical: 12,
  },
  toggle: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
});
