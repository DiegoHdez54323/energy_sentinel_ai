#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

os.environ.setdefault("MPLCONFIGDIR", "/tmp/matplotlib-cache-energy-sentinel")

import matplotlib
import numpy as np
import pandas as pd
import psycopg
import statsmodels.api as sm

matplotlib.use("Agg")

import matplotlib.pyplot as plt


DEFAULT_BACKEND_ENV = "/home/diego/code/energy-sentinel-ai/backend/.env"
DEFAULT_OUT_DIR = "/home/diego/code/energy-sentinel-ai/tmp/regression-linear/output"
MIN_OBSERVATIONS = 72


class RegressionError(Exception):
    pass


@dataclass
class DeviceContext:
    device_id: str
    home_id: str
    timezone: str
    display_name: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a temporary OLS regression over hourly energy usage for a single device.",
    )
    parser.add_argument("--device-id", required=True, help="UUID of the device to analyze.")
    parser.add_argument("--from", dest="from_ts", required=True, help="Inclusive ISO timestamp.")
    parser.add_argument("--to", dest="to_ts", required=True, help="Exclusive ISO timestamp.")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="Directory for result files.")
    parser.add_argument(
        "--backend-env",
        default=DEFAULT_BACKEND_ENV,
        help="Path to the backend .env file containing DATABASE_URL.",
    )
    return parser.parse_args()


