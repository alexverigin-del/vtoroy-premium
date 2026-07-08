"""Create a safe demo catalog_import_batches item in Directus.

The demo batch is intentionally imported as draft content. It exercises the same
operator workflow as a real batch (workbook + photos ZIP + Studio import route)
without publishing anything to the public catalog.

Usage:
    python scripts/create_catalog_demo_batch.py
    python scripts/create_catalog_demo_batch.py --batch-name isvoi-demo-import-2026-07
"""

from __future__ import annotations

import argparse
import mimetypes
from pathlib import Path
import tempfile
from urllib.parse import quote
from zipfile import ZIP_DEFLATED, ZipFile

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

from openpyxl import Workbook
from PIL import Image, ImageDraw
import requests


HEADERS = [
    "id",
    "source_id",
    "source_system",
    "import_batch",
    "status",
    "stock_status",
    "content_status",
    "sort",
    "category",
    "title",
    "model",
    "specs",
    "storage",
    "color",
    "price",
    "price_text",
    "grade",
    "battery",
    "battery_text",
    "warranty",
    "warranty_text",
    "availability",
    "short_description",
    "headline",
    "listing_alt",
    "cta_label",
    "has_detail_page",
    "detail_href",
    "admin_note",
    "image_card",
    "image_card_alt",
    "image_main",
    "image_main_label",
    "image_main_alt",
    "image_screen",
    "image_screen_label",
    "image_screen_alt",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create demo Directus catalog import batch.")
    parser.add_argument("--batch-name", default="isvoi-demo-import-2026-07")
    parser.add_argument("--default-status", default="draft", choices=("draft", "published", "archived"))
    parser.add_argument("--directus-url", default="")
    parser.add_argument("--directus-token", default="")
    return parser.parse_args()


def load_env() -> None:
    if load_dotenv is None:
        return
    for candidate in (
        Path("scripts/.env"),
        Path("apps/web/.env.local"),
        Path("infra/directus-beget/.env"),
    ):
        if candidate.exists():
            load_dotenv(candidate, override=False)


def cfg(args: argparse.Namespace) -> tuple[str, str]:
    import os

    load_env()
    url = (args.directus_url or os.environ.get("DIRECTUS_URL") or "").rstrip("/")
    token = args.directus_token or os.environ.get("CATALOG_IMPORT_DIRECTUS_TOKEN") or os.environ.get("DIRECTUS_TOKEN") or ""
    if not url or not token:
        raise SystemExit("DIRECTUS_URL and DIRECTUS_TOKEN/CATALOG_IMPORT_DIRECTUS_TOKEN are required.")
    return url, token


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def request_json(
    url: str,
    token: str,
    method: str,
    endpoint: str,
    payload: dict[str, object] | None = None,
) -> object:
    response = requests.request(
        method,
        f"{url}{endpoint}",
        headers={**auth(token), "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    response.raise_for_status()
    return response.json().get("data")


def ensure_folder(url: str, token: str, name: str) -> str:
    encoded = quote(name, safe="")
    data = request_json(url, token, "GET", f"/folders?filter[name][_eq]={encoded}&fields=id,name&limit=1")
    if isinstance(data, list) and data:
        return str(data[0]["id"])
    created = request_json(url, token, "POST", "/folders", {"name": name})
    return str(created["id"])


def create_workbook(path: Path, batch_name: str) -> None:
    row = {
        "id": "isvoi-demo-import-iphone",
        "source_id": "demo-import-001",
        "source_system": "demo-import",
        "import_batch": batch_name,
        "status": "draft",
        "stock_status": "hidden",
        "content_status": "review",
        "sort": 9900,
        "category": "iphone",
        "title": "DEMO import iPhone",
        "model": "Demo iPhone",
        "specs": "128 GB",
        "storage": "128 GB",
        "color": "Demo Blue",
        "price": 1,
        "price_text": "1 ₽",
        "grade": "Demo",
        "battery": "100%",
        "battery_text": "100%",
        "warranty": "demo",
        "warranty_text": "Demo warranty",
        "availability": "Demo only",
        "short_description": "Служебная карточка для проверки import workflow.",
        "headline": "Demo import workflow check",
        "listing_alt": "Demo iPhone import image",
        "cta_label": "Demo",
        "has_detail_page": False,
        "detail_href": "/device/isvoi-demo-import-iphone",
        "admin_note": "Служебная demo-партия. Не публиковать на сайте.",
        "image_card": "isvoi-demo-import-iphone/card.webp",
        "image_card_alt": "Demo card image",
        "image_main": "isvoi-demo-import-iphone/main.webp",
        "image_main_label": "Demo main",
        "image_main_alt": "Demo main image",
        "image_screen": "isvoi-demo-import-iphone/screen.webp",
        "image_screen_label": "Demo screen",
        "image_screen_alt": "Demo screen image",
    }

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "devices"
    sheet.append(HEADERS)
    sheet.append([row.get(header, "") for header in HEADERS])
    workbook.save(path)


def create_demo_image(path: Path, label: str, color: tuple[int, int, int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (1200, 900), color)
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 80, 1120, 820), outline=(255, 255, 255), width=8)
    draw.text((120, 120), "ISVOI DEMO IMPORT", fill=(255, 255, 255))
    draw.text((120, 180), label, fill=(255, 255, 255))
    image.save(path, quality=90)


def create_photos_archive(path: Path, root: Path) -> None:
    image_root = root / "isvoi-demo-import-iphone"
    create_demo_image(image_root / "card.jpg", "card", (25, 92, 130))
    create_demo_image(image_root / "main.jpg", "main", (48, 82, 66))
    create_demo_image(image_root / "screen.jpg", "screen", (88, 72, 120))
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        for file in sorted(image_root.rglob("*.jpg")):
            archive.write(file, file.relative_to(root).as_posix())


def upload_file(url: str, token: str, path: Path, *, title: str, folder: str) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    with path.open("rb") as fh:
        response = requests.post(
            f"{url}/files?fields=id",
            headers=auth(token),
            data={"title": title, "folder": folder},
            files={"file": (path.name, fh, mime)},
            timeout=120,
        )
    try:
        response.raise_for_status()
    except requests.HTTPError as error:
        raise RuntimeError(
            f"Upload {path.name} failed: {response.status_code} {response.text[:1000]}"
        ) from error
    return str(response.json()["data"]["id"])


def upsert_batch(
    url: str,
    token: str,
    *,
    batch_name: str,
    workbook_id: str,
    archive_id: str,
    default_status: str,
) -> str:
    existing = request_json(
        url,
        token,
        "GET",
        f"/items/catalog_import_batches?filter[batch_name][_eq]={quote(batch_name, safe='')}&fields=id&limit=1",
    )
    payload = {
        "status": "draft",
        "batch_name": batch_name,
        "workbook": workbook_id,
        "photos_archive": archive_id,
        "default_status": default_status,
        "note": "Demo batch for production import workflow verification. Keep as draft.",
        "last_run_mode": None,
        "last_run_status": None,
        "last_run_log": None,
        "last_run_at": None,
    }
    if isinstance(existing, list) and existing:
        batch_id = str(existing[0]["id"])
        request_json(url, token, "PATCH", f"/items/catalog_import_batches/{batch_id}", payload)
        return batch_id
    created = request_json(url, token, "POST", "/items/catalog_import_batches", payload)
    return str(created["id"])


def main() -> None:
    args = parse_args()
    url, token = cfg(args)
    folder_id = ensure_folder(url, token, "ISVOI Catalog Imports")

    with tempfile.TemporaryDirectory(prefix="isvoi-demo-import-") as tmp:
        tmp_path = Path(tmp)
        workbook_path = tmp_path / "stock.xlsx"
        archive_path = tmp_path / "photos.zip"
        create_workbook(workbook_path, args.batch_name)
        create_photos_archive(archive_path, tmp_path / "incoming")

        workbook_id = upload_file(
            url,
            token,
            workbook_path,
            title=f"isvoi:catalog-import:{args.batch_name}:stock",
            folder=folder_id,
        )
        archive_id = upload_file(
            url,
            token,
            archive_path,
            title=f"isvoi:catalog-import:{args.batch_name}:photos",
            folder=folder_id,
        )
        batch_id = upsert_batch(
            url,
            token,
            batch_name=args.batch_name,
            workbook_id=workbook_id,
            archive_id=archive_id,
            default_status=args.default_status,
        )

    print(batch_id)


if __name__ == "__main__":
    main()
