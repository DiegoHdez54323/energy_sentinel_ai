import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { fetchShellyAllStatusWithRetry } from "../shared/shelly-all-status.js";
import type { ShellyPollingDebugRun } from "./shelly-polling-debug.js";
import {
  extractShellyRawDeviceEntries,
  getExternalDeviceIdFromRawEntry,
  normalizeSwitch0Reading,
} from "../shared/shelly-parsers.js";
import { setShellyIntegrationLastSync } from "../shared/shelly-integration.repository.js";
import type { ShellySwitch0Reading } from "../shared/shelly.types.js";

async function getLatestAenergyTotal(deviceId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ aenergy_total: Prisma.Decimal | string | number | null }>>`
    SELECT "aenergy_total"
    FROM "device_readings"
    WHERE "device_id" = ${deviceId}
    ORDER BY "ts" DESC
    LIMIT 1
  `;

  const latestRow = rows.at(0);
  if (!latestRow) {
    return null;
  }

  const value = latestRow.aenergy_total;
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return value instanceof Prisma.Decimal ? value.toNumber() : null;
}

async function insertDeviceReading(
  deviceId: string,
  reading: ShellySwitch0Reading,
): Promise<"inserted" | "duplicate"> {
  const previousAenergyTotal = await getLatestAenergyTotal(deviceId);

  const aenergyDelta = (
    reading.aenergyTotal !== null
    && previousAenergyTotal !== null
    && reading.aenergyTotal >= previousAenergyTotal
  )
    ? (reading.aenergyTotal - previousAenergyTotal)
    : null;

  const inserted = await prisma.$executeRaw`
    INSERT INTO "device_readings" (
      "device_id",
      "ts",
      "apower",
      "voltage",
      "current",
      "freq",
      "output",
      "aenergy_total",
      "aenergy_delta",
      "aenergy_minute_ts",
      "aenergy_by_minute",
      "ret_aenergy_total",
      "ret_aenergy_minute_ts",
      "ret_aenergy_by_minute",
      "temperature_tc",
      "temperature_tf",
      "source"
    ) VALUES (
      ${deviceId},
      ${reading.ts},
      ${reading.apower},
      ${reading.voltage},
      ${reading.current},
      ${reading.freq},
      ${reading.output},
      ${reading.aenergyTotal},
      ${aenergyDelta},
      ${reading.aenergyMinuteTs},
      ${reading.aenergyByMinute === null ? null : JSON.stringify(reading.aenergyByMinute)}::jsonb,
      ${reading.retAenergyTotal},
      ${reading.retAenergyMinuteTs},
      ${reading.retAenergyByMinute === null ? null : JSON.stringify(reading.retAenergyByMinute)}::jsonb,
      ${reading.temperatureTc},
      ${reading.temperatureTf},
      ${reading.source}
    )
    ON CONFLICT ("device_id", "ts") DO NOTHING
  `;

  return inserted > 0 ? "inserted" : "duplicate";
}

export async function pollShellyIntegrationReadings(
  userId: string,
  debugRun?: ShellyPollingDebugRun,
): Promise<{
  readingsInserted: number;
  readingsDuplicated: number;
  readingsSkipped: number;
}> {
  const startedAt = new Date();
  let payload: unknown = null;
  let rawEntriesCount = 0;
  let externalIds: string[] = [];
  let devices: Array<{ id: string; externalDeviceId: string }> = [];
  let error: unknown;
  let result = {
    readingsInserted: 0,
    readingsDuplicated: 0,
    readingsSkipped: 0,
  };

  try {
    payload = await fetchShellyAllStatusWithRetry(userId);
    const rawEntries = extractShellyRawDeviceEntries(payload);
    rawEntriesCount = rawEntries.length;

    const readingsByExternalId = new Map<string, ShellySwitch0Reading>();
    for (const entry of rawEntries) {
      const externalDeviceId = getExternalDeviceIdFromRawEntry(entry);
      if (!externalDeviceId || readingsByExternalId.has(externalDeviceId)) {
        continue;
      }

      const reading = normalizeSwitch0Reading(entry.raw);
      if (!reading) {
        continue;
      }

      readingsByExternalId.set(externalDeviceId, reading);
    }

    externalIds = [...readingsByExternalId.keys()];
    if (externalIds.length === 0) {
      await setShellyIntegrationLastSync(userId, new Date());
      return result;
    }

    devices = await prisma.device.findMany({
      where: {
        userId,
        externalDeviceId: {
          in: externalIds,
        },
      },
      select: {
        id: true,
        externalDeviceId: true,
      },
    });

    for (const device of devices) {
      const reading = readingsByExternalId.get(device.externalDeviceId);
      if (!reading) {
        result.readingsSkipped += 1;
        continue;
      }

      const insertResult = await insertDeviceReading(device.id, reading);
      if (insertResult === "inserted") {
        result.readingsInserted += 1;
      } else {
        result.readingsDuplicated += 1;
      }
    }

    if (devices.length < readingsByExternalId.size) {
      result.readingsSkipped += readingsByExternalId.size - devices.length;
    }

    await setShellyIntegrationLastSync(userId, new Date());

    return result;
  } catch (caughtError) {
    error = caughtError;
    throw caughtError;
  } finally {
    await debugRun?.writeIntegrationDump({
      userId,
      startedAt,
      finishedAt: new Date(),
      status: error ? "error" : "success",
      payload,
      rawEntriesCount,
      externalIds,
      devices,
      result,
      error,
    });
  }
}
