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
from datetime import date, datetime, timezone
import json
import mimetypes
import os
import sys
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from openpyxl import load_workbook


COLLECTION = "devices"
IMAGES_COLLECTION = "device_images"
MEDIA_ROLES = ("card", "main", "screen", "body", "defect", "other")

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
    "stockStatus": "stock_status",
    "contentStatus": "content_status",
    "sourceSystem": "source_system",
    "sourceId": "source_id",
    "importBatch": "import_batch",
    "importedAt": "imported_at",
    "adminNote": "admin_note",
}

JSON_FIELDS = {"tags", "gallery", "passport", "trade"}
INTEGER_FIELDS = {"price", "sort"}
BOOLEAN_FIELDS = {"has_detail_page"}
MEDIA_FIELDS = {
    *(f"image_{role}" for role in MEDIA_ROLES),
    *(f"image_{role}_label" for role in MEDIA_ROLES),
    *(f"image_{role}_alt" for role in MEDIA_ROLES),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import devices from Excel into Directus.")
    parser.add_argument("--file", required=True, help="Path to the .xlsx workbook.")
    parser.add_argument("--sheet", help="Worksheet name. Defaults to the active sheet.")
    parser.add_argument("--assets-root", default=".", help="Base folder for relative image paths in image_* columns.")
    parser.add_argument("--skip-media", action="store_true", help="Import device rows only; ignore image_* columns.")
    parser.add_argument("--replace-media", action="store_true", help="Overwrite existing device_images/listing_file links.")
    parser.add_argument("--source-system", default="xlsx", help="Default devices.source_system for imported rows.")
    parser.add_argument("--import-batch", help="Default devices.import_batch and device_images.import_batch.")
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


def auth_headers(cfg: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {cfg['token']}"}


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
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc).isoformat()
    if field in MEDIA_FIELDS:
        return str(value).strip()
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


def apply_import_defaults(
    rows: list[dict[str, Any]],
    *,
    source_system: str,
    import_batch: str | None,
) -> list[dict[str, Any]]:
    imported_at = datetime.now(timezone.utc).isoformat()
    for row in rows:
        row.setdefault("source_system", source_system)
        row.setdefault("content_status", "needs_photo" if any(key.startswith("image_") for key in row) else "needs_content")
        row.setdefault("stock_status", "in_stock")
        if import_batch:
            row.setdefault("import_batch", import_batch)
        row["imported_at"] = imported_at
    return rows


def split_media_fields(row: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Separate Directus device fields from image_* import helper columns."""
    device = {key: value for key, value in row.items() if key not in MEDIA_FIELDS}
    media: list[dict[str, Any]] = []
    for index, role in enumerate(MEDIA_ROLES):
        image_path = row.get(f"image_{role}")
        if not image_path:
            continue
        media.append({
            "role": role,
            "path": image_path,
            "label": row.get(f"image_{role}_label") or ("Card" if role == "card" else role.title()),
            "alt": row.get(f"image_{role}_alt") or row.get("listing_alt") or row.get("title") or row["id"],
            "sort": 0 if role == "card" else 10 + index,
        })
    return device, media


def request_json(cfg: dict[str, str], method: str, endpoint: str, payload: dict[str, Any] | None = None) -> Any:
    res = requests.request(
        method,
        f"{cfg['url']}{endpoint}",
        headers=headers(cfg),
        json=payload,
        timeout=60,
    )
    res.raise_for_status()
    body = res.json() if res.text else {}
    return body.get("data")


def get_all(cfg: dict[str, str], endpoint: str) -> list[dict[str, Any]]:
    data = request_json(cfg, "GET", endpoint)
    return data if isinstance(data, list) else []


def build_indexes(cfg: dict[str, str]) -> dict[str, dict[str, dict[str, Any]]]:
    """Load existing media rows once; faster and safer for large imports."""
    files = get_all(cfg, "/files?fields=id,title,filename_download&limit=-1")
    images = get_all(cfg, "/items/device_images?fields=id,device,role,image&limit=-1")
    return {
        "files": {str(row.get("title")): row for row in files if row.get("title")},
        "images": {f"{row.get('device')}:{row.get('role')}": row for row in images if row.get("device") and row.get("role")},
    }


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


def directus_file_title(device_id: str, role: str) -> str:
    return f"isvoi:{device_id}:{role}:xlsx"


def resolve_image_path(assets_root: Path, value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return assets_root / path


def upload_file(
    cfg: dict[str, str],
    indexes: dict[str, dict[str, dict[str, Any]]],
    *,
    device_id: str,
    role: str,
    image_path: Path,
    dry_run: bool,
) -> str | None:
    title = directus_file_title(device_id, role)
    existing = indexes["files"].get(title)
    if existing:
        print(f"[skip] file {title} -> {existing['id']}")
        return str(existing["id"])

    if not image_path.exists():
        raise FileNotFoundError(f"Missing image for {device_id}/{role}: {image_path}")
    if dry_run:
        print(f"[dry-run] upload {image_path} as {title}")
        return None

    mime = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    with image_path.open("rb") as fh:
        res = requests.post(
            f"{cfg['url']}/files",
            headers=auth_headers(cfg),
            data={"title": title, "description": f"{device_id} {role}"},
            files={"file": (image_path.name, fh, mime)},
            timeout=120,
        )
    res.raise_for_status()
    data = res.json()["data"]
    indexes["files"][title] = data
    print(f"[upload] file {title} -> {data['id']}")
    return str(data["id"])


def sync_device_image(
    cfg: dict[str, str],
    indexes: dict[str, dict[str, dict[str, Any]]],
    *,
    device_id: str,
    media: dict[str, Any],
    file_id: str | None,
    dry_run: bool,
    replace: bool,
) -> None:
    role = str(media["role"])
    key = f"{device_id}:{role}"
    existing = indexes["images"].get(key)
    payload = {
        "status": "published",
        "sort": media["sort"],
        "device": device_id,
        "role": role,
        "image": file_id,
        "label": media["label"],
        "alt": media["alt"],
        "shot_status": "approved",
        "source_path": str(media.get("path") or ""),
    }
    if media.get("import_batch"):
        payload["import_batch"] = media["import_batch"]

    if existing and not replace:
        print(f"[skip] device_images {device_id}/{role}")
        return
    if dry_run:
        print(f"[dry-run] {'patch' if existing else 'create'} device_images {device_id}/{role}")
        return
    if existing:
        data = request_json(cfg, "PATCH", f"/items/{IMAGES_COLLECTION}/{existing['id']}", payload)
        indexes["images"][key] = data
        print(f"[patch] device_images {device_id}/{role}")
        return
    data = request_json(cfg, "POST", f"/items/{IMAGES_COLLECTION}", payload)
    indexes["images"][key] = data
    print(f"[create] device_images {device_id}/{role}")


def sync_listing_file(cfg: dict[str, str], device_id: str, file_id: str | None, dry_run: bool, replace: bool) -> None:
    if not file_id:
        if dry_run:
            print(f"[dry-run] patch devices/{device_id}.listing_file after upload")
        return
    if dry_run:
        print(f"[dry-run] patch devices/{device_id}.listing_file = {file_id}")
        return
    existing = request_json(cfg, "GET", f"/items/{COLLECTION}/{device_id}?fields=id,listing_file")
    if existing.get("listing_file") and not replace:
        print(f"[skip] devices/{device_id}.listing_file already set")
        return
    request_json(cfg, "PATCH", f"/items/{COLLECTION}/{device_id}", {"listing_file": file_id})
    print(f"[patch] devices/{device_id}.listing_file")


def sync_media(
    cfg: dict[str, str],
    indexes: dict[str, dict[str, dict[str, Any]]],
    *,
    device: dict[str, Any],
    media_rows: list[dict[str, Any]],
    assets_root: Path,
    dry_run: bool,
    replace: bool,
) -> None:
    device_id = str(device["id"])
    for media in media_rows:
        role = str(media["role"])
        image_path = resolve_image_path(assets_root, str(media["path"]))
        file_id = upload_file(cfg, indexes, device_id=device_id, role=role, image_path=image_path, dry_run=dry_run)
        sync_device_image(cfg, indexes, device_id=device_id, media=media, file_id=file_id, dry_run=dry_run, replace=replace)
        if role == "card":
            sync_listing_file(cfg, device_id, file_id, dry_run, replace)


def main() -> None:
    args = parse_args()
    cfg = load_config(require_token=not args.dry_run)
    rows = apply_import_defaults(
        read_rows(args.file, args.sheet),
        source_system=args.source_system,
        import_batch=args.import_batch,
    )
    if not rows:
        raise SystemExit(f"No device rows found in {args.file}")
    print(f"{'[dry-run] ' if args.dry_run else ''}Importing {len(rows)} device(s)")
    assets_root = Path(args.assets_root).resolve()
    parsed = [split_media_fields(row) for row in rows]
    if args.import_batch:
        parsed = [
            (device, [{**media, "import_batch": args.import_batch} for media in media_rows])
            for device, media_rows in parsed
        ]
    indexes = None
    if not args.skip_media and any(media for _, media in parsed):
        indexes = build_indexes(cfg)
    for device, media_rows in parsed:
        upsert_device(cfg, device, dry_run=args.dry_run)
        if not args.skip_media and media_rows:
            if indexes is None:
                indexes = build_indexes(cfg)
            sync_media(
                cfg,
                indexes,
                device=device,
                media_rows=media_rows,
                assets_root=assets_root,
                dry_run=args.dry_run,
                replace=args.replace_media,
            )


if __name__ == "__main__":
    try:
        main()
    except (requests.HTTPError, ValueError, FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"Import error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
