#!/usr/bin/env python3
"""Build the Trade-in pricing recommendation and MCP report payload."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = ROOT / "analysis" / "trade-in-pricing-2026-08-29"
DOC_PATH = ROOT / "docs" / "trade-in-pricing-recommendation-2026-08-29.md"
ARTIFACT_PATH = ANALYSIS_DIR / "artifact.json"
SQLITE_PATH = ANALYSIS_DIR / "pricing_analysis.sqlite"
GENERATED_AT = "2026-08-29T18:00:00+03:00"


def rub(value: float | int) -> str:
    return f"{int(value):,}".replace(",", " ") + " ₽"


matrix = pd.read_csv(ANALYSIS_DIR / "recommended_matrix.csv")
sources = pd.read_csv(ANALYSIS_DIR / "source_observations.csv")
data = matrix.merge(
    sources[["model_slug", "storage", "restore_max", "opt_price", "spot_median", "spot_count", "spot_notes"]],
    on=["model_slug", "storage"],
    how="left",
    validate="one_to_one",
)

changed = int((data["max_change"] != 0).sum())
unchanged = int((data["max_change"] == 0).sum())
low_confidence = int((data["source_confidence"] == "low").sum())
largest_reduction = int(abs(data["max_change"].min()))
min_headroom = float(data["headroom_pct"].min())

table_lines = [
    "| Модель | Память | Текущий draft | Рекомендация | Изменение max | Запас до ориентира | Уверенность |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
]
for row in data.itertuples(index=False):
    confidence = {"high": "высокая", "medium": "средняя", "low": "низкая"}[row.source_confidence]
    change = "без изменений" if row.max_change == 0 else f"−{rub(abs(row.max_change))}"
    table_lines.append(
        f"| {row.model} | {row.storage} | {rub(row.current_min)}–{rub(row.current_max)} | "
        f"{rub(row.recommended_min)}–{rub(row.recommended_max)} | {change} | {row.headroom_pct:.1f}% | {confidence} |"
    )

report = f"""# Trade-in ISVOI: рекомендованная ценовая матрица

Дата среза: 29 августа 2026 года. Статус: загружено в Directus как `trade-pricing-v2-draft`; не опубликовано, калькулятор выключен.

## Executive Summary

Рекомендуется заменить текущую ценовую гипотезу на более консервативную матрицу ниже. Из 19 конфигураций изменяются **{changed}**, ещё **{unchanged}** остаются без изменений. Минимальный расчётный запас между верхней границей выкупа и консервативным рыночным ориентиром — **{min_headroom:.1f}%** до расходов на диагностику, подготовку, гарантию, налоги и снижение цены.

Наибольший риск в текущем draft — **iPhone 16 Pro Max 1 ТБ**: верхняя оценка 74 500 ₽ почти совпадает с найденной акционной розничной карточкой 74 990 ₽. Рекомендуемая верхняя граница — **56 000 ₽**, то есть снижение на **18 500 ₽**. Для iPhone 14 Pro Max 128/256/512 ГБ верхние границы снижаются на 4 000/5 500/7 000 ₽ соответственно.

Матрицу можно использовать как `draft v2` и основу десяти контрольных расчётов. Публиковать её нельзя, пока Trade Desk не подтвердит фактические расходы и не дополнит выборку по {low_confidence} конфигурациям с низкой уверенностью.

## Методика

Для каждой конфигурации собраны три типа ориентиров:

- публичный максимум Trade-in re:Store;
- цена Opt-Express для б/у устройства в заявленном идеальном состоянии без комплекта;
- медиана низких актуальных розничных карточек по конкретной конфигурации, когда выборка доступна.

Консервативный рыночный ориентир — минимум между Opt-Express и розничной медианой. Формула:

```text
market_anchor = min(opt_price, spot_retail_median)
recommended_max = floor500(min(reStore_max, market_anchor × 0.75))
recommended_min = floor500(recommended_max × 0.90)
```

