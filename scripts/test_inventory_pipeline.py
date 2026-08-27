#!/usr/bin/env python3
"""Sanitized regression tests for the inventory workbook parser."""

from __future__ import annotations

import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from openpyxl import Workbook

from inventory_pipeline import (
    Issue,
    archive_previous_inventory_batches,
    find_missing_items,
    include_missing_issue_links,
    inventory_condition,
    parse_inventory,
    parse_receipts,
    product_mapping,
    reconcile,
    review_state,
    risk_codes,
    sync_eligible_product,
    sync_batch_issues,
    summarize,
)


INVENTORY_HEADERS = [
    "Uuid", "Наименование", "Код", "Артикул", "В продаже", "Цена закупки", "Цена",
    "Остаток", "Группа", "Описание", "Штрих-код", "Структура групп",
    "Тип собственности", "Создан", "Обновлен",
]
RECEIPT_HEADERS = [
    "№", "Наименование", "Категория", "Дата поступления", "Серийный номер", "Подкатегория",
    "Количество", "Закупка", "СуммаЗ", "Наценка", "Маржинальность", "Маржа",
    "Продажа", "СуммаП", "Комментарий",
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


class FakeProductSyncDirectus:
    def __init__(
        self,
        existing_product: dict[str, object] | None,
        existing_listing: dict[str, object] | None,
        existing_accessory_details: dict[str, object] | None = None,
    ) -> None:
        self.existing_product = existing_product
        self.existing_listing = existing_listing
        self.existing_accessory_details = existing_accessory_details
        self.requests: list[tuple[str, str, dict[str, object]]] = []

    def first(self, collection: str, filters: dict[str, object], fields: str = "*") -> dict[str, object] | None:
        if collection == "product_categories":
            return {"id": "category-id"}
        if collection == "product_brands":
            return {"id": "brand-id"}
        if collection == "products":
            return self.existing_product
        if collection == "product_channel_listings":
            return self.existing_listing
        if collection == "accessory_details":
            return self.existing_accessory_details
        return None

    def request(self, method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
        body = payload or {}
        self.requests.append((method, path, body))
        item_id = path.rsplit("/", 1)[-1] if method == "PATCH" else body.get("id", "product-id")
        return {"id": item_id, **body}

    def upsert(self, collection: str, filters: dict[str, object], payload: dict[str, object]) -> dict[str, object]:
        self.requests.append(("UPSERT", collection, payload))
        return {"id": "detail-id", **payload}


class FakeBatchArchiveDirectus:
    def __init__(self) -> None:
        self.requests: list[tuple[str, str, dict[str, object]]] = []

    def all(self, collection: str, filters: dict[str, object], fields: str) -> list[dict[str, object]]:
        if collection == "inventory_import_batches":
            return [
                {"id": "current", "status": "running"},
                {"id": "previous", "status": "applied_with_blocks"},
                {"id": "draft", "status": "draft"},
            ]
        if collection == "inventory_import_issues" and filters.get("batch") == "previous":
            return [{"id": "issue-1"}, {"id": "issue-2"}]
        return []

    def request(self, method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
        body = payload or {}
        self.requests.append((method, path, body))
        return {"id": path.rsplit("/", 1)[-1], **body}


class FakeIssueSyncDirectus:
    def __init__(self) -> None:
        self.requests: list[tuple[str, str, dict[str, object]]] = []
        self.rows = [
            {
                "id": "resolved-match",
                "code": "authenticity_review",
                "source_kind": "inventory",
                "source_id": "source-1",
                "row_number": 2,
                "resolved": True,
                "resolution_note": "Проверено оператором.",
            },
            {
                "id": "open-match",
                "code": "identity_conflict",
                "source_kind": "inventory",
                "source_id": "source-2",
                "row_number": 3,
                "resolved": False,
                "resolution_note": None,
            },
            {
                "id": "resolved-history",
                "code": "old_warning",
                "source_kind": "inventory",
                "source_id": "source-old",
                "row_number": 9,
                "resolved": True,
                "resolution_note": "Историческое решение.",
            },
        ]

    def all(self, collection: str, filters: dict[str, object], fields: str) -> list[dict[str, object]]:
        self.last_query = (collection, filters, fields)
        return self.rows

    def request(self, method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
        body = payload or {}
        self.requests.append((method, path, body))
        return {"id": path.rsplit("/", 1)[-1], **body}


class InventoryPipelineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def inventory_row(
        self, source_id: str, title: str, code: str, serial: str = "", quantity: int = 1
    ) -> list[object]:
        return [
            source_id, title, code, code, True, 100, 150, quantity, "Телефоны" if serial else "Роутеры",
            f"Серийный номер: {serial}" if serial else None, f"barcode-{code}", "Товары", "OWN",
            "01-08-2026, 10:00:00", "02-08-2026, 10:00:00",
        ]

    def sync_item(self) -> dict[str, object]:
        return {
            "source_system": "evotor",
            "source_id": "source-1",
            "source_sku": "sku-1",
            "source_title": "Apple iPhone 14 128 GB",
            "retail_price": Decimal("64900"),
            "quantity": 2,
            "for_sale": True,
            "condition": "used",
            "serial_full": "SERIAL-1",
            "risk_codes": [],
            "source_group": "Телефоны",
            "source_group_path": "Техника / Смартфоны / Apple",
        }

    def receipt_row(
        self, number: int, title: str, serial: str = "", quantity: int = 1, comment: str = ""
    ) -> list[object]:
        return [
            number, title, "Товары бу" if serial else "Товары", "07.08.2026", serial,
            "Смартфон", quantity, 100, 100 * quantity, 0.5, 1 / 3, 50, 150,
            150 * quantity, comment,
        ]

    def test_reconciliation_blocks_identity_but_keeps_historical_exits_non_blocking(self) -> None:
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
        self.assertEqual(codes.count("receipt_exit_inferred"), 2)
        self.assertNotIn("receipt_serial_missing_inventory", codes)
        self.assertNotIn("receipt_item_missing_inventory", codes)
        self.assertEqual(receipts[1]["movement_status"], "exited_preload")
        self.assertEqual(receipts[2]["match_status"], "not_in_snapshot")
        self.assertEqual(receipts[0]["received_on"], "2026-08-07")

    def test_central_office_and_partial_stock_are_structured(self) -> None:
        inventory_path = self.root / "inventory.xlsx"
        receipt_path = self.root / "receipts.xlsx"
        camera = self.inventory_row("source-1", "Smart Camera 3K", "sku-1", quantity=2)
        replica = self.inventory_row("source-2", "Phone Replica", "sku-2")
        save_inventory(inventory_path, [camera, replica])
        save_receipts(
            receipt_path,
            [
                self.receipt_row(1, "Smart Camera 3K", quantity=3, comment="в ЦО"),
                self.receipt_row(2, "MacBook Office", comment="в ЦО"),
                self.receipt_row(3, "Phone Replica", comment="в ЦО"),
            ],
        )

        inventory = parse_inventory(inventory_path)
        receipts = parse_receipts(receipt_path)
        issues, _ = reconcile(inventory, receipts)

        self.assertEqual(receipts[0]["movement_status"], "partial_central_office")
        self.assertEqual(receipts[0]["central_office_quantity"], 1)
        self.assertEqual(receipts[1]["movement_status"], "central_office")
        self.assertEqual(receipts[1]["central_office_quantity"], 1)
        self.assertEqual(receipts[2]["movement_status"], "central_office_inventory_conflict")
        self.assertIn("receipt_central_office_inventory_conflict", [issue.code for issue in issues])

        summary = summarize(inventory, receipts, issues)
        self.assertEqual(summary["receipts"]["central_office_units"], 2)
        self.assertEqual(summary["receipts"]["movement_counts"]["central_office"], 1)

    def test_serialized_identity_ignores_generic_phone_and_5g_tokens(self) -> None:
        inventory_path = self.root / "inventory.xlsx"
        receipt_path = self.root / "receipts.xlsx"
        save_inventory(
            inventory_path,
            [self.inventory_row("source-1", "Samsung, Galaxy S24 Ultra, 256 GB, Yellow", "sku-1", "SERIAL-1")],
        )
        save_receipts(
            receipt_path,
            [self.receipt_row(1, "Мобильный телефон Samsung Galaxy S24 Ultra 5G, 256 GB, Yellow", "SERIAL-1")],
        )

        inventory = parse_inventory(inventory_path)
        receipts = parse_receipts(receipt_path)
        issues, _ = reconcile(inventory, receipts)

        self.assertNotIn("serialized_identity_conflict", [issue.code for issue in issues])
        self.assertEqual(receipts[0]["match_status"], "matched")

    def test_serialized_identity_treats_silver_white_as_silver(self) -> None:
        inventory_path = self.root / "inventory.xlsx"
        receipt_path = self.root / "receipts.xlsx"
        save_inventory(
            inventory_path,
            [
                self.inventory_row(
                    "source-1",
                    "Apple iPhone 14 Pro Max, 256 GB, серебристый (Silver)",
                    "sku-1",
                    "SERIAL-1",
                )
            ],
        )
        save_receipts(
            receipt_path,
            [
                self.receipt_row(
                    1,
                    "Мобильный телефон Apple iPhone 14 Pro Max, 256 GB, серебристый белый (Silver)",
                    "SERIAL-1",
                )
            ],
        )

        inventory = parse_inventory(inventory_path)
        receipts = parse_receipts(receipt_path)
        issues, _ = reconcile(inventory, receipts)

        self.assertNotIn("serialized_identity_conflict", [issue.code for issue in issues])
        self.assertEqual(receipts[0]["match_status"], "matched")

    def test_resolved_automatic_block_returns_to_pending(self) -> None:
        existing = {
            "authenticity_status": "pending",
            "eligibility_status": "blocked",
            "block_reason": "serialized_identity_conflict",
            "review_override": False,
            "review_note": None,
        }
        item = {"identity_status": "matched", "risk_codes": []}

        self.assertEqual(review_state(existing, item), ("pending", "pending"))

    def test_undocumented_stale_block_returns_to_pending(self) -> None:
        existing = {
            "authenticity_status": "pending",
            "eligibility_status": "blocked",
            "block_reason": None,
            "review_override": False,
            "review_note": None,
        }
        item = {"identity_status": "matched", "risk_codes": []}

        self.assertEqual(review_state(existing, item), ("pending", "pending"))

    def test_documented_manual_block_is_preserved(self) -> None:
        existing = {
            "authenticity_status": "pending",
            "eligibility_status": "blocked",
            "block_reason": None,
            "review_override": False,
            "review_note": "Проверка остановлена менеджером до получения документов.",
        }
        item = {"identity_status": "matched", "risk_codes": []}

        self.assertEqual(review_state(existing, item), ("pending", "blocked"))

    def test_active_authenticity_risk_stays_blocked(self) -> None:
        existing = {
            "authenticity_status": "blocked",
            "eligibility_status": "blocked",
            "block_reason": "authenticity_review",
            "review_override": False,
            "review_note": None,
        }
        item = {"identity_status": "not_applicable", "risk_codes": ["authenticity_review"]}

        self.assertEqual(review_state(existing, item), ("blocked", "blocked"))

    def test_documented_verified_override_can_prepare_identity_conflict_draft(self) -> None:
        existing = {
            "authenticity_status": "verified",
            "eligibility_status": "blocked",
            "block_reason": "serialized_identity_conflict",
            "review_override": True,
            "review_note": "Оператор сверил устройство; создать только черновик для повторной диагностики.",
        }
        item = {"identity_status": "conflict", "risk_codes": []}

        self.assertEqual(review_state(existing, item), ("verified", "eligible"))

    def test_existing_product_sync_preserves_editorial_fields_and_listing_status(self) -> None:
        client = FakeProductSyncDirectus(
            {"id": "existing-product", "status": "published", "content_status": "ready"},
            {"id": "existing-listing", "status": "active"},
        )
        stored = {"eligibility_status": "eligible", "review_override": True}

        product_id = sync_eligible_product(client, self.sync_item(), stored, "batch-2")

        self.assertEqual(product_id, "existing-product")
        product_patch = next(
            body for method, path, body in client.requests
            if method == "PATCH" and path == "/items/products/existing-product"
        )
        self.assertEqual(product_patch["price"], 64900)
        self.assertEqual(product_patch["stock_quantity"], 2)
        self.assertNotIn("status", product_patch)
        self.assertNotIn("content_status", product_patch)
        self.assertNotIn("title", product_patch)
        listing_patch = next(
            body for method, path, body in client.requests
            if method == "PATCH" and path == "/items/product_channel_listings/existing-listing"
        )
        self.assertEqual(listing_patch, {"external_id": "isvoi-source-1"})

    def test_new_product_sync_creates_draft_and_avito_draft(self) -> None:
        client = FakeProductSyncDirectus(None, None)
        stored = {"eligibility_status": "eligible", "review_override": True}

        sync_eligible_product(client, self.sync_item(), stored, "batch-1")

        product_create = next(
            body for method, path, body in client.requests
            if method == "POST" and path == "/items/products"
        )
        self.assertEqual(product_create["status"], "draft")
        self.assertEqual(product_create["content_status"], "needs_photo")
        listing_create = next(
            body for method, path, body in client.requests
            if method == "POST" and path == "/items/product_channel_listings"
        )
        self.assertEqual(listing_create["status"], "draft")

    def test_existing_accessory_sync_preserves_editorial_compatibility(self) -> None:
        client = FakeProductSyncDirectus(
            {"id": "existing-accessory", "status": "published", "content_status": "ready"},
            {"id": "existing-listing", "status": "ready"},
            {"id": "accessory-details"},
        )
        item = self.sync_item()
        item.update(
            {
                "source_title": "Чехол Apple iPhone 14 прозрачный",
                "condition": "new",
                "serial_full": "",
                "source_group": "Чехлы",
                "source_group_path": "Аксессуары / Чехлы для смартфонов",
            }
        )

        sync_eligible_product(
            client,
            item,
            {"eligibility_status": "eligible", "review_override": True},
            "batch-2",
        )

        accessory_writes = [
            request for request in client.requests
            if request[0] == "UPSERT" and request[1] == "accessory_details"
        ]
        self.assertEqual(accessory_writes, [])

    def test_previous_completed_batches_are_archived_without_deleting_history(self) -> None:
        client = FakeBatchArchiveDirectus()

        archived = archive_previous_inventory_batches(
            client, "current", "store-snapshot-2", "store_inventory"
        )

        self.assertEqual(archived, 1)
        batch_patches = [
            (path, body) for method, path, body in client.requests
            if method == "PATCH" and "/inventory_import_batches/" in path
        ]
        self.assertEqual(
            batch_patches,
            [("/items/inventory_import_batches/previous", {"status": "archived"})],
        )
        issue_patches = [
            body for method, path, body in client.requests
            if method == "PATCH" and "/inventory_import_issues/" in path
        ]
        self.assertEqual(len(issue_patches), 2)
        self.assertTrue(all(body["resolved"] for body in issue_patches))

    def test_same_batch_reapply_preserves_documented_issue_resolutions(self) -> None:
        client = FakeIssueSyncDirectus()
        issues = [
            Issue(
                severity="blocker",
                code="authenticity_review",
                source_kind="inventory",
                row_number=2,
                source_id="source-1",
                message="Нужна повторная проверка.",
            ),
            Issue(
                severity="blocker",
                code="identity_conflict",
                source_kind="inventory",
                row_number=3,
                source_id="source-2",
                message="Конфликт идентичности.",
            ),
        ]

        preserved = sync_batch_issues(
            client,
            "batch-1",
            issues,
            {"source-1": {"id": "item-1"}, "source-2": {"id": "item-2"}},
        )

        self.assertEqual(preserved, 1)
        deletes = [path for method, path, _ in client.requests if method == "DELETE"]
        self.assertEqual(deletes, ["/items/inventory_import_issues/open-match"])
        preserved_patch = next(
            body for method, path, body in client.requests
            if method == "PATCH" and path.endswith("/resolved-match")
        )
        self.assertTrue(preserved_patch["resolved"])
        self.assertEqual(preserved_patch["resolution_note"], "Проверено оператором.")
        self.assertEqual(preserved_patch["inventory_item"], "item-1")
        creates = [body for method, _, body in client.requests if method == "POST"]
        self.assertEqual(len(creates), 1)
        self.assertEqual(creates[0]["code"], "identity_conflict")
        self.assertFalse(any("resolved-history" in path for _, path, _ in client.requests))

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

    def test_condition_uses_evotor_group_structure_instead_of_serial_presence(self) -> None:
        self.assertEqual(inventory_condition("Телефоны", "Телефоны", ""), "used")
        self.assertEqual(inventory_condition("Телефоны", "Телефоны", "SERIAL-1"), "used")
        self.assertEqual(
            inventory_condition("Смартфоны", "Товары на продажу \\ Смартфоны", "SERIAL-2"),
            "new",
        )
        self.assertEqual(
            inventory_condition("Ноутбуки", "Товары на продажу \\ Ноутбуки", "SERIAL-3"),
            "new",
        )

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

    def test_missing_item_is_available_for_issue_linking(self) -> None:
        stored = {"source-1": {"id": "item-1", "source_id": "source-1"}}
        missing = {"id": "item-2", "source_id": "source-2"}
        include_missing_issue_links(stored, [missing])
        self.assertEqual(stored["source-2"], missing)

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

    def test_personal_care_devices_in_root_group_map_to_smart_electronics(self) -> None:
        for title in ("Электробритва Enchan A1", "Триммер Enchan Beardo"):
            with self.subTest(title=title):
                item = {
                    "source_title": title,
                    "source_group": "Товары на продажу",
                    "source_group_path": "Товары на продажу",
                }
                self.assertEqual(product_mapping(item)[:2], ("device", "smart-electronics"))

    def test_low_cost_jbl_flip_requires_authenticity_review(self) -> None:
        self.assertIn("authenticity_review", risk_codes("JBL Flip7", Decimal("1200")))
        self.assertNotIn("authenticity_review", risk_codes("JBL Flip 7", Decimal("10000")))

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
