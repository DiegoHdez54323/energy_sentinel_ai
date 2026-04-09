import type { LoginPayload, RegisterPayload } from './auth.types';

export type LoginFormValues = {
  email: string;
  password: string;
};

export type RegisterFormValues = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const EMAIL_PATTERN = /\S+@\S+\.\S+/;

function isBlank(value: string) {
  return value.trim().length === 0;
}

export function validateLoginForm(values: LoginFormValues) {
  const errors: Partial<Record<keyof LoginFormValues, string>> = {};

  if (isBlank(values.email)) {
    errors.email = 'Ingresa tu correo';
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Correo invalido';
  }

  if (isBlank(values.password)) {
    errors.password = 'Ingresa tu contrasena';
  }

  return errors;
}

export function validateRegisterForm(values: RegisterFormValues) {
  const errors: Partial<Record<keyof RegisterFormValues, string>> = {};

  if (isBlank(values.fullName)) {
    errors.fullName = 'Ingresa tu nombre';
  }

  if (isBlank(values.email)) {
    errors.email = 'Ingresa tu correo';
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Correo invalido';
  }

  if (isBlank(values.password)) {
    errors.password = 'Ingresa una contrasena';
  } else if (values.password.trim().length < 8) {
    errors.password = 'Usa al menos 8 caracteres';
  }

  if (isBlank(values.confirmPassword)) {
    errors.confirmPassword = 'Confirma tu contrasena';
  } else if (values.password !== values.confirmPassword) {
    errors.confirmPassword = 'Las contrasenas no coinciden';
  }

  return errors;
}

export function getFirstFormError<T extends Record<string, string | undefined>>(
  errors: Partial<T>
) {
  return Object.values(errors).find((value) => typeof value === 'string' && value.length > 0);
}

export function toLoginPayload(values: LoginFormValues): LoginPayload {
  return {
    email: values.email.trim(),
    password: values.password,
  };
}

export function toRegisterPayload(values: RegisterFormValues): RegisterPayload {
  return {
    email: values.email.trim(),
    password: values.password,
    name: values.fullName.trim(),
  };
}
