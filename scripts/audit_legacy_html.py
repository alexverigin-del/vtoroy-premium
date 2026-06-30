"""Guard against reintroducing the old static HTML/CSS/JS site.

The public site is served by Next.js now. Legacy `.html` URLs may appear only in
compatibility redirects or URL-normalization scripts, not as root page files or
content links. The Tailwind-first runtime also must not bring back the deleted
legacy stylesheet, interaction script, or HTML renderer module.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

LEGACY_ENTRYPOINTS = [
    "index.html",
    "script.js",
    "styles.css",
    "catalog/index.html",
    "store/index.html",
    "passport/index.html",
    "trade/index.html",
    "club/index.html",
    "device/iphone-13-pro/index.html",
    "device/iphone-14/index.html",
    "device/macbook-air-m1/index.html",
    "device/ipad-air/index.html",
    "apps/web/app/site.css",
    "apps/web/public/interactions.js",
    "apps/web/lib/site-renderer.ts",
]

ALLOWLIST = {
    "apps/web/next.config.mjs",
    "apps/web/components/site-chrome-utils.ts",
    "apps/web/lib/site-content.ts",
    "scripts/audit_legacy_html.py",
    "scripts/audit_text_encoding.py",
    "scripts/normalize_directus_site_urls_sql.mjs",
}

TEXT_SUFFIXES = {
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".json",
    ".css",
    ".py",
    ".sql",
    ".yml",
    ".yaml",
}

SKIP_DIRS = {
    ".git",
    ".next",
    "node_modules",
}

HTML_ROUTE_RE = re.compile(
    r"(?<![A-Za-z0-9_/-])(?:/|\.\./)?"
    r"(?:index|catalog/index|store/index|passport/index|trade/index|club/index)\.html"
    r"|device/[^\s\"')]+/index\.html"
)
LEGACY_RUNTIME_RE = re.compile(
    r"apps/web/app/site\.css|apps/web/public/interactions\.js|"
    r"@/lib/site-renderer|apps/web/lib/site-renderer\.ts|"
    r"(?<![A-Za-z0-9_/-])(?:script|styles)\.(?:js|css)(?![A-Za-z0-9_/-])"
)


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def iter_text_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        parts = set(path.relative_to(ROOT).parts)
        if parts & SKIP_DIRS:
            continue
        if path.suffix.lower() in TEXT_SUFFIXES:
            files.append(path)
    return files


def main() -> int:
    issues: list[str] = []

    for item in LEGACY_ENTRYPOINTS:
        path = ROOT / item
        if path.exists():
            issues.append(f"legacy static/runtime file still exists: {item}")

    for path in iter_text_files():
        relative = rel(path)
        if relative in ALLOWLIST:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for match in HTML_ROUTE_RE.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            issues.append(f"legacy .html route reference: {relative}:{line}: {match.group(0)}")
        for match in LEGACY_RUNTIME_RE.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            issues.append(f"legacy runtime reference: {relative}:{line}: {match.group(0)}")

    if issues:
        print("Legacy HTML audit failed:")
        for issue in issues:
            print(f"- {issue}")
        return 1

    print("No legacy static HTML/CSS/JS entrypoints or content links found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
