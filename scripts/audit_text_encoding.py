"""Scan repository text files for common mojibake / replacement characters.

Usage:
    python scripts/audit_text_encoding.py
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


SKIP_DIRS = {
    ".git",
    ".next",
    ".venv",
    "node_modules",
    "__pycache__",
}

TEXT_EXTENSIONS = {
    ".css",
    ".csv",
    ".env",
    ".example",
    ".html",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".py",
    ".svg",
    ".ts",
    ".tsx",
    ".txt",
    ".yml",
}

MOJIBAKE_PATTERNS = [
    "\ufffd",
    "����",
    "Ð",
    "Ñ",
    "â€”",
    "â€“",
    "â€™",
    "â€œ",
    "â€",
    "вЂ",
    "в‚",
    "Р°",
    "Р±",
    "РІ",
    "Рі",
    "Рґ",
    "Рµ",
    "Р¶",
    "Р·",
    "Рё",
    "Р№",
    "Рє",
    "Р»",
    "Рј",
    "РЅ",
    "Рѕ",
    "Рї",
    "РЎ",
    "Рќ",
    "Рџ",
    "Рћ",
    "Р’",
    "Рђ",
    "Рљ",
    "Рњ",
    "Рў",
    "СЂ",
    "СЃ",
    "С‚",
    "Сѓ",
    "С„",
    "С…",
    "С†",
    "С‡",
    "С€",
    "С‰",
    "С‹",
    "СЊ",
    "СЌ",
    "СЋ",
    "СЏ",
]

PATTERN = re.compile("|".join(re.escape(item) for item in MOJIBAKE_PATTERNS))


def should_skip(path: Path) -> bool:
    if path.name == "audit_text_encoding.py":
        return True
    return any(part in SKIP_DIRS for part in path.parts)


def is_text_candidate(path: Path) -> bool:
    if path.name in {".env.example"}:
        return True
    return path.suffix.lower() in TEXT_EXTENSIONS


def scan(root: Path) -> list[tuple[Path, int, str]]:
    findings: list[tuple[Path, int, str]] = []
    for path in sorted(root.rglob("*")):
        if should_skip(path) or not path.is_file() or not is_text_candidate(path):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            findings.append((path, exc.lineno or 0, "file is not valid UTF-8"))
            continue
        for index, line in enumerate(text.splitlines(), start=1):
            if PATTERN.search(line):
                findings.append((path, index, line.strip()[:220]))
    return findings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit repository text encoding.")
    parser.add_argument("--root", default=".", help="Repository root to scan.")
    return parser.parse_args()


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    args = parse_args()
    root = Path(args.root).resolve()
    findings = scan(root)
    if findings:
        for path, line, excerpt in findings:
            rel = path.relative_to(root)
            print(f"{rel}:{line}: {excerpt}")
        raise SystemExit(1)
    print("No mojibake markers found.")


if __name__ == "__main__":
    main()
