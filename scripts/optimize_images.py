"""Optimize and convert device images to web-friendly WebP.

Staff upload raw photos (often large JPEG/PNG); this job downscales them to a
sensible max dimension and re-encodes to WebP so the catalog/passport pages stay
fast. It can run over a local folder or, later, over files pulled from the
Directus file library.

Usage (planned):
    python optimize_images.py --src ./incoming --out ./optimized [--max 2000] [--quality 82]

This is a SKELETON: the Pillow pipeline is left as a TODO.
"""

from __future__ import annotations

import argparse
from pathlib import Path

# from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Optimize images to WebP.")
    parser.add_argument("--src", required=True, help="Source folder of raw images.")
    parser.add_argument("--out", required=True, help="Destination folder for optimized WebP.")
    parser.add_argument("--max", type=int, default=2000, help="Max width/height in px.")
    parser.add_argument("--quality", type=int, default=82, help="WebP quality (0-100).")
    return parser.parse_args()


def iter_images(src: Path):
    """Yield image paths under src (jpg/jpeg/png)."""
    for ext in ("*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG"):
        yield from src.rglob(ext)


def optimize_one(path: Path, out_dir: Path, max_dim: int, quality: int) -> Path:
    """Downscale to fit max_dim and save as WebP.

    TODO:
      - Open with Pillow, apply EXIF transpose.
      - thumbnail((max_dim, max_dim)) to keep aspect ratio.
      - save(out_path, format="WEBP", quality=quality, method=6).
    """
    raise NotImplementedError("TODO: implement Pillow optimization")


def main() -> None:
    args = parse_args()
    src = Path(args.src)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for image_path in iter_images(src):
        optimize_one(image_path, out, args.max, args.quality)


if __name__ == "__main__":
    main()
