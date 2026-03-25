# ML Service

Servicio interno en Python para entrenamiento y scoring de anomalías con `IsolationForest`.

## Responsabilidad

- entrenar modelos a partir de `trainingRows`
- scorear un `featureVector` usando un modelo serializado
- no conectarse a Postgres
- no guardar estado persistente propio

El backend Node es quien:

- lee datos desde Postgres
- decide qué `device` entrenar
- guarda el modelo entrenado en `device_anomaly_models`
- recupera el modelo activo al scorear una lectura nueva

## Endpoints

- `GET /health`
- `POST /train`
- `POST /score`

## Levantar en local

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
set -a
source .env
set +a
uvicorn app.main:app --host "${ML_SERVICE_HOST:-0.0.0.0}" --port "${ML_SERVICE_PORT:-8000}" --log-level "${ML_SERVICE_LOG_LEVEL:-info}"
```

## Variables de entorno

- `ML_SERVICE_HOST`
- `ML_SERVICE_PORT`
- `ML_SERVICE_LOG_LEVEL`

## Cómo interactúa con el backend

### Entrenamiento

1. el backend construye `trainingRows` usando `device_readings` y `device_reading_features`
2. el backend llama `POST /train`
3. este servicio entrena un `IsolationForest`
4. devuelve el `artifact` serializado y un `summary`
5. el backend guarda el resultado en `device_anomaly_models`

### Scoring

1. el backend inserta una lectura nueva
2. el backend construye un `featureVector`
3. el backend recupera el `artifact` del modelo activo del device
4. el backend llama `POST /score`
5. este servicio deserializa el modelo y responde `score`, `decisionFunction` e `isAnomaly`

## Nota operativa

El modelo entrenado no se guarda como archivo `.pkl` en disco del servicio. Se serializa con `pickle`, se codifica en base64 y se persiste en Postgres dentro de `device_anomaly_models.artifact`.
