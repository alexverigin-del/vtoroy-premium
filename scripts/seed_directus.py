"""Seed the Directus `devices` collection from data/devices.json.

This is the automated path to get the current 4 prototype devices into a running
Directus instance so the Next.js Catalog MVP (apps/web) can read live data instead
of its bundled fallback.

MVP schema shape (see directus/schema/collections.md for the relational future target):
a SINGLE `devices` collection. Scalar fields are snake_case columns; the nested
`tags`, `gallery`, `passport` and `trade` structures are stored as JSON columns;
`listing_file` is the preferred Directus Files thumbnail. `listing_image` stays
as a plain string fallback for legacy repo assets.

The script is idempotent:
  - schema: GET-before-create at the collection and per-field level;
  - records: GET-before-write, then POST (create) or PATCH (update) on the slug PK.

Usage:
    python seed_directus.py                 # create schema + upsert from ../data/devices.json
    python seed_directus.py --dry-run       # print intended calls, touch no network
    python seed_directus.py --file path.json

Environment (load from a local .env, NEVER commit real secrets — see .env.example):
    DIRECTUS_URL     e.g. http://localhost:8055
    DIRECTUS_TOKEN   static token for an Editor/Admin-role service account (NOT exposed to the browser)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import requests

try:  # optional convenience; the script works without it if env is already set
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dotenv is optional
    load_dotenv = None


COLLECTION = "devices"

# camelCase (data/devices.json) -> snake_case (Directus column) for scalar fields.
SCALAR_MAP: dict[str, str] = {
    "id": "id",
    "category": "category",
    "title": "title",
    "model": "model",
    "specs": "specs",
    "storage": "storage",
    "color": "color",
    "serial": "serial",
    "price": "price",
    "priceText": "price_text",
    "grade": "grade",
    "battery": "battery",
    "batteryText": "battery_text",
    "metaBattery": "meta_battery",
    "warranty": "warranty",
    "warrantyText": "warranty_text",
    "exit": "exit",
    "exitText": "exit_text",
    "availability": "availability",
    "shortDescription": "short_description",
    "headline": "headline",
    "listingImage": "listing_image",
    "listingAlt": "listing_alt",
    "ctaLabel": "cta_label",
    "hasDetailPage": "has_detail_page",
    "detailHref": "detail_href",
    "visualClass": "visual_class",
}

# Nested structures stored verbatim as JSON columns.
JSON_FIELDS = ("tags", "gallery", "passport", "trade")

# Field definitions used to create the collection's columns (besides the `id` PK,
# which is created with the collection). Order is preserved in Directus Studio.
FIELD_SPECS: list[dict[str, Any]] = [
    {"field": "status", "type": "string",
     "schema": {"default_value": "published"},
     "meta": {"interface": "select-dropdown", "options": {"choices": [
         {"text": "Draft", "value": "draft"},
         {"text": "Published", "value": "published"},
         {"text": "Archived", "value": "archived"},
     ]}}},
    {"field": "sort", "type": "integer", "schema": {}, "meta": {"interface": "input"}},
    {"field": "tags", "type": "json", "schema": {}, "meta": {"interface": "tags"}},
    {"field": "category", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "title", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "model", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "specs", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "storage", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "color", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "serial", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "price", "type": "integer", "schema": {}, "meta": {"interface": "input"}},
    {"field": "price_text", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "grade", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "battery", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "battery_text", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "meta_battery", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "warranty", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "warranty_text", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "exit", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "exit_text", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "availability", "type": "text", "schema": {}, "meta": {"interface": "input-multiline"}},
    {"field": "short_description", "type": "text", "schema": {}, "meta": {"interface": "input-multiline"}},
    {"field": "headline", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "listing_file", "type": "uuid", "schema": {}, "meta": {"interface": "file-image", "special": "file"}},
    {"field": "listing_image", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "listing_alt", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "cta_label", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "has_detail_page", "type": "boolean", "schema": {"default_value": True}, "meta": {"interface": "boolean"}},
    {"field": "detail_href", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "visual_class", "type": "string", "schema": {}, "meta": {"interface": "input"}},
    {"field": "gallery", "type": "json", "schema": {}, "meta": {"interface": "list"}},
    {"field": "passport", "type": "json", "schema": {}, "meta": {"interface": "input-code", "options": {"language": "json"}}},
    {"field": "trade", "type": "json", "schema": {}, "meta": {"interface": "input-code", "options": {"language": "json"}}},
]


def parse_args() -> argparse.Namespace:
    default_file = os.path.join(os.path.dirname(__file__), "..", "data", "devices.json")
    parser = argparse.ArgumentParser(description="Seed Directus `devices` from devices.json.")
    parser.add_argument("--file", default=default_file, help="Path to devices.json (default: ../data/devices.json).")
    parser.add_argument("--dry-run", action="store_true", help="Print intended calls; make no network requests.")
    return parser.parse_args()


def load_config(require_token: bool = True) -> dict[str, str]:
    """Read Directus connection settings from the environment / local .env."""
    if load_dotenv is not None:
        load_dotenv()
    url = os.environ.get("DIRECTUS_URL", "").strip()
    token = os.environ.get("DIRECTUS_TOKEN", "").strip()
    if not url or (require_token and not token):
        raise SystemExit("DIRECTUS_URL and DIRECTUS_TOKEN must be set (see scripts/.env.example).")
    return {"url": url.rstrip("/"), "token": token}


def _headers(cfg: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {cfg['token']}", "Content-Type": "application/json"}


def ensure_schema(cfg: dict[str, str], dry_run: bool) -> None:
    """Create the `devices` collection and its fields if they don't already exist."""
    base = cfg["url"]
    if dry_run:
        print(f"[dry-run] GET {base}/collections/{COLLECTION} (create if missing)")
        for spec in FIELD_SPECS:
            print(f"[dry-run] ensure field {COLLECTION}.{spec['field']} ({spec['type']})")
        return

    headers = _headers(cfg)
    res = requests.get(f"{base}/collections/{COLLECTION}", headers=headers, timeout=30)
    if res.status_code == 200:
        print(f"[skip] collection '{COLLECTION}' already exists")
    else:
        payload = {
            "collection": COLLECTION,
            "meta": {"sort_field": "sort", "icon": "devices"},
            "schema": {},
            "fields": [{
                "field": "id",
                "type": "string",
                "meta": {"interface": "input", "readonly": False},
                "schema": {"is_primary_key": True, "has_auto_increment": False},
            }],
        }
        r = requests.post(f"{base}/collections", headers=headers, json=payload, timeout=30)
        r.raise_for_status()
        print(f"[create] collection '{COLLECTION}'")

    for spec in FIELD_SPECS:
        field = spec["field"]
        fr = requests.get(f"{base}/fields/{COLLECTION}/{field}", headers=headers, timeout=30)
        if fr.status_code == 200:
            print(f"[skip] field {COLLECTION}.{field}")
            continue
        r = requests.post(f"{base}/fields/{COLLECTION}", headers=headers, json=spec, timeout=30)
        r.raise_for_status()
        print(f"[create] field {COLLECTION}.{field} ({spec['type']})")


