# Resultados del Modelo de Regresión Lineal

## Resumen

Este documento resume el experimento temporal de regresión lineal implementado en [`linear_regression.py`](./linear_regression.py).

El objetivo del modelo es explicar el consumo horario de energía de un solo device usando únicamente:

- La hora local del día
- El día de la semana

Este es un modelo base explicativo. Sirve para entender si el device tiene un patrón horario o semanal estable, pero no está diseñado como un modelo de predicción de alta precisión.

## Configuración de la corrida

Este resumen corresponde a la última ejecución almacenada en [`output/summary.json`](./output/summary.json).

- Device ID: `56dd593e-63b8-4d38-88a5-28d712e1a111`
- Nombre del device: `Monitor Cuarto`
- Zona horaria del home: `America/Mexico_City`
- Inicio del rango: `2026-03-12T08:00:00+00:00`
- Fin del rango: `2026-03-26T17:00:00+00:00`
- Horas esperadas: `345`
- Horas observadas: `314`
- Cobertura: `91.01%`

## Datos que usa el modelo

El script lee de la tabla `device_usage_hourly`, no de lecturas raw.

Para cada fila horaria, el modelo usa:

- `energy_wh`
  - Variable objetivo.
  - Es el consumo horario de energía en watt-hours.
- `local_hour`
  - Se extrae de `hour_ts` convertido a la zona horaria local del home.
  - Es un entero entre `0` y `23`.
- `day_of_week`
  - Se extrae del mismo timestamp local.
  - Sigue la convención de PostgreSQL: `0 = domingo`, `1 = lunes`, ..., `6 = sábado`.
- `samples_count`
  - No se usa como predictor, pero se excluyen filas con `samples_count <= 0`.

El script no usa:

- `apower` raw
- `aenergy_delta` raw
- Lags de horas anteriores
- Clima, ocupación, festivos ni variables externas

## Especificación del modelo

La regresión es un modelo OLS con esta fórmula conceptual:

```text
energy_wh ~ C(local_hour) + C(day_of_week)
```

Esto significa:

- El modelo estima un consumo horario base esperado.
- Después ajusta esa expectativa según la hora local.
- También la ajusta según el día de la semana.

La implementación usa variables dummy:

- `hour_1` a `hour_23`
- `dow_1` a `dow_6`

Categorías de referencia:

- `hour_0` es la hora base
- `dow_0` es el día base

Entonces:

- `const` es el consumo esperado para la combinación base
- Cada coeficiente de hora o día se interpreta respecto a esa base

## División train/test

El dataset se divide por tiempo, no aleatoriamente.

- Train: primeras `251` filas (`80%`)
- Test: últimas `63` filas (`20%`)

Esto es importante porque los datos son temporales. El modelo aprende con horas más antiguas y se evalúa con horas posteriores que no vio durante el entrenamiento.

## Resultados principales

Tomando como referencia [`output/summary.json`](./output/summary.json) y [`output/model_summary.txt`](./output/model_summary.txt):

- R² en train: `0.478`
- R² en test: `0.493`
- MAE en train: `7.62 Wh`
- MAE en test: `7.94 Wh`
- RMSE en train: `9.76 Wh`
- RMSE en test: `10.40 Wh`
- R² ajustado en train: `0.410`
- p-value global del F-test: `1.25e-18`

Interpretación:

- El modelo explica aproximadamente el `49%` de la variación horaria en el set de test.
- El error absoluto promedio en test es de aproximadamente `7.94 Wh` por hora.
- Las métricas de train y test son parecidas, lo que sugiere que no hay sobreajuste fuerte.
- El modelo es globalmente significativo, por lo que la hora del día y el día de la semana sí contienen señal real.

## Qué aprendió el modelo

### Patrón horario

El efecto más fuerte y más claro es la estacionalidad por hora.

Comparado con la hora base, el modelo estima un consumo significativamente menor durante la madrugada y primeras horas de la mañana:

- `hour_3`: `-10.68 Wh`
- `hour_4`: `-18.39 Wh`
- `hour_5`: `-20.55 Wh`
- `hour_6`: `-21.05 Wh`
- `hour_7`: `-21.63 Wh`
- `hour_8`: `-21.90 Wh`
- `hour_9`: `-21.43 Wh`
- `hour_10`: `-15.90 Wh`