def parse_iso_datetime(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise RegressionError(f"Invalid ISO timestamp: {value}") from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def parse_dotenv(path: Path) -> dict[str, str]:
    if not path.exists():
        raise RegressionError(f"Backend env file not found: {path}")

    env: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith(("'", '"')) and value.endswith(("'", '"')) and len(value) >= 2:
            value = value[1:-1]
        env[key] = value
    return env


def get_database_url(env_path: Path) -> str:
    env_values = parse_dotenv(env_path)
    database_url = env_values.get("DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        raise RegressionError(f"DATABASE_URL not found in {env_path}")
    return database_url


def fetch_device_context(conn: psycopg.Connection[Any], device_id: str) -> DeviceContext:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              d.id,
              d.home_id,
              h.timezone,
              d.display_name
            FROM devices d
            JOIN homes h ON h.id = d.home_id
            WHERE d.id = %s
            """,
            (device_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise RegressionError(f"Device not found: {device_id}")

    return DeviceContext(
        device_id=str(row[0]),
        home_id=str(row[1]),
        timezone=str(row[2]),
        display_name=str(row[3]),
    )


def fetch_hourly_usage(
    conn: psycopg.Connection[Any],
    device: DeviceContext,
    from_ts: datetime,
    to_ts: datetime,
) -> pd.DataFrame:
    query = """
        SELECT
          du.hour_ts AS ts_utc,
          (du.hour_ts AT TIME ZONE h.timezone) AS ts_local,
          EXTRACT(HOUR FROM (du.hour_ts AT TIME ZONE h.timezone))::int AS local_hour,
          EXTRACT(DOW FROM (du.hour_ts AT TIME ZONE h.timezone))::int AS day_of_week,
          du.energy_wh::double precision AS energy_wh,
          du.samples_count::int AS samples_count
        FROM device_usage_hourly du
        JOIN devices d ON d.id = du.device_id
        JOIN homes h ON h.id = d.home_id
        WHERE du.device_id = %s
          AND du.hour_ts >= %s
          AND du.hour_ts < %s
          AND du.samples_count > 0
        ORDER BY du.hour_ts ASC
    """
    with conn.cursor() as cur:
        cur.execute(query, (device.device_id, from_ts, to_ts))
        rows = cur.fetchall()
        columns = [column.name for column in cur.description]

    df = pd.DataFrame(rows, columns=columns)
    if df.empty:
        raise RegressionError("No hourly aggregate data found in the requested range.")
    return df


def compute_expected_hours(from_ts: datetime, to_ts: datetime) -> int:
    total_hours = (to_ts - from_ts).total_seconds() / 3600
    return max(1, math.ceil(total_hours))


def build_design_matrix(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, list[str]]:
    feature_df = pd.DataFrame(index=df.index)
    feature_df["local_hour"] = df["local_hour"].astype("category")
    feature_df["day_of_week"] = df["day_of_week"].astype("category")

    dummies = pd.get_dummies(
        feature_df,
        columns=["local_hour", "day_of_week"],
        prefix=["hour", "dow"],
        drop_first=True,
        dtype=float,
    )
    dummies = sm.add_constant(dummies, has_constant="add")
    y = df["energy_wh"].astype(float)
    feature_columns = list(dummies.columns)
    return dummies, y, feature_columns


def temporal_train_test_split(
    X: pd.DataFrame,
    y: pd.Series,
    original: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, pd.DataFrame, pd.DataFrame]:
    train_size = int(len(X) * 0.8)
    train_size = max(1, min(train_size, len(X) - 1))

    X_train = X.iloc[:train_size].copy()
    X_test = X.iloc[train_size:].copy()
    y_train = y.iloc[:train_size].copy()
    y_test = y.iloc[train_size:].copy()
    df_train = original.iloc[:train_size].copy()
    df_test = original.iloc[train_size:].copy()
    return X_train, X_test, y_train, y_test, df_train, df_test


def compute_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    residuals = actual - predicted
    mae = float(np.mean(np.abs(residuals)))
    rmse = float(np.sqrt(np.mean(np.square(residuals))))
    ss_res = float(np.sum(np.square(residuals)))
    ss_tot = float(np.sum(np.square(actual - np.mean(actual))))
    r_squared = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    return {
        "mae": mae,
        "rmse": rmse,
        "r_squared": r_squared,
    }


def create_predictions_frame(
    df: pd.DataFrame,
    predicted: np.ndarray,
    split_name: str,
) -> pd.DataFrame:
    output = df.copy()
    output["predicted_energy_wh"] = predicted
    output["residual"] = output["energy_wh"].astype(float) - output["predicted_energy_wh"]
    output["split"] = split_name
    return output[
        [
            "ts_utc",
            "ts_local",
            "local_hour",
            "day_of_week",
            "energy_wh",
            "predicted_energy_wh",
            "residual",
            "samples_count",
            "split",
        ]
    ]


def summarize_coefficients(model: Any) -> dict[str, dict[str, float]]:
    conf_int = model.conf_int()
    coefficients: dict[str, dict[str, float]] = {}
    for name in model.params.index:
        coefficients[name] = {
            "coefficient": float(model.params[name]),
            "p_value": float(model.pvalues[name]),
            "ci_lower": float(conf_int.loc[name, 0]),
            "ci_upper": float(conf_int.loc[name, 1]),
        }
    return coefficients


def create_visualizations(
    predictions: pd.DataFrame,
    out_dir: Path,
    device: DeviceContext,
    test_metrics: dict[str, float],
) -> dict[str, str]:
    plot_df = predictions.copy()
    plot_df["ts_utc"] = pd.to_datetime(plot_df["ts_utc"], utc=True)
    split_boundary = plot_df.loc[plot_df["split"] == "test", "ts_utc"].min()

    observed_vs_predicted_path = out_dir / "observed_vs_predicted.png"
    residuals_path = out_dir / "residuals_over_time.png"
    hourly_profile_path = out_dir / "hourly_profile.png"

    fig, ax = plt.subplots(figsize=(14, 6))
    ax.plot(plot_df["ts_utc"], plot_df["energy_wh"], label="Observed", color="#1f2937", linewidth=1.7)
    ax.plot(
        plot_df["ts_utc"],
        plot_df["predicted_energy_wh"],
        label="Predicted",
        color="#2563eb",
        linewidth=1.5,
        alpha=0.9,
    )
    if pd.notna(split_boundary):
        ax.axvline(split_boundary, color="#dc2626", linestyle="--", linewidth=1.2, label="Test split")
    ax.set_title(
        f"Observed vs Predicted Hourly Energy\n{device.display_name} | "
        f"test R²={test_metrics['r_squared']:.3f}, RMSE={test_metrics['rmse']:.2f}",
    )
    ax.set_xlabel("Timestamp (UTC)")
    ax.set_ylabel("Energy (Wh)")
    ax.grid(alpha=0.25)
    ax.legend()
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(observed_vs_predicted_path, dpi=160)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(14, 4.5))
    point_colors = np.where(plot_df["split"].eq("test"), "#dc2626", "#6b7280")
    ax.scatter(plot_df["ts_utc"], plot_df["residual"], c=point_colors, s=18, alpha=0.8)
    ax.axhline(0, color="#111827", linewidth=1.0)
    if pd.notna(split_boundary):
        ax.axvline(split_boundary, color="#dc2626", linestyle="--", linewidth=1.2)
    ax.set_title("Residuals Over Time")
    ax.set_xlabel("Timestamp (UTC)")
    ax.set_ylabel("Observed - Predicted (Wh)")
    ax.grid(alpha=0.25)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(residuals_path, dpi=160)
    plt.close(fig)

    hourly_profile = (
        plot_df.groupby("local_hour", as_index=False)[["energy_wh", "predicted_energy_wh"]]
        .mean()
        .sort_values("local_hour")
    )
    fig, ax = plt.subplots(figsize=(11, 5))
    ax.plot(
        hourly_profile["local_hour"],
        hourly_profile["energy_wh"],
        marker="o",
        color="#111827",
        linewidth=1.8,
        label="Observed average",
    )
    ax.plot(
        hourly_profile["local_hour"],
        hourly_profile["predicted_energy_wh"],
        marker="o",
        color="#059669",
        linewidth=1.8,
        label="Predicted average",
    )
    ax.set_title("Average Hourly Profile")
    ax.set_xlabel("Local hour")
    ax.set_ylabel("Energy (Wh)")
    ax.set_xticks(range(24))
    ax.grid(alpha=0.25)
    ax.legend()
    fig.tight_layout()
    fig.savefig(hourly_profile_path, dpi=160)
    plt.close(fig)

    return {
        "observed_vs_predicted_png": observed_vs_predicted_path.name,
        "residuals_over_time_png": residuals_path.name,
        "hourly_profile_png": hourly_profile_path.name,
    }


def to_jsonable_summary(
    device: DeviceContext,
    from_ts: datetime,
    to_ts: datetime,
    df: pd.DataFrame,
    train_rows: int,
    test_rows: int,
    expected_hours: int,
    model: Any,
    train_metrics: dict[str, float],
    test_metrics: dict[str, float],
    feature_columns: list[str],
) -> dict[str, Any]:
    observed_hours = len(df)
    coverage = observed_hours / expected_hours if expected_hours else 0.0
    return {
        "device": {
            "id": device.device_id,
            "display_name": device.display_name,
            "home_id": device.home_id,
            "timezone": device.timezone,
        },
        "range": {
            "from": from_ts.isoformat(),
            "to": to_ts.isoformat(),
            "expected_hours": expected_hours,
            "observed_hours": observed_hours,
            "coverage_ratio": coverage,
            "coverage_percent": coverage * 100,
        },
        "dataset": {
            "rows_used": observed_hours,
            "rows_discarded": 0,
            "train_rows": train_rows,
            "test_rows": test_rows,
            "min_observations_required": MIN_OBSERVATIONS,
            "ts_utc_min": str(df["ts_utc"].min()),
            "ts_utc_max": str(df["ts_utc"].max()),
        },
        "model": {
            "type": "OLS",
            "formula": "energy_wh ~ C(local_hour) + C(day_of_week)",
            "features": feature_columns,
            "aic": float(model.aic),
            "bic": float(model.bic),
            "adj_r_squared_train": float(model.rsquared_adj),
            "f_statistic": float(model.fvalue) if model.fvalue is not None else None,
            "f_pvalue": float(model.f_pvalue) if model.f_pvalue is not None else None,
            "coefficients": summarize_coefficients(model),
        },
        "metrics": {
            "train": train_metrics,
            "test": test_metrics,
        },
    }


def ensure_valid_range(from_ts: datetime, to_ts: datetime) -> None:
    if to_ts <= from_ts:
        raise RegressionError("--to must be greater than --from")


def ensure_minimum_observations(df: pd.DataFrame) -> None:
    if len(df) < MIN_OBSERVATIONS:
        raise RegressionError(
            f"At least {MIN_OBSERVATIONS} hourly observations are required; found {len(df)}.",
        )


def main() -> int:
    args = parse_args()
    from_ts = parse_iso_datetime(args.from_ts)
    to_ts = parse_iso_datetime(args.to_ts)
    ensure_valid_range(from_ts, to_ts)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    backend_env_path = Path(args.backend_env)
    database_url = get_database_url(backend_env_path)

    with psycopg.connect(database_url) as conn:
        device = fetch_device_context(conn, args.device_id)
        df = fetch_hourly_usage(conn, device, from_ts, to_ts)

    ensure_minimum_observations(df)

    expected_hours = compute_expected_hours(from_ts, to_ts)
    X, y, feature_columns = build_design_matrix(df)
    X_train, X_test, y_train, y_test, df_train, df_test = temporal_train_test_split(X, y, df)

    model = sm.OLS(y_train, X_train).fit()

    train_pred = np.asarray(model.predict(X_train), dtype=float)
    test_pred = np.asarray(model.predict(X_test), dtype=float)

    train_metrics = compute_metrics(y_train.to_numpy(dtype=float), train_pred)
    test_metrics = compute_metrics(y_test.to_numpy(dtype=float), test_pred)

    predictions = pd.concat(
        [
            create_predictions_frame(df_train, train_pred, "train"),
            create_predictions_frame(df_test, test_pred, "test"),
        ],
        ignore_index=True,
    )
    predictions["ts_utc"] = pd.to_datetime(predictions["ts_utc"], utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    predictions["ts_local"] = pd.to_datetime(predictions["ts_local"]).dt.strftime("%Y-%m-%d %H:%M:%S")

    summary = to_jsonable_summary(
        device=device,
        from_ts=from_ts,
        to_ts=to_ts,
        df=df,
        train_rows=len(df_train),
        test_rows=len(df_test),
        expected_hours=expected_hours,
        model=model,
        train_metrics=train_metrics,
        test_metrics=test_metrics,
        feature_columns=feature_columns,
    )

    plot_artifacts = create_visualizations(
        predictions=predictions,
        out_dir=out_dir,
        device=device,
        test_metrics=test_metrics,
    )
    summary["artifacts"] = {
        "summary_json": "summary.json",
        "predictions_csv": "predictions.csv",
        "model_summary_txt": "model_summary.txt",
        "plots": plot_artifacts,
    }

    summary_path = out_dir / "summary.json"
    predictions_path = out_dir / "predictions.csv"
    model_summary_path = out_dir / "model_summary.txt"

    csv_predictions = predictions.copy()
    csv_predictions["ts_utc"] = pd.to_datetime(csv_predictions["ts_utc"], utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    csv_predictions["ts_local"] = pd.to_datetime(csv_predictions["ts_local"]).dt.strftime("%Y-%m-%d %H:%M:%S")

    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    csv_predictions.to_csv(predictions_path, index=False)
    model_summary_path.write_text(model.summary().as_text(), encoding="utf-8")

    print(
        json.dumps(
            {
                "deviceId": device.device_id,
                "displayName": device.display_name,
                "timezone": device.timezone,
                "rowsUsed": len(df),
                "coveragePercent": round(summary["range"]["coverage_percent"], 2),
                "trainRows": len(df_train),
                "testRows": len(df_test),
                "testMetrics": test_metrics,
                "plots": plot_artifacts,
                "outDir": str(out_dir),
            },
            indent=2,
        ),
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RegressionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
