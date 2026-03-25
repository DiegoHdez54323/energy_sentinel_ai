export type DeviceUsageAggregationStats = {
  devicesProcessed: number;
  devicesFailed: number;
  hourlyRowsUpserted: number;
  dailyRowsUpserted: number;
  modelDevicesEvaluated: number;
  modelDevicesTrained: number;
  modelDevicesSkipped: number;
  modelDevicesFailed: number;
  featureRowsUpserted: number;
};
