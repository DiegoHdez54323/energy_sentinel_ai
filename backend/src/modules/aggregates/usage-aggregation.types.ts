export type DeviceUsageAggregationStats = {
  devicesProcessed: number;
  devicesFailed: number;
  hourlyRowsUpserted: number;
  dailyRowsUpserted: number;
  baselineDevicesEvaluated: number;
  baselineDevicesActivated: number;
  baselineDevicesSkipped: number;
  baselineDevicesFailed: number;
  baselineBucketsCreated: number;
};