def to_row(device: dict[str, Any], index: int) -> dict[str, Any]:
    """Convert a devices.json entry into a Directus `devices` row payload."""
    row: dict[str, Any] = {"status": "published", "sort": index}
    for camel, snake in SCALAR_MAP.items():
        if camel in device:
            row[snake] = device[camel]
    for key in JSON_FIELDS:
        if key in device:
            row[key] = device[key]
    return row


def upsert_device(cfg: dict[str, str], row: dict[str, Any], dry_run: bool) -> None:
    base = cfg["url"]
    slug = row["id"]
    if dry_run:
        print(f"[dry-run] upsert devices/{slug} -> {json.dumps(row, ensure_ascii=False)[:120]}…")
        return

    headers = _headers(cfg)
    existing = requests.get(f"{base}/items/{COLLECTION}/{slug}", headers=headers, timeout=30)
    if existing.status_code == 200:
        r = requests.patch(f"{base}/items/{COLLECTION}/{slug}", headers=headers, json=row, timeout=30)
        r.raise_for_status()
        print(f"[update] devices/{slug}")
    else:
        r = requests.post(f"{base}/items/{COLLECTION}", headers=headers, json=row, timeout=30)
        r.raise_for_status()
        print(f"[create] devices/{slug}")


def main() -> None:
    args = parse_args()
    cfg = load_config(require_token=not args.dry_run)

    with open(args.file, encoding="utf-8") as fh:
        catalog = json.load(fh)
    devices = catalog.get("devices", [])
    if not devices:
        raise SystemExit(f"No devices found in {args.file}")

    print(f"{'[dry-run] ' if args.dry_run else ''}Seeding {len(devices)} device(s) into {cfg['url']}")
    ensure_schema(cfg, args.dry_run)
    for index, device in enumerate(devices):
        upsert_device(cfg, to_row(device, index), args.dry_run)
    print("Done.")


if __name__ == "__main__":
    try:
        main()
    except requests.HTTPError as exc:  # surface Directus error bodies for debugging
        body = exc.response.text if exc.response is not None else ""
        print(f"Directus API error: {exc}\n{body}", file=sys.stderr)
        raise SystemExit(1) from exc
