#!/usr/bin/env python3
"""Sanitized regression tests for the inventory workbook parser."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from inventory_pipeline import (
    find_missing_items,
    parse_inventory,
    parse_receipts,
    product_mapping,
    reconcile,
    summarize,
)


INVENTORY_HEADERS = [
    "Uuid", "Наименование", "Код", "Артикул", "В продаже", "Цена закупки", "Цена",
    "Остаток", "Группа", "Описание", "Штрих-код", "Структура групп",
    "Тип собственности", "Создан", "Обновлен",
]
RECEIPT_HEADERS = [
    "№", "Наименование", "Категория", "IMEI", "Серийный номер", "Подкатегория",
    "Количество", "Закупка", "СуммаЗ", "Наценка", "Маржинальность", "Маржа",
    "Продажа", "СуммаП",
]


def save_inventory(path: Path, rows: list[list[object]]) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(INVENTORY_HEADERS)
    for row in rows:
        sheet.append(row)
    workbook.save(path)
    workbook.close()


def save_receipts(path: Path, rows: list[list[object]]) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append([None] * len(RECEIPT_HEADERS))
    sheet.append(RECEIPT_HEADERS)
    for row in rows:
        sheet.append(row)
    workbook.save(path)
    workbook.close()


class FakeDirectus:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def all(self, collection: str, filters: dict[str, object], fields: str) -> list[dict[str, object]]:
        self.last_query = (collection, filters, fields)
        return self.rows


class InventoryPipelineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def inventory_row(self, source_id: str, title: str, code: str, serial: str = "") -> list[object]:
        return [
            source_id, title, code, code, True, 100, 150, 1, "Телефоны" if serial else "Роутеры",
            f"Серийный номер: {serial}" if serial else None, f"barcode-{code}", "Товары", "OWN",
            "01-08-2026, 10:00:00", "02-08-2026, 10:00:00",
        ]

    def receipt_row(self, number: int, title: str, serial: str = "") -> list[object]:
        return [number, title, "Товары бу" if serial else "Товары", None, serial, "Смартфон", 1, 100, 100, 0.5, 1 / 3, 50, 150, 150]

    def test_reconciliation_blocks_identity_and_missing_rows(self) -> None:
        inventory_path = self.root / "inventory.xlsx"
        receipt_path = self.root / "receipts.xlsx"
        save_inventory(
            inventory_path,
            [
                self.inventory_row("source-1", "Phone Model A 128 GB Black", "sku-1", "SERIAL-1"),
                self.inventory_row("source-2", "Wi-Fi Router R1", "sku-2"),
            ],
        )
        save_receipts(
            receipt_path,
            [
                self.receipt_row(1, "Phone Model B 256 GB White", "SERIAL-1"),
                self.receipt_row(2, "Phone Model C", "SERIAL-2"),
                self.receipt_row(3, "Missing pooled product"),
            ],
        )
        inventory = parse_inventory(inventory_path)
        receipts = parse_receipts(receipt_path)
        issues, _ = reconcile(inventory, receipts)
        codes = [issue.code for issue in issues]
        self.assertEqual(codes.count("serialized_identity_conflict"), 1)
        self.assertEqual(codes.count("receipt_serial_missing_inventory"), 1)
        self.assertEqual(codes.count("receipt_item_missing_inventory"), 1)

    def test_duplicate_source_id_is_rejected(self) -> None:
        path = self.root / "duplicate.xlsx"
        save_inventory(
            path,
            [
                self.inventory_row("same-id", "Router A", "sku-a"),
                self.inventory_row("same-id", "Router B", "sku-b"),
            ],
        )
        with self.assertRaisesRegex(ValueError, "duplicate source_id"):
            parse_inventory(path)

    def test_negative_price_is_rejected(self) -> None:
        path = self.root / "negative.xlsx"
        row = self.inventory_row("source-1", "Router A", "sku-a")
        row[6] = -1
        save_inventory(path, [row])
        with self.assertRaisesRegex(ValueError, "non-negative"):
            parse_inventory(path)

    def test_summary_is_deterministic_without_receipts(self) -> None:
        path = self.root / "inventory.xlsx"
        save_inventory(path, [self.inventory_row("source-1", "Router A", "sku-a")])
        inventory = parse_inventory(path)
        issues, _ = reconcile(inventory, [])
        first = summarize(inventory, [], issues)
        second = summarize(inventory, [], issues)
        self.assertEqual(first, second)
        self.assertEqual(first["inventory"]["rows"], 1)
        self.assertEqual(first["receipts"]["rows"], 0)

    def test_repeated_snapshot_has_no_missing_items(self) -> None:
        inventory = [{"source_id": "source-1"}, {"source_id": "source-2"}]
        client = FakeDirectus([
            {"id": "item-1", "source_id": "source-1"},
            {"id": "item-2", "source_id": "source-2"},
        ])
        self.assertEqual(find_missing_items(client, "store_inventory", inventory), [])

    def test_missing_item_is_previewed_without_mutation(self) -> None:
        inventory = [{"source_id": "source-1"}]
        missing = {"id": "item-2", "source_id": "source-2", "source_sku": "sku-2"}
        client = FakeDirectus([{"id": "item-1", "source_id": "source-1"}, missing])
        self.assertEqual(find_missing_items(client, "store_inventory", inventory), [missing])

    def test_product_mapping_uses_group_path_for_wearables(self) -> None:
        watch = {
            "source_title": "Smart Band Model 10",
            "source_group": "Смарт-часы или браслеты",
            "source_group_path": "Товары на продажу \\ Часы \\ Смарт-часы или браслеты",
        }
        glasses = {
            "source_title": "AI Glasses",
            "source_group": "Смарт очки",
            "source_group_path": "Товары на продажу \\ Смарт-электроника \\ Смарт очки",
        }
        self.assertEqual(product_mapping(watch)[:2], ("device", "watches"))
        self.assertEqual(product_mapping(glasses)[:2], ("device", "smart-electronics"))

    def test_product_mapping_falls_back_when_group_path_is_missing(self) -> None:
        glasses = {
            "source_title": "AI Glasses",
            "source_group": "Смарт очки",
            "source_group_path": "",
        }
        self.assertEqual(product_mapping(glasses)[:2], ("device", "smart-electronics"))

    def test_product_mapping_covers_inventory_group_structure(self) -> None:
        cases = {
            "Зарядные устройства \\ Apple": ("accessory", "chargers"),
            "Зарядные устройства \\ Samsung": ("accessory", "chargers"),
            "Ноутбуки": ("device", "laptops"),
            "Телефоны": ("device", "smartphones"),
            "Товары на продажу \\ Защитные стекла и пленки \\ Защитные стекла": (
                "accessory",
                "protective-glass",
            ),
            "Товары на продажу \\ Наушники \\ Беспроводные наушники": (
                "device",
                "headphones",
            ),
            "Товары на продажу \\ Планшеты": ("device", "tablets"),
            "Товары на продажу \\ Роутеры": ("device", "routers"),
            "Товары на продажу \\ Смарт-электроника": ("device", "smart-electronics"),
            "Товары на продажу \\ Смарт-электроника \\ Смарт очки": (
                "device",
                "smart-electronics",
            ),
            "Товары на продажу \\ Смартфоны": ("device", "smartphones"),
            "Товары на продажу \\ Часы \\ Смарт-часы или браслеты": ("device", "watches"),
            "Товары на продажу \\ Чехлы и бамперы для смартфонов \\ Чехлы для смартфонов": (
                "accessory",
                "cases",
            ),
            "от 10.000 мА*ч до 20.000 мА*ч": ("accessory", "power-banks"),
        }

        for group_path, expected in cases.items():
            with self.subTest(group_path=group_path):
                item = {
                    "source_title": "Тестовый товар",
                    "source_group": "Не используется",
                    "source_group_path": group_path,
                }
                self.assertEqual(product_mapping(item)[:2], expected)


if __name__ == "__main__":
    unittest.main()
