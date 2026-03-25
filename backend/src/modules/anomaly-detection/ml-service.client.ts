import { env } from "../../config/env.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type {
  MlScoringResult,
  MlTrainingResponse,
} from "./anomaly-detection.types.js";

type MlClientOptions = {
  enabled?: boolean;
  baseUrl?: string;
  scoreTimeoutMs?: number;
  trainTimeoutMs?: number;
};

type TrainPayload = {
  deviceId: string;
  modelType: string;
  modelVersion: string;
  featureSchemaVersion: string;
  contamination: number;
  trainingRows: Array<Record<string, number | string | null>>;
};

type ScorePayload = {
  artifact: unknown;
  featureSchemaVersion: string;
  featureVector: Record<string, number | string | null>;
};

export async function trainIsolationForestModel(
  payload: TrainPayload,
  options?: MlClientOptions,
): Promise<MlTrainingResponse> {
  const response = await postJson("/train", payload, options?.trainTimeoutMs ?? env.ML_TRAIN_TIMEOUT_MS, options);

  return {
    artifact: response.artifact as Prisma.InputJsonValue,
    summary: (response.summary ?? null) as Prisma.InputJsonValue | null,
    trainingSampleCount: Number(response.trainingSampleCount ?? payload.trainingRows.length),
  };
}

export async function scoreIsolationForestReading(
  payload: ScorePayload,
  options?: MlClientOptions,
): Promise<MlScoringResult> {
  const response = await postJson("/score", payload, options?.scoreTimeoutMs ?? env.ML_SCORE_TIMEOUT_MS, options);

  return {
    score: Number(response.score),
    isAnomaly: Boolean(response.isAnomaly),
    decisionFunction: response.decisionFunction === null || response.decisionFunction === undefined
      ? null
      : Number(response.decisionFunction),
  };
}

async function postJson(
  path: string,
  body: unknown,
  timeoutMs: number,
  options?: MlClientOptions,
): Promise<Record<string, unknown>> {
  const enabled = options?.enabled ?? env.ML_ENABLED;
  if (!enabled) {
    throw new Error("ML is disabled");
  }

  const baseUrl = options?.baseUrl ?? env.ML_SERVICE_BASE_URL;
  if (!baseUrl) {
    throw new Error("ML_SERVICE_BASE_URL is not configured");
  }

  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof responseBody.error === "string"
      ? responseBody.error
      : `ML service request failed with status ${response.status}`;
    throw new Error(message);
  }

  return responseBody;
}
