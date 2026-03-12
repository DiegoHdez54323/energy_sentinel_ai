import { isIP } from "node:net";
import { SHELLY_DATA_SOURCE, SHELLY_DEFAULT_VENDOR } from "./shelly.constants.js";
import type {
  ShellyDiscoveredDevice,
  ShellyDiscoveryInvalidEntry,
  ShellyRawDeviceEntry,
  ShellySwitch0Reading,
} from "./shelly.types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getInteger(value: unknown): number | null {
  const numeric = getNumber(value);
  if (numeric === null) {
    return null;
  }

  const asInt = Math.trunc(numeric);
  return Number.isFinite(asInt) ? asInt : null;
}

function getBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function getNestedValue(record: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = record;
  for (const segment of path) {
    if (!isRecord(cursor) || !(segment in cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function getFirstString(record: Record<string, unknown>, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    const candidate = getString(value);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function getFirstBoolean(record: Record<string, unknown>, paths: string[][]): boolean | null {
  for (const path of paths) {
    const value = getNestedValue(record, path);
    const candidate = getBoolean(value);
    if (candidate !== null) {
      return candidate;
    }
  }
  return null;
}

function sanitizeIpAddress(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return isIP(value) > 0 ? value : null;
}

function sanitizeMacAddress(value: string | null): string | null {
  return value ?? null;
}

function looksLikeShellyDeviceRecord(record: Record<string, unknown>): boolean {
  return Boolean(
    getString(record.id)
    || getString(record.device_id)
    || getString(record.external_device_id)
    || getString(record.code)
    || getString(record.device_code)
    || getString(record.mac)
    || getNestedValue(record, ["_info"])
    || getNestedValue(record, ["info"])
    || getBoolean(record.online) !== null,
  );
}

export function getExternalDeviceIdFromRawEntry(entry: ShellyRawDeviceEntry): string | null {
  return (
    getFirstString(entry.raw, [["id"], ["external_device_id"], ["device_id"]])
    ?? getString(entry.keyHint)
  );
}

function normalizeShellyTs(record: Record<string, unknown>): Date {
  const ts = getNumber(getNestedValue(record, ["ts"]));
  if (ts !== null && ts > 0) {
    const millis = ts > 10_000_000_000 ? ts : ts * 1000;
    return new Date(millis);
  }

  const unixTs = getInteger(getNestedValue(record, ["sys", "unixtime"]));
  if (unixTs !== null && unixTs > 0) {
    return new Date(unixTs * 1000);
  }

  const updated = getString(getNestedValue(record, ["_updated"]));
  if (updated) {
    const parsed = new Date(updated.replace(" ", "T").concat("Z"));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function normalizeNumberArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const sanitized = value
    .map((item) => getNumber(item))
    .filter((item): item is number => item !== null);

  return sanitized.length > 0 ? sanitized : null;
}

export function normalizeSwitch0Reading(record: Record<string, unknown>): ShellySwitch0Reading | null {
  const switch0Value = getNestedValue(record, ["switch:0"]);
  if (!isRecord(switch0Value)) {
    return null;
  }

  const aenergy = isRecord(getNestedValue(switch0Value, ["aenergy"]))
    ? (getNestedValue(switch0Value, ["aenergy"]) as Record<string, unknown>)
    : null;
  const retAenergy = isRecord(getNestedValue(switch0Value, ["ret_aenergy"]))
    ? (getNestedValue(switch0Value, ["ret_aenergy"]) as Record<string, unknown>)
    : null;
  const temperature = isRecord(getNestedValue(switch0Value, ["temperature"]))
    ? (getNestedValue(switch0Value, ["temperature"]) as Record<string, unknown>)
    : null;

  return {
    ts: normalizeShellyTs(record),
    apower: getNumber(getNestedValue(switch0Value, ["apower"])),
    voltage: getNumber(getNestedValue(switch0Value, ["voltage"])),
    current: getNumber(getNestedValue(switch0Value, ["current"])),
    freq: getNumber(getNestedValue(switch0Value, ["freq"])),
    output: getBoolean(getNestedValue(switch0Value, ["output"])),
    aenergyTotal: aenergy ? getNumber(getNestedValue(aenergy, ["total"])) : null,
    aenergyMinuteTs: aenergy ? getInteger(getNestedValue(aenergy, ["minute_ts"])) : null,
    aenergyByMinute: aenergy ? normalizeNumberArray(getNestedValue(aenergy, ["by_minute"])) : null,
    retAenergyTotal: retAenergy ? getNumber(getNestedValue(retAenergy, ["total"])) : null,
    retAenergyMinuteTs: retAenergy ? getInteger(getNestedValue(retAenergy, ["minute_ts"])) : null,
    retAenergyByMinute: retAenergy ? normalizeNumberArray(getNestedValue(retAenergy, ["by_minute"])) : null,
    temperatureTc: temperature ? getNumber(getNestedValue(temperature, ["tC"])) : null,
    temperatureTf: temperature ? getNumber(getNestedValue(temperature, ["tF"])) : null,
    source: getString(getNestedValue(switch0Value, ["source"])) ?? SHELLY_DATA_SOURCE,
  };
}

export function extractShellyRawDeviceEntries(payload: unknown): ShellyRawDeviceEntry[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((value): value is Record<string, unknown> => isRecord(value))
      .map((raw) => ({ keyHint: null, raw }));
  }

  if (!isRecord(payload)) {
    return [];
  }

  const containerKeys = [
    "data",
    "devices",
    "all_status",
    "devices_status",
    "result",
    "results",
    "items",
  ] as const;

  for (const key of containerKeys) {
    if (key in payload) {
      const nested = extractShellyRawDeviceEntries(payload[key]);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  if (looksLikeShellyDeviceRecord(payload)) {
    return [{ keyHint: null, raw: payload }];
  }

  const entries: ShellyRawDeviceEntry[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (isRecord(value)) {
      entries.push({ keyHint: key, raw: value });
    }
  }
  return entries;
}

function normalizeShellyDeviceEntry(entry: ShellyRawDeviceEntry): ShellyDiscoveredDevice | ShellyDiscoveryInvalidEntry {
  const externalDeviceId = getExternalDeviceIdFromRawEntry(entry);

  if (!externalDeviceId) {
    return {
      key: entry.keyHint,
      reason: "MISSING_EXTERNAL_DEVICE_ID",
    };
  }

  const deviceCode = getFirstString(entry.raw, [["code"], ["device_code"]]);
  const macAddress = sanitizeMacAddress(
    getFirstString(entry.raw, [
      ["mac"],
      ["mac_address"],
      ["_info", "mac"],
      ["info", "mac"],
      ["sys", "mac"],
      ["wifi", "bssid"],
    ]),
  );
  const ipAddress = sanitizeIpAddress(
    getFirstString(entry.raw, [
      ["ip"],
      ["ip_address"],
      ["_info", "ip"],
      ["info", "ip"],
      ["wifi_sta", "ip"],
      ["wifi", "sta_ip"],
    ]),
  );
  const isOnline = getFirstBoolean(entry.raw, [
    ["online"],
    ["is_online"],
    ["_info", "online"],
    ["info", "online"],
    ["_dev_info", "online"],
    ["cloud", "connected"],
    ["ws", "connected"],
  ]) ?? false;
  const suggestedDisplayName = getFirstString(entry.raw, [["name"], ["_info", "name"], ["info", "name"]]);

  return {
    externalDeviceId,
    deviceCode,
    macAddress,
    ipAddress,
    isOnline,
    suggestedVendor: SHELLY_DEFAULT_VENDOR,
    suggestedDisplayName,
  };
}

export function normalizeShellyDiscoveryPayload(payload: unknown): {
  devices: ShellyDiscoveredDevice[];
  invalidEntries: ShellyDiscoveryInvalidEntry[];
} {
  const rawEntries = extractShellyRawDeviceEntries(payload);
  const normalizedByExternalId = new Map<string, ShellyDiscoveredDevice>();
  const invalidEntries: ShellyDiscoveryInvalidEntry[] = [];

  for (const entry of rawEntries) {
    const normalized = normalizeShellyDeviceEntry(entry);
    if ("reason" in normalized) {
      invalidEntries.push(normalized);
      continue;
    }

    if (!normalizedByExternalId.has(normalized.externalDeviceId)) {
      normalizedByExternalId.set(normalized.externalDeviceId, normalized);
    }
  }

  return {
    devices: [...normalizedByExternalId.values()],
    invalidEntries,
  };
}
