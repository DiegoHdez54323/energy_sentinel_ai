import type { ShellyDiscoveredDevice, ShellyImportDevicePayload } from './shelly.types';

export function getShellyDeviceDisplayName(device: ShellyDiscoveredDevice) {
  const name =
    device.suggestedDisplayName?.trim() ||
    device.deviceCode?.trim() ||
    `Shelly ${device.externalDeviceId}`;

  return name.slice(0, 120);
}

export function getShellyDeviceTypeLabel(device: ShellyDiscoveredDevice) {
  return device.deviceCode?.trim() || device.suggestedVendor || 'Shelly';
}

export function getShellyDeviceMetaLabel(device: ShellyDiscoveredDevice) {
  const parts = [
    getShellyDeviceTypeLabel(device),
    device.isOnline ? 'Online' : 'Offline',
    device.ipAddress,
  ].filter(Boolean);

  return parts.join(' · ');
}

export function toShellyImportDevicePayload(
  device: ShellyDiscoveredDevice
): ShellyImportDevicePayload {
  return {
    displayName: getShellyDeviceDisplayName(device),
    externalDeviceId: device.externalDeviceId,
    vendor: device.suggestedVendor || 'shelly',
  };
}
