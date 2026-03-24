export const DEVICE_BASELINE_METRIC = "energy_wh";
export const DEVICE_BASELINE_GRANULARITY = "hourly_local";
export const DEVICE_BASELINE_PROFILE_SHAPE = "weekday_weekend_hour";
export const DEVICE_BASELINE_MODEL_VERSION = "energy-hourly-local-v1";

export const DEVICE_BASELINE_DAY_GROUPS = ["weekday", "weekend"] as const;

export type DeviceBaselineDayGroup = (typeof DEVICE_BASELINE_DAY_GROUPS)[number];

export type DeviceBaselineBucketInput = {
  dayGroup: DeviceBaselineDayGroup;
  localHour: number;
  sampleCount: number;
  expectedEnergyWh: number;
  lowerBoundEnergyWh: number;
  upperBoundEnergyWh: number;
};

export type DeviceBaselineRefreshResult =
  | { status: "disabled" | "up_to_date" | "insufficient_history" | "insufficient_samples"; bucketsCreated: 0 }
  | { status: "activated"; bucketsCreated: number };
