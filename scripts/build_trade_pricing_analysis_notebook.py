#!/usr/bin/env python3
"""Build the reproducible Trade-in pricing notebook without external notebook dependencies."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = ROOT / "analysis" / "trade-in-pricing-2026-08-29"
NOTEBOOK_PATH = ANALYSIS_DIR / "trade_in_pricing_analysis.ipynb"


def markdown_cell(source: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": source.splitlines(keepends=True)}


def code_cell(source: str) -> dict:
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": source.splitlines(keepends=True),
    }


cells = [
    markdown_cell(
        """# Trade-in ISVOI: рыночная сверка цен

Дата среза: 29 августа 2026 года. Цель — получить воспроизводимую черновую матрицу для 19 конфигураций без публикации в Directus.

Формула ориентирована на защиту маржи: верхняя граница не выше публичного Trade-in ориентира re:Store и не выше 75% консервативной рыночной цены. Нижняя граница равна 90% верхней. Все результаты округляются вниз до 500 ₽.
"""
    ),
    code_cell(
        """from pathlib import Path
import pandas as pd

analysis_dir = Path.cwd()
if not (analysis_dir / 'source_observations.csv').exists():
    analysis_dir = Path.cwd() / 'analysis' / 'trade-in-pricing-2026-08-29'
source_path = analysis_dir / 'source_observations.csv'
df = pd.read_csv(source_path)
assert len(df) == 19
df[['model', 'storage', 'current_min', 'current_max', 'restore_max', 'opt_price', 'spot_median', 'source_confidence']].head(10)
"""
    ),
    markdown_cell(
        """## Методика

`market_anchor` — минимум между оптовым ориентиром Opt-Express и медианой наблюдаемых низких розничных предложений, если выборка по конфигурации доступна. Такой минимум намеренно консервативен.

`recommended_max = floor500(min(reStore_max, market_anchor × 0.75))`

`recommended_min = floor500(recommended_max × 0.90)`
"""
    ),
    code_cell(
        """def floor_500(value):
    return (value // 500 * 500).astype('int64')

df['market_anchor'] = df[['opt_price', 'spot_median']].min(axis=1, skipna=True)
df['recommended_max'] = floor_500(pd.concat([df['restore_max'], df['market_anchor'] * 0.75], axis=1).min(axis=1))
df['recommended_min'] = floor_500(df['recommended_max'] * 0.90)
df['max_change'] = df['recommended_max'] - df['current_max']
df['headroom_pct'] = ((df['market_anchor'] - df['recommended_max']) / df['market_anchor'] * 100).round(1)
df['changed'] = df['max_change'] != 0
assert (df['recommended_min'] <= df['recommended_max']).all()
assert (df['headroom_pct'] >= 25).all()
assert (df['recommended_max'] % 500 == 0).all()
assert (df['recommended_min'] % 500 == 0).all()
df[['model', 'storage', 'market_anchor', 'current_max', 'recommended_min', 'recommended_max', 'max_change', 'headroom_pct', 'source_confidence']]
"""
    ),
    markdown_cell(
        """## Сводные показатели

Проверяем масштаб корректировки, минимальный запас и конфигурации, где решение сильнее всего зависит от ограниченной выборки.
"""
    ),
    code_cell(
        """summary = {
    'configurations': int(len(df)),
    'changed_configurations': int(df['changed'].sum()),
    'unchanged_configurations': int((~df['changed']).sum()),
    'largest_reduction': int(df['max_change'].min()),
    'minimum_headroom_pct': float(df['headroom_pct'].min()),
    'low_confidence_configurations': int((df['source_confidence'] == 'low').sum()),
}
summary
"""
    ),
    code_cell(
        """recommended_columns = [
    'model_slug', 'model', 'storage', 'recommended_min', 'recommended_max',
    'current_min', 'current_max', 'max_change', 'market_anchor',
    'headroom_pct', 'source_confidence'
]
matrix = df[recommended_columns].copy()
matrix.to_csv(analysis_dir / 'recommended_matrix.csv', index=False, encoding='utf-8-sig')
chart_rows = df[['model', 'storage', 'current_max', 'recommended_max', 'max_change']].copy()
chart_rows['configuration'] = chart_rows['model'] + ' ' + chart_rows['storage']
chart_rows.to_csv(analysis_dir / 'chart_rows.csv', index=False, encoding='utf-8-sig')
matrix
"""
    ),
    markdown_cell(
        """## Ограничения

Публичные карточки различаются по состоянию, батарее, комплекту, гарантии и региону. Цены не учитывают фактическую себестоимость диагностики, ремонта, логистики, налогов и гарантийных обращений ISVOI. Поэтому матрица подходит для нового draft и десяти контрольных расчётов, но не для публикации без подтверждения Trade Desk.
"""
    ),
]

notebook = {
    "cells": cells,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.12"},
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}

ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
NOTEBOOK_PATH.write_text(json.dumps(notebook, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(NOTEBOOK_PATH)