Коэффициент 75% не является расчётом чистой маржи. Это защитный потолок, оставляющий минимум 25% валового пространства до расходов и возможного снижения цены.

## Рекомендованная матрица

{chr(10).join(table_lines)}

## Что изменилось

- Сохраняются без изменений все четыре конфигурации iPhone 13 Pro, а также iPhone 14 Pro 512 ГБ и iPhone 16 Pro 512 ГБ.
- Самая заметная системная коррекция приходится на iPhone 14 Pro Max: низкая розница по 128–512 ГБ оказалась ближе к текущей верхней оценке, чем предполагал исходный бенчмарк.
- iPhone 16 Pro Max 256/512 ГБ получают верхние границы 50 000/55 000 ₽; это снижает риск закупки при наличии предложений около 63 890–73 400 ₽.
- iPhone 16 Pro Max 1 ТБ получает 50 000–56 000 ₽. Уверенность низкая: решение опирается на одну акционную карточку и требует повторной сверки до публикации.

## Качество данных

- Полнота конфигураций: 19 из 19 имеют re:Store и Opt-Express ориентиры.
- Прямая розничная выборка доступна для 9 из 19 конфигураций; 10 конфигураций помечены низкой уверенностью.
- Источники различаются по состоянию, батарее, комплекту, гарантии, региону и условиям оплаты. Эти различия не нормализованы.
- В данных нет фактических расходов ISVOI, скорости продажи, возвратов и гарантийных обращений. Поэтому результат годится для draft и теста, но не доказывает коммерческую прибыльность.

## Рекомендуемые следующие шаги

1. Trade Desk подтверждает целевой валовой запас и фиксированные расходы на одно устройство.
2. Для 10 конфигураций с низкой уверенностью собираются минимум три свежие карточки по памяти и состоянию.
3. Проводятся десять контрольных расчётов на реальных устройствах с известной финальной ценой после диагностики.
4. После подтверждения создаётся новая версия `trade-pricing-v2-draft`; текущая версия не перезаписывается.
5. Даже после загрузки draft калькулятор и публичная pricing version остаются выключены до отдельного решения.

## Источники

