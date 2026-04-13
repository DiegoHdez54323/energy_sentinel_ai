import { getResolvedDeviceTimezone } from './homes.format';
import type { CreateHomePayload } from './homes.types';

export type CreateHomeFormValues = {
  address: string;
  name: string;
};

export function validateCreateHomeForm(values: CreateHomeFormValues) {
  const errors: Partial<Record<keyof CreateHomeFormValues, string>> = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = 'Ingresa el nombre del hogar';
  } else if (name.length > 120) {
    errors.name = 'Usa 120 caracteres o menos';
  }

  return errors;
}

export function toCreateHomePayload(values: CreateHomeFormValues): CreateHomePayload {
  return {
    name: values.name.trim(),
    timezone: getResolvedDeviceTimezone(),
  };
}