Estos coeficientes tienen p-values bajos y muestran una ventana clara de menor consumo en la mañana temprana.

El consumo promedio observado por hora también alcanza sus valores más altos cerca de estas horas locales:

- Hora `13`: `38.89 Wh`
- Hora `12`: `38.28 Wh`
- Hora `23`: `37.55 Wh`
- Hora `0`: `37.43 Wh`
- Hora `22`: `36.08 Wh`

### Patrón por día de la semana

Algunos efectos por día también parecen relevantes:

- `dow_2`: `-7.39 Wh`, significativo
- `dow_4`: `-5.87 Wh`, significativo
- `dow_5`: `-4.81 Wh`, significativo
- `dow_6`: `+4.32 Wh`, significancia marginal

Esto sugiere que el device podría tener menor consumo promedio en algunos días de la semana y un consumo algo mayor en sábado.

Consumo promedio observado por día de la semana:

- `dow_0`: `30.98 Wh`
- `dow_1`: `33.96 Wh`
- `dow_2`: `23.41 Wh`
- `dow_3`: `30.40 Wh`
- `dow_4`: `20.72 Wh`
- `dow_5`: `24.95 Wh`
- `dow_6`: `34.07 Wh`

## Comportamiento del error

El modelo captura el patrón promedio, pero no todas las desviaciones horarias.

Mayor subestimación encontrada:

- Timestamp: `2026-03-26T01:00:00Z`
- Observado: `59.666 Wh`
- Predicho: `32.880 Wh`
- Residual: `+26.786 Wh`

Mayor sobreestimación encontrada:

- Timestamp: `2026-03-14T03:00:00Z`
- Observado: `0.000 Wh`
- Predicho: `29.127 Wh`
- Residual: `-29.127 Wh`

Esto es esperable en un modelo lineal simple que solo usa variables de calendario:

- Reproduce razonablemente bien el patrón promedio
- No captura bien picos o caídas puntuales

## Notas estadísticas

Tomando como referencia [`output/model_summary.txt`](./output/model_summary.txt):

- `Prob(F-statistic) = 1.25e-18`
  - El modelo completo es estadísticamente significativo.
- `Durbin-Watson = 0.542`
  - Los residuos muestran autocorrelación temporal.
  - En términos prácticos, todavía queda estructura temporal no explicada por el modelo.
- `Cond. No. = 27.2`
  - No hay una señal obvia de inestabilidad numérica severa.

El valor bajo de Durbin-Watson sugiere que, si se quisiera mejorar la capacidad predictiva, el siguiente paso probablemente sería agregar:

- Variables lag de consumo
- Medias móviles
- Más contexto operativo

## Cómo leer los archivos de salida

- [`output/model_summary.txt`](./output/model_summary.txt)
  - Salida estadística completa de `statsmodels`.
  - Es el archivo más útil para interpretar coeficientes y significancia.
- [`output/predictions.csv`](./output/predictions.csv)
  - Una fila por hora con valor observado, valor predicho, residual y split.
- [`output/summary.json`](./output/summary.json)
  - Resumen estructurado de la corrida.
- [`output/observed_vs_predicted.png`](./output/observed_vs_predicted.png)
  - Comparación de la serie completa observada contra la predicha.
- [`output/residuals_over_time.png`](./output/residuals_over_time.png)
  - Evolución del error en el tiempo.
- [`output/hourly_profile.png`](./output/hourly_profile.png)
  - Perfil promedio de consumo por hora del día.

## Conclusión

Esta corrida muestra que el device sí tiene un patrón real y medible de consumo horario y semanal.

El modelo es útil como una línea base explicativa simple porque:

- Captura bien la forma general diaria del consumo
- Se mantiene estable entre train y test
- Produce coeficientes interpretables

Las principales limitaciones son:

- Solo explica alrededor de la mitad de la variabilidad horaria
- No captura bien picos o caídas específicas
- Los residuos todavía muestran estructura temporal

En resumen: es una primera regresión sólida para análisis rápido y explicación del patrón de consumo, pero todavía no es un modelo de predicción fina por hora.
