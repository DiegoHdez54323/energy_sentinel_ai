from __future__ import annotations

import base64
import pickle
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest

FEATURE_ORDER = [
    "apower",
    "aenergyDelta",
    "outputNumeric",
    "hourSin",
    "hourCos",
    "dayOfWeekSin",
    "dayOfWeekCos",
    "deltaPowerPrev",
    "rollingMeanPower5",
    "rollingStdPower5",
]

app = FastAPI(title="energy-sentinel-ml")


class TrainingRow(BaseModel):
    readingId: str
    ts: str
    localDate: str
    localHour: int = Field(ge=0, le=23)
    dayGroup: str
    apower: float | None = None
    aenergyDelta: float | None = None
    outputNumeric: float | None = None
    hourSin: float
    hourCos: float
    dayOfWeekSin: float
    dayOfWeekCos: float
    deltaPowerPrev: float | None = None
    rollingMeanPower5: float | None = None
    rollingStdPower5: float | None = None


class TrainRequest(BaseModel):
    deviceId: str
    modelType: str
    modelVersion: str
    featureSchemaVersion: str
    contamination: float = Field(gt=0, lt=0.5)
    trainingRows: list[TrainingRow]


class ScoreRequest(BaseModel):
    artifact: dict[str, Any]
    featureSchemaVersion: str
    featureVector: dict[str, Any]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/train")
def train(request: TrainRequest) -> dict[str, Any]:
    if not request.trainingRows:
      raise HTTPException(status_code=400, detail="trainingRows is required")

    matrix = np.array([row_to_vector(row.model_dump()) for row in request.trainingRows], dtype=float)

    model = IsolationForest(
        contamination=request.contamination,
        n_estimators=200,
        random_state=42,
    )
    model.fit(matrix)

    artifact = {
        "serialization": "pickle_base64",
        "payload": base64.b64encode(pickle.dumps(model)).decode("ascii"),
        "modelType": request.modelType,
        "modelVersion": request.modelVersion,
        "featureSchemaVersion": request.featureSchemaVersion,
    }

    return {
        "artifact": artifact,
        "summary": {
            "hourlyReference": build_hourly_reference(request.trainingRows),
        },
        "trainingSampleCount": len(request.trainingRows),
    }


@app.post("/score")
def score(request: ScoreRequest) -> dict[str, Any]:
    payload = request.artifact.get("payload")
    if not isinstance(payload, str):
        raise HTTPException(status_code=400, detail="artifact.payload is required")

    model = pickle.loads(base64.b64decode(payload.encode("ascii")))
    vector = np.array([row_to_vector(request.featureVector)], dtype=float)
    score_samples = model.score_samples(vector)
    decision_function = model.decision_function(vector)
    predictions = model.predict(vector)

    return {
        "score": float(score_samples[0]),
        "decisionFunction": float(decision_function[0]),
        "isAnomaly": bool(predictions[0] == -1),
    }


def row_to_vector(data: dict[str, Any]) -> list[float]:
    values: list[float] = []
    for key in FEATURE_ORDER:
        raw_value = data.get(key)
        values.append(0.0 if raw_value is None else float(raw_value))
    return values


def build_hourly_reference(rows: list[TrainingRow]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, int], list[float]] = {}
    for row in rows:
        if row.apower is None:
            continue
        grouped.setdefault((row.dayGroup, row.localHour), []).append(row.apower)

    references: list[dict[str, Any]] = []
    for (day_group, local_hour), values in sorted(grouped.items(), key=lambda item: (item[0][0], item[0][1])):
        references.append({
            "dayGroup": day_group,
            "localHour": local_hour,
            "expectedApower": float(np.median(np.array(values, dtype=float))),
        })

    return references
