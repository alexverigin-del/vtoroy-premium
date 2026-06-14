"""Import / sync devices into Directus from an Excel workbook.

Staff maintain a spreadsheet of stock (model, specs, grade, price, passport
fields, trade-in values). This job reads that workbook and upserts rows into the
Directus `devices` collection (and related `device_passports` / `trade_options`)
via the REST API.

Usage (planned):
    python import_devices_from_excel.py --file stock.xlsx [--dry-run]

Environment (load from .env, never hard-code secrets):
    DIRECTUS_URL          e.g. https://api.your-domain.ru
    DIRECTUS_TOKEN        a static token for an Editor-role service account

This is a SKELETON: it defines the intended flow and leaves the mapping/HTTP
calls as TODOs.
"""

from __future__ import annotations

import argparse
import os

# import requests
# from openpyxl import load_workbook
# from dotenv import load_dotenv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import devices from Excel into Directus.")
    parser.add_argument("--file", required=True, help="Path to the .xlsx workbook.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and validate only; do not write.")
    return parser.parse_args()


def load_config() -> dict[str, str]:
    """Read Directus connection settings from the environment."""
    # load_dotenv()
    url = os.environ.get("DIRECTUS_URL", "")
    token = os.environ.get("DIRECTUS_TOKEN", "")
    if not url or not token:
        raise SystemExit("DIRECTUS_URL and DIRECTUS_TOKEN must be set (see .env.example).")
    return {"url": url.rstrip("/"), "token": token}


def read_rows(path: str) -> list[dict]:
    """Read device rows from the workbook into dicts keyed by column header.

    TODO: open with openpyxl, map the header row to the `devices` schema
    (see directus/schema/collections.md), coerce types (price -> int), and
    build nested passport/trade payloads.
    """
    raise NotImplementedError("TODO: parse workbook rows")


def upsert_device(cfg: dict[str, str], device: dict, dry_run: bool) -> None:
    """Create or update one device in Directus.

    TODO:
      - GET /items/devices/{id} to detect existing rows.
      - POST /items/devices (create) or PATCH /items/devices/{id} (update).
      - Upsert related device_passports / trade_options.
      - Send Authorization: Bearer {token}.
    """
    raise NotImplementedError("TODO: implement Directus upsert")


def main() -> None:
    args = parse_args()
    cfg = load_config()
    rows = read_rows(args.file)
    for device in rows:
        upsert_device(cfg, device, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
