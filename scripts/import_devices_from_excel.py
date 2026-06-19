"""Import / sync devices into Directus from an Excel workbook.

Expected workbook shape:
  - first row contains column headers;
  - one device per row;
  - `id` is required and is used as the public slug / primary key.

Headers may use either Directus snake_case names (`price_text`) or the current
catalog camelCase names (`priceText`). JSON fields (`tags`, `gallery`,
`passport`, `trade`) may be pasted as JSON strings. `tags` also accepts a
comma-separated list.

Usage:
    python scripts/import_devices_from_excel.py --file stock.xlsx --dry-run
    python scripts/import_devices_from_excel.py --file stock.xlsx

Environment:
    DIRECTUS_URL
    DIRECTUS_TOKEN
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import requests
from dotenv import load_dotenv
from openpyxl import load_workbook


COLLECTION = "devices"

HEADER_MAP = {
    "priceText": "price_text",
    "batteryText": "battery_text",
    "metaBattery": "meta_battery",
    "warrantyText": "warranty_text",
    "exitText": "exit_text",
    "shortDescription": "short_description",
    "listingImage": "listing_image",
    "listingAlt": "listing_alt",
    "ctaLabel": "cta_label",
    "hasDetailPage": "has_detail_page",
    "detailHref": "detail_href",
    "visualClass": "visual_class",
}

JSON_FIELDS = {"tags", "gallery", "passport", "trade"}
INTEGER_FIELDS = {"price", "sort"}
BOOLEAN_FIELDS = {"has_detail_page"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import devices from Excel into Directus.")
    parser.add_argument("--file", required=True, help="Path to the .xlsx workbook.")
    parser.add_argument("--sheet", help="Worksheet name. Defaults to the active sheet.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and validate only; do not write.")
    return parser.parse_args()


def load_config(require_token: bool = True) -> dict[str, str]:
    """Read Directus connection settings from the environment."""
    load_dotenv()
    url = os.environ.get("DIRECTUS_URL", "").strip()
    token = os.environ.get("DIRECTUS_TOKEN", "").strip()
    if not url or (require_token and not token):
        raise SystemExit("DIRECTUS_URL and DIRECTUS_TOKEN must be set (see scripts/.env.example).")
    return {"url": url.rstrip("/"), "token": token}


def headers(cfg: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {cfg['token']}", "Content-Type": "application/json"}


def normalize_header(value: Any) -> str:
    raw = str(value or "").strip()
    return HEADER_MAP.get(raw, raw)


def empty(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    return text in {"1", "true", "yes", "y", "да", "истина"}


def parse_json_field(field: str, value: Any) -> Any:
    if empty(value):
        return [] if field in {"tags", "gallery"} else {}
    if not isinstance(value, str):
        return value
    text = value.strip()
    if field == "tags" and not text.startswith("["):
        return [part.strip() for part in text.split(",") if part.strip()]
    return json.loads(text)


def coerce(field: str, value: Any) -> Any:
    if empty(value):
        return None
    if field in JSON_FIELDS:
        return parse_json_field(field, value)
    if field in INTEGER_FIELDS:
        return int(value)
    if field in BOOLEAN_FIELDS:
        return parse_bool(value)
    return value


def read_rows(path: str, sheet_name: str | None = None) -> list[dict[str, Any]]:
    """Read device rows from the workbook into Directus payloads."""
    workbook = load_workbook(path, data_only=True)
    sheet = workbook[sheet_name] if sheet_name else workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [normalize_header(value) for value in rows[0]]
    devices: list[dict[str, Any]] = []
    for row_index, row in enumerate(rows[1:], start=2):
        payload: dict[str, Any] = {}
        for header, value in zip(headers, row):
            if not header or empty(value):
                continue
            payload[header] = coerce(header, value)
        if not payload:
            continue
        if "id" not in payload:
            raise ValueError(f"Row {row_index}: missing required `id`.")
        payload.setdefault("status", "published")
        devices.append(payload)
    return devices


def upsert_device(cfg: dict[str, str], device: dict[str, Any], dry_run: bool) -> None:
    """Create or update one device in Directus."""
    slug = str(device["id"])
    if dry_run:
        print(f"[dry-run] upsert devices/{slug} -> {json.dumps(device, ensure_ascii=False)[:180]}")
        return

    base = cfg["url"]
    res = requests.get(f"{base}/items/{COLLECTION}/{slug}", headers=headers(cfg), timeout=30)
    if res.status_code == 200:
        patched = requests.patch(f"{base}/items/{COLLECTION}/{slug}", headers=headers(cfg), json=device, timeout=30)
        patched.raise_for_status()
        print(f"[update] devices/{slug}")
        return
    created = requests.post(f"{base}/items/{COLLECTION}", headers=headers(cfg), json=device, timeout=30)
    created.raise_for_status()
    print(f"[create] devices/{slug}")


def main() -> None:
    args = parse_args()
    cfg = load_config(require_token=not args.dry_run)
    rows = read_rows(args.file, args.sheet)
    if not rows:
        raise SystemExit(f"No device rows found in {args.file}")
    print(f"{'[dry-run] ' if args.dry_run else ''}Importing {len(rows)} device(s)")
    for device in rows:
        upsert_device(cfg, device, dry_run=args.dry_run)


if __name__ == "__main__":
    try:
        main()
    except (requests.HTTPError, ValueError, json.JSONDecodeError) as exc:
        print(f"Import error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
