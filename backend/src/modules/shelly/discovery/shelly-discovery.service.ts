import { Prisma } from "../../../generated/prisma/client.js";
import { ownedDeviceContextSelect } from "../../../common/ownership/device-ownership.js";
import { prisma } from "../../../lib/prisma.js";
import type { ShellyImportDevicesBodyInput } from "../shelly.schemas.js";
import {
  SHELLY_DATA_SOURCE,
  SHELLY_DEFAULT_VENDOR,
  SHELLY_STATUS_ACTIVE,
  SHELLY_STATUS_DISABLED,
} from "../shared/shelly.constants.js";
import { fetchShellyAllStatusWithRetry } from "../shared/shelly-all-status.js";
import { normalizeShellyDiscoveryPayload } from "../shared/shelly-parsers.js";
import { setShellyIntegrationLastSync } from "../shared/shelly-integration.repository.js";
import type {
  ShellyDiscoveredDevice,
  ShellyDiscoveryKnownDevice,
  ShellyDiscoveryResult,
  ShellyImportResult,
} from "../shared/shelly.types.js";

export async function discoverShellyDevices(userId: string): Promise<ShellyDiscoveryResult> {
  const payload = await fetchShellyAllStatusWithRetry(userId);
  const normalized = normalizeShellyDiscoveryPayload(payload);
  const discoveredAt = new Date();
  const externalDeviceIds = normalized.devices.map((device) => device.externalDeviceId);

  const existingDevices = externalDeviceIds.length === 0
    ? []
    : await prisma.device.findMany({
      where: {
        userId,
        externalDeviceId: {
          in: externalDeviceIds,
        },
      },
      select: {
        id: true,
        homeId: true,
        externalDeviceId: true,
        vendor: true,
        displayName: true,
        status: true,
        dataSource: true,
      },
    });

  const existingByExternalId = new Map(
    existingDevices.map((device) => [device.externalDeviceId, device]),
  );

  const newDevices: ShellyDiscoveredDevice[] = [];
  const alreadyKnown: ShellyDiscoveryKnownDevice[] = [];

  for (const device of normalized.devices) {
    const known = existingByExternalId.get(device.externalDeviceId);
    if (known) {
      alreadyKnown.push({
        deviceId: known.id,
        homeId: known.homeId,
        externalDeviceId: known.externalDeviceId,
        vendor: known.vendor,
        displayName: known.displayName,
        status: known.status,
        dataSource: known.dataSource,
      });
      continue;
    }

    newDevices.push(device);
  }

  await setShellyIntegrationLastSync(userId, discoveredAt);

  return {
    discoveredAt,
    counts: {
      totalShelly: normalized.devices.length,
      new: newDevices.length,
      alreadyKnown: alreadyKnown.length,
      invalid: normalized.invalidEntries.length,
    },
    newDevices,
    alreadyKnown,
    invalidEntries: normalized.invalidEntries,
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function importShellyDevicesToHome(
  userId: string,
  homeId: string,
  input: ShellyImportDevicesBodyInput,
): Promise<ShellyImportResult> {
  const payload = await fetchShellyAllStatusWithRetry(userId);
  const normalized = normalizeShellyDiscoveryPayload(payload);
  const discoveredByExternalId = new Map(
    normalized.devices.map((device) => [device.externalDeviceId, device]),
  );

  const requestedExternalIds = input.devices.map((item) => item.externalDeviceId);
  const existingDevices = requestedExternalIds.length === 0
    ? []
    : await prisma.device.findMany({
      where: {
        userId,
        externalDeviceId: { in: requestedExternalIds },
      },
      select: {
        id: true,
        externalDeviceId: true,
      },
    });
  const existingByExternalId = new Map(existingDevices.map((device) => [device.externalDeviceId, device.id]));

  const created: ShellyImportResult["created"] = [];
  const skipped: ShellyImportResult["skipped"] = [];
  const errors: ShellyImportResult["errors"] = [];
  const seenInRequest = new Set<string>();

  for (const item of input.devices) {
    if (seenInRequest.has(item.externalDeviceId)) {
      skipped.push({
        externalDeviceId: item.externalDeviceId,
        reason: "DUPLICATED_IN_REQUEST",
      });
      continue;
    }
    seenInRequest.add(item.externalDeviceId);

    const discovered = discoveredByExternalId.get(item.externalDeviceId);
    if (!discovered) {
      skipped.push({
        externalDeviceId: item.externalDeviceId,
        reason: "NOT_FOUND_IN_SHELLY",
      });
      continue;
    }

    const existingDeviceId = existingByExternalId.get(item.externalDeviceId);
    if (existingDeviceId) {
      skipped.push({
        externalDeviceId: item.externalDeviceId,
        reason: "ALREADY_IMPORTED",
        existingDeviceId,
      });
      continue;
    }

    const now = new Date();
    const vendor = item.vendor ?? SHELLY_DEFAULT_VENDOR;
    const status = discovered.isOnline ? SHELLY_STATUS_ACTIVE : SHELLY_STATUS_DISABLED;
    const lastSeenAt = discovered.isOnline ? now : null;

    try {
      const device = await prisma.device.create({
        data: {
          homeId,
          userId,
          vendor,
          displayName: item.displayName,
          externalDeviceId: discovered.externalDeviceId,
          deviceCode: discovered.deviceCode,
          ipAddress: discovered.ipAddress,
          macAddress: discovered.macAddress,
          status,
          lastSeenAt,
          dataSource: SHELLY_DATA_SOURCE,
        },
        select: ownedDeviceContextSelect,
      });

      created.push(device);
      existingByExternalId.set(item.externalDeviceId, device.id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await prisma.device.findFirst({
          where: {
            userId,
            externalDeviceId: item.externalDeviceId,
          },
          select: {
            id: true,
          },
        });

        skipped.push({
          externalDeviceId: item.externalDeviceId,
          reason: "ALREADY_IMPORTED",
          ...(existing?.id ? { existingDeviceId: existing.id } : {}),
        });
        continue;
      }

      errors.push({
        externalDeviceId: item.externalDeviceId,
        reason: "INTERNAL_ERROR",
      });
    }
  }

  return {
    homeId,
    summary: {
      requested: input.devices.length,
      created: created.length,
      skipped: skipped.length,
      errors: errors.length,
    },
    created,
    skipped,
    errors,
  };
}
