"""Check every published device page, public certificate and Avito JPEG without tokens."""

import argparse
import html
import json
from pathlib import Path
import urllib.error
import urllib.request

from avito_image_preflight import NoRedirect, run as check_images


def public_get(url, limit):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(url, timeout=30) as response:
        body = response.read(limit + 1)
        if len(body) > limit:
            raise ValueError("Response too large")
        return response.status, response.headers.get_content_type(), body


def run(snapshot, reuse_assets=None):
    published = [p for p in snapshot["products"] if p["status"] == "published"]
    pages = []
    certificates = []
    if reuse_assets is not None:
        if reuse_assets.get("captured_at") != snapshot["captured_at"]:
            raise ValueError("Asset evidence belongs to another snapshot")
        known_images = reuse_assets.get("images", {}).get("products", [])
        known_certs = reuse_assets.get("certificates", [])
        if (set(p["product_id"] for p in known_images) != set(p["id"] for p in published)
                or len(known_images) != len(published)
                or not reuse_assets.get("images", {}).get("ok")
                or len(known_certs) != len(published) or not all(c["ok"] for c in known_certs)):
            raise ValueError("Incomplete prior asset evidence")
        certificates = known_certs
    for product in published:
        page = {"sku": product["sku"], "product_id": product["id"], "ok": False}
        try:
            page["url"] = "https://isvoi.ru/product/" + product["id"]
            status, mime, body = public_get(page["url"], 4 * 1024 * 1024)
            text = html.unescape(body.decode("utf-8"))
            page.update(status=status, mime=mime, title_present=product["title"] in text,
                        specifications_present="Технические характеристики модели" in text,
                        passport_present="Публичная выписка диагностики" in text,
                        sold_label_present="Продано" in text)
            page["ok"] = (status == 200 and mime == "text/html" and page["title_present"]
                          and page["specifications_present"] and page["passport_present"])
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            page["code"] = "public_page_failed"
        pages.append(page)
        if reuse_assets is not None:
            continue
        for report in product.get("reports") or []:
            if report["status"] != "current" or not report.get("public_file"):
                continue
            item = {"sku": product["sku"], "asset_id": report["public_file"], "ok": False}
            try:
                status, mime, body = public_get("https://api.isvoi.ru/assets/" + report["public_file"],
                                              25 * 1024 * 1024)
                signature_ok = ((mime == "image/jpeg" and body.startswith(b"\xff\xd8\xff"))
                                or (mime == "image/png" and body.startswith(b"\x89PNG\r\n\x1a\n"))
                                or (mime == "application/pdf" and body.startswith(b"%PDF-")))
                item.update(status=status, mime=mime, bytes=len(body), ok=status == 200 and signature_ok)
            except (urllib.error.URLError, TimeoutError, OSError, ValueError):
                item["code"] = "public_certificate_failed"
            certificates.append(item)
    images = reuse_assets["images"] if reuse_assets is not None else check_images([
        {"product_id": p["id"], "listing_file": p["listing_file"], "images": p["images"]} for p in published])
    return {"captured_at": snapshot["captured_at"], "pages": pages,
            "certificates": certificates, "images": images,
            "ok": bool(pages) and all(p["ok"] for p in pages)
            and len(certificates) == len(published) and all(c["ok"] for c in certificates)
            and images["ok"]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--reuse-assets", help="Reuse successful asset checks from the identical snapshot")
    args = parser.parse_args()
    reuse = json.loads(Path(args.reuse_assets).read_text(encoding="utf-8")) if args.reuse_assets else None
    result = run(json.loads(Path(args.snapshot).read_text(encoding="utf-8")), reuse)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": result["ok"], "pages": len(result["pages"]),
                      "page_passes": sum(p["ok"] for p in result["pages"]),
                      "certificates": len(result["certificates"]),
                      "certificate_passes": sum(c["ok"] for c in result["certificates"]),
                      "images": sum(len(p["images"]) for p in result["images"]["products"]),
                      "image_passes": sum(i["ok"] for p in result["images"]["products"] for i in p["images"])}))
    raise SystemExit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