- [re:Store Trade-in](https://re-store.ru/promo/trade-in/) — публичные максимумы оценки, зафиксированные в исходном бенчмарке проекта.
- [Opt-Express: б/у Apple](https://opt-express.ru/catalog/smartfony/b-u/apple/) — единый ценовой ряд по всем 19 конфигурациям; страница указывала обновление 26 августа 2026 года.
- [BestPhone: iPhone 13 Pro](https://www.bestphone.ru/catalog/b_u_iphone_13_pro/filter/clear/apply/), [14 Pro Max](https://bestphone.ru/catalog/b_u_iphone_14_pro_max/) и [16 Pro Max](https://bestphone.ru/catalog/b_u_iphone_16_pro_max/) — актуальные карточки низкого розничного сегмента.
- [Mobile Outlet: iPhone 14 Pro](https://mobile-outlet.ru/collection/iphone-14-pro-bu) — розничные карточки 128/256 ГБ.
- [Mobilo4ka: iPhone 16 Pro 256 ГБ](https://moskva.mobilo4ka.ru/bu-tehnika/apple-bu/iphone-bu/iphone-16-pro-bu/256gb/) — одна актуальная карточка.
- [AppZone: iPhone 16 Pro Max 1 ТБ](https://appzone.store/catalog/iphone-b-u/iphone-16-pro-max-b-u/apple-iphone-16-pro-max-1tb-chernyy-titan-b-u/) — одна акционная карточка, использована как консервативный риск-ориентир.

Воспроизводимый расчёт: `analysis/trade-in-pricing-2026-08-29/trade_in_pricing_analysis.ipynb`. Исходные наблюдения и итоговая CSV находятся в той же папке.
"""
DOC_PATH.write_text(report, encoding="utf-8")

summary_rows = [{
    "configurations": 19,
    "changed_configurations": changed,
    "unchanged_configurations": unchanged,
    "largest_reduction_rub": largest_reduction,
    "minimum_headroom_pct": min_headroom,
    "low_confidence_configurations": low_confidence,
}]

chart_rows = []
table_rows = []
for row in data.itertuples(index=False):
    configuration = f"{row.model} {row.storage}"
    chart_rows.extend([
        {"configuration": configuration, "series": "Текущий draft", "price": int(row.current_max)},
        {"configuration": configuration, "series": "Рекомендация", "price": int(row.recommended_max)},
    ])
    table_rows.append({
        "model": row.model,
        "storage": row.storage,
        "current_min": int(row.current_min),
        "current_max": int(row.current_max),
        "recommended_min": int(row.recommended_min),
        "recommended_max": int(row.recommended_max),
        "max_change": int(row.max_change),
        "headroom_pct": float(row.headroom_pct),
        "confidence": {"high": "Высокая", "medium": "Средняя", "low": "Низкая"}[row.source_confidence],
    })

chart_sql = "SELECT configuration, series, price FROM pricing_comparison ORDER BY sort_order, series"
table_sql = (
    "SELECT model, storage, current_min, current_max, recommended_min, recommended_max, "
    "max_change, headroom_pct, confidence FROM pricing_matrix ORDER BY recommended_max DESC"
)

with sqlite3.connect(SQLITE_PATH) as connection:
    connection.execute("DROP TABLE IF EXISTS pricing_comparison")
    connection.execute("DROP TABLE IF EXISTS pricing_matrix")
    connection.execute(
        "CREATE TABLE pricing_comparison (configuration TEXT, series TEXT, price INTEGER, sort_order INTEGER)"
    )
    connection.execute(
        "CREATE TABLE pricing_matrix (model TEXT, storage TEXT, current_min INTEGER, current_max INTEGER, "
        "recommended_min INTEGER, recommended_max INTEGER, max_change INTEGER, headroom_pct REAL, confidence TEXT)"
    )
    comparison_values = []
    for sort_order, row in enumerate(data.itertuples(index=False), start=1):
        configuration = f"{row.model} {row.storage}"
        comparison_values.extend([
            (configuration, "Текущий draft", int(row.current_max), sort_order),
            (configuration, "Рекомендация", int(row.recommended_max), sort_order),
        ])
    connection.executemany("INSERT INTO pricing_comparison VALUES (?, ?, ?, ?)", comparison_values)
    connection.executemany(
        "INSERT INTO pricing_matrix VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            (
                row["model"], row["storage"], row["current_min"], row["current_max"],
                row["recommended_min"], row["recommended_max"], row["max_change"],
                row["headroom_pct"], row["confidence"],
            )
            for row in table_rows
        ],
    )
    connection.commit()
    chart_rows = [dict(zip(["configuration", "series", "price"], row)) for row in connection.execute(chart_sql)]
    table_rows = [
        dict(zip(
            [
                "model", "storage", "current_min", "current_max", "recommended_min",
                "recommended_max", "max_change", "headroom_pct", "confidence",
            ],
            row,
        ))
        for row in connection.execute(table_sql)
    ]

canonical_sources = [
    {
        "id": "pricing_analysis",
        "label": "Воспроизводимый расчёт Trade-in",
        "path": "analysis/trade-in-pricing-2026-08-29/trade_in_pricing_analysis.ipynb",
    },
    {
        "id": "pricing_chart_sql",
        "label": "SQLite: сравнение верхних границ",
        "path": "analysis/trade-in-pricing-2026-08-29/pricing_analysis.sqlite",
        "query": {
            "engine": "sqlite",
            "language": "sql",
            "sql": chart_sql,
            "executed_at": GENERATED_AT,
            "description": "Возвращает текущую и рекомендованную верхние границы по 19 конфигурациям.",
            "tables_used": ["pricing_comparison"],
            "filters": ["Срез 2026-08-29", "19 конфигураций MVP"],
            "metric_definitions": ["price — верхняя граница диапазона в рублях для указанной версии."],
        },
    },
    {
        "id": "pricing_matrix_sql",
        "label": "SQLite: рекомендованная матрица",
        "path": "analysis/trade-in-pricing-2026-08-29/pricing_analysis.sqlite",
        "query": {
            "engine": "sqlite",
            "language": "sql",
            "sql": table_sql,
            "executed_at": GENERATED_AT,
            "description": "Возвращает точные диапазоны, изменения и запас по 19 конфигурациям.",
            "tables_used": ["pricing_matrix"],
            "filters": ["Срез 2026-08-29", "19 конфигураций MVP"],
            "metric_definitions": [
                "recommended_max — минимум из максимума re:Store и 75% рыночного ориентира, округлённый вниз до 500 ₽.",
                "recommended_min — 90% recommended_max, округлённые вниз до 500 ₽.",
                "headroom_pct — запас между рыночным ориентиром и recommended_max.",
            ],
        },
    },
    {"id": "restore", "label": "re:Store Trade-in", "href": "https://re-store.ru/promo/trade-in/"},
    {"id": "opt_express", "label": "Opt-Express: б/у Apple", "href": "https://opt-express.ru/catalog/smartfony/b-u/apple/"},
    {"id": "bestphone", "label": "BestPhone: б/у iPhone", "href": "https://bestphone.ru/catalog/b_u_iphone_14_pro_max/"},
    {"id": "mobile_outlet", "label": "Mobile Outlet: iPhone 14 Pro", "href": "https://mobile-outlet.ru/collection/iphone-14-pro-bu"},
    {"id": "mobilo4ka", "label": "Mobilo4ka: iPhone 16 Pro 256 ГБ", "href": "https://moskva.mobilo4ka.ru/bu-tehnika/apple-bu/iphone-bu/iphone-16-pro-bu/256gb/"},
    {"id": "appzone", "label": "AppZone: iPhone 16 Pro Max 1 ТБ", "href": "https://appzone.store/catalog/iphone-b-u/iphone-16-pro-max-b-u/apple-iphone-16-pro-max-1tb-chernyy-titan-b-u/"},
]

title = "Trade-in ISVOI: рекомендованная ценовая матрица"
artifact = {
    "surface": "report",
    "manifest": {
        "version": 1,
        "surface": "report",
        "title": title,
        "description": "Рыночная сверка 19 конфигураций и безопасный draft v2 без публикации.",
        "generatedAt": GENERATED_AT,
        "sources": canonical_sources,
        "charts": [{
            "id": "pricing_comparison",
            "title": "Верхняя граница текущего draft и рекомендации",
            "subtitle": "Наибольшая коррекция приходится на iPhone 16 Pro Max 1 ТБ и линейку iPhone 14 Pro Max.",
            "type": "horizontalBar",
            "dataset": "pricing_comparison",
            "sourceId": "pricing_chart_sql",
            "encodings": {
                "x": {"field": "configuration", "type": "nominal", "label": "Конфигурация"},
                "y": {"field": "price", "type": "quantitative", "format": "currency", "unit": "₽", "label": "Верхняя граница"},
                "color": {"field": "series", "type": "nominal", "label": "Версия"},
                "tooltip": [
                    {"field": "configuration", "type": "nominal", "label": "Конфигурация"},
                    {"field": "series", "type": "nominal", "label": "Версия"},
                    {"field": "price", "type": "quantitative", "format": "currency", "unit": "₽", "label": "Цена"},
                ],
            },
            "valueFormat": "currency",
            "unit": "₽",
            "maxRows": 38,
        }],
        "tables": [{
            "id": "pricing_matrix",
            "title": "Рекомендованные диапазоны по 19 конфигурациям",
            "subtitle": "Точная таблица для согласования нового draft; значения в рублях.",
            "dataset": "pricing_matrix",
            "sourceId": "pricing_matrix_sql",
            "density": "compact",
            "defaultSort": {"field": "recommended_max", "direction": "desc"},
            "columns": [
                {"field": "model", "label": "Модель"},
                {"field": "storage", "label": "Память"},
                {"field": "current_max", "label": "Текущий max", "type": "currency", "format": "currency", "unit": "₽", "align": "right"},
                {"field": "recommended_min", "label": "Новый min", "type": "currency", "format": "currency", "unit": "₽", "align": "right"},
                {"field": "recommended_max", "label": "Новый max", "type": "currency", "format": "currency", "unit": "₽", "align": "right"},
                {"field": "max_change", "label": "Изменение max", "type": "currency", "format": "currency", "unit": "₽", "align": "right", "movement": True},
                {"field": "headroom_pct", "label": "Запас, %", "type": "number", "format": "number", "unit": "%", "align": "right"},
                {"field": "confidence", "label": "Уверенность"},
            ],
        }],
        "blocks": [
            {"id": "title", "type": "markdown", "body": f"# {title}"},
            {
                "id": "executive_summary",
                "type": "markdown",
                "sourceId": "pricing_analysis",
                "body": f"## Executive Summary\n\nРекомендуется новый консервативный draft: меняются **{changed} из 19** конфигураций, минимальный запас до рыночного ориентира — **{min_headroom:.1f}%**. Самая крупная коррекция — iPhone 16 Pro Max 1 ТБ: верхняя граница снижается на **{rub(largest_reduction)}**, до 56 000 ₽. Публичная версия и калькулятор остаются выключены.",
            },
            {
                "id": "findings",
                "type": "markdown",
                "sourceId": "pricing_analysis",
                "body": "## Основные выводы\n\n- Все четыре iPhone 13 Pro остаются без изменений.\n- У iPhone 14 Pro Max 128/256/512 ГБ верхние границы снижаются на 4 000/5 500/7 000 ₽.\n- iPhone 16 Pro Max 256/512 ГБ получают верхние границы 50 000/55 000 ₽.\n- Для 10 конфигураций уверенность низкая: до публикации нужна дополнительная розничная выборка.",
            },
            {"id": "comparison_chart", "type": "chart", "chartId": "pricing_comparison"},
            {"id": "matrix_heading", "type": "markdown", "body": "## Рекомендованная матрица\n\nТочные значения для согласования и контрольных расчётов."},
            {"id": "matrix_table", "type": "table", "tableId": "pricing_matrix"},
            {
                "id": "next_steps",
                "type": "markdown",
                "body": "## Рекомендуемые следующие шаги\n\n1. Подтвердить целевой запас и фактические расходы Trade Desk.\n2. Собрать минимум по три свежие карточки для конфигураций с низкой уверенностью.\n3. Провести десять расчётов на реальных устройствах.\n4. После подтверждения создать новую forward-only версию `trade-pricing-v2-draft`, не публикуя её и не включая калькулятор.",
            },
            {
                "id": "caveats",
                "type": "markdown",
                "body": "## Ограничения\n\nПубличные карточки различаются по состоянию, батарее, комплекту, гарантии и региону. В расчёте нет фактических расходов ISVOI, скорости продажи и гарантийных обращений. Матрица подходит для draft и проверки, но не доказывает чистую прибыльность.",
            },
            {
                "id": "further_questions",
                "type": "markdown",
                "body": "## Вопросы перед публикацией\n\n- Какой минимальный валовой запас принимает Trade Desk?\n- Каковы средние расходы на диагностику, подготовку и гарантию по поколениям?\n- Какие конфигурации продаются дольше 30 дней?\n- Нужен ли отдельный дисконт для 1 ТБ из-за более медленной оборачиваемости?",
            },
        ],
    },
    "snapshot": {
        "version": 1,
        "generatedAt": GENERATED_AT,
        "status": "ready",
        "datasets": {
            "summary": summary_rows,
            "pricing_comparison": chart_rows,
            "pricing_matrix": table_rows,
        },
    },
    "sources": canonical_sources,
    "package_info": {"name": "isvoi-trade-pricing-recommendation", "version": "2026-08-29"},
}

ARTIFACT_PATH.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(DOC_PATH)
print(ARTIFACT_PATH)
