"""Non-generative, manually scoped background repair. Requires explicit operator approval.

Only background pixels inside reviewed masks may change; lossless WebP preserves
all other decoded pixels exactly. Never use this to hide physical device wear.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


def validate_rect(rect):
    if (len(rect) != 4 or not all(isinstance(v, (int, float)) and np.isfinite(v) for v in rect)
            or not (0 <= rect[0] < rect[2] <= 1 and 0 <= rect[1] < rect[3] <= 1)):
        raise ValueError("Invalid normalized review rectangle")


def repair_spot(image, region, protected_rects, center=None):
    validate_rect(region)
    if not protected_rects:
        raise ValueError("Explicit device protection is required")
    for rect in protected_rects:
        validate_rect(rect)
    source = np.asarray(image.convert("RGB"))
    height, width = source.shape[:2]
    x0, y0, x1, y1 = [int(v * s) for v, s in zip(region, [width, height, width, height])]
    patch = source[y0:y1, x0:x1].astype(np.float64)
    if min(patch.shape[:2]) <= 42:
        raise ValueError("Reviewed window is too small")
    yy, xx = np.mgrid[:patch.shape[0], :patch.shape[1]]
    nx, ny = xx / patch.shape[1], yy / patch.shape[0]
    design = np.stack([np.ones_like(nx), nx, ny, nx*nx, nx*ny, ny*ny], axis=-1)
    rim = (xx < 14) | (yy < 14) | (xx >= patch.shape[1] - 14) | (yy >= patch.shape[0] - 14)
    fit = np.linalg.lstsq(design[rim], patch[rim], rcond=None)[0]
    plane = design @ fit
    residual = (patch - plane).mean(axis=-1)
    # Find the known soft grey blemish inside the reviewed background window.
    residual_image = Image.fromarray(np.clip(residual + 128, 0, 255).astype(np.uint8))
    smooth = np.asarray(residual_image.filter(ImageFilter.GaussianBlur(8))).astype(float) - 128
    inner = (xx > 20) & (yy > 20) & (xx < patch.shape[1] - 20) & (yy < patch.shape[0] - 20)
    if not inner.any() or float(smooth[inner].min()) > -3:
        raise ValueError("No confirmed background blemish in the reviewed window")
    if center is None:
        cy, cx = np.unravel_index(np.where(inner, smooth, np.inf).argmin(), smooth.shape)
    else:
        cx, cy = center[0] - x0, center[1] - y0
        if not (0 <= cx < patch.shape[1] and 0 <= cy < patch.shape[0]):
            raise ValueError("Reviewed blemish center is outside the mask window")
    distance = np.sqrt(((xx - cx) / 110) ** 2 + ((yy - cy) / 70) ** 2)
    alpha = np.clip((1.3 - distance) / 0.3, 0, 1)
    outer = distance >= 1.3
    noise = patch[outer] - plane[outer]
    scale = np.clip(noise.std(axis=0), 0, 1.8)
    seed = int(hashlib.sha256(source.tobytes()).hexdigest()[:16], 16)
    rng = np.random.default_rng(seed)
    # Harmonic interpolation follows the real boundary shading, without generating
    # device pixels or introducing the flat-plane halo seen in the first rehearsal.
    size = (max(2, patch.shape[1]//4), max(2, patch.shape[0]//4))
    coarse = np.asarray(Image.fromarray(patch.astype(np.uint8)).resize(size, Image.Resampling.BILINEAR)).astype(float)
    fill = np.asarray(Image.fromarray((alpha > 0).astype(np.uint8)*255).resize(size, Image.Resampling.NEAREST)) > 0
    initial = np.asarray(Image.fromarray(np.clip(plane,0,255).astype(np.uint8)).resize(size, Image.Resampling.BILINEAR)).astype(float)
    coarse[fill] = initial[fill]
    for _ in range(1800):
        padded = np.pad(coarse, ((1,1),(1,1),(0,0)), mode="edge")
        average = (padded[:-2,1:-1] + padded[2:,1:-1] + padded[1:-1,:-2] + padded[1:-1,2:]) / 4
        coarse[fill] = average[fill]
    replacement = np.asarray(Image.fromarray(coarse.round().clip(0,255).astype(np.uint8)).resize(
        (patch.shape[1],patch.shape[0]), Image.Resampling.BICUBIC)).astype(float)
    replacement += rng.normal(size=patch.shape) * scale
    destination = source.copy()
    destination[y0:y1, x0:x1] = np.clip(
        patch * (1 - alpha[..., None]) + replacement * alpha[..., None], 0, 255
    ).round().astype(np.uint8)
    mask = np.zeros((height, width), dtype=bool)
    mask[y0:y1, x0:x1] = alpha > 0
    for rect in protected_rects:
        left, top, right, bottom = [int(v * s) for v, s in zip(rect, [width, height, width, height])]
        if mask[top:bottom, left:right].any():
            raise ValueError("Retouch mask overlaps protected device/shadow region")
    if np.any(source[~mask] != destination[~mask]):
        raise ValueError("Pixels outside the approved mask changed")
    return Image.fromarray(destination), mask, {"center": [int(cx + x0), int(cy + y0)]}


def repair_bottom_seam(image, start=0.955, protected_bottom=0.72):
    if not (0 <= protected_bottom < start < 1):
        raise ValueError("Invalid bottom seam range")
    source = np.asarray(image.convert("RGB"))
    height, width = source.shape[:2]
    top = int(start * height)
    if top - 70 <= protected_bottom * height:
        raise ValueError("Bottom repair overlaps protected device region")
    strip = source[top-70:top-20].astype(float)
    yy, xx = np.mgrid[:strip.shape[0], :width]
    design = np.stack([np.ones_like(xx), xx / width, yy / height], axis=-1)
    fit = np.linalg.lstsq(design.reshape(-1, 3), strip.reshape(-1, 3), rcond=None)[0]
    ys, xs = np.mgrid[top:height, :width]
    extrapolated = np.stack([np.ones_like(xs), xs / width, (ys - (top - 70)) / height], axis=-1) @ fit
    alpha = np.clip((ys - top) / 22, 0, 1)
    destination = source.copy()
    destination[top:] = np.clip(source[top:] * (1-alpha[..., None]) + extrapolated * alpha[..., None], 0, 255).round().astype(np.uint8)
    mask = np.zeros((height, width), dtype=bool)
    mask[top:] = alpha > 0
    return Image.fromarray(destination), mask


def comparison_sheet(results, manifest, folder, output):
    lookup = {(a["sku"], a["sort"]): a for a in manifest["assets"]}
    sheet = Image.new("RGB", (800, len(results) * 174), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
    for index, result in enumerate(results):
        asset = lookup[result["sku"], result["sort"]]
        before = Image.open(folder / asset["path"])
        after = Image.open(result["path"])
        draw.text((0, index * 174), f"{result['sku']} / {result['sort']} - before / after", fill="black", font=font)
        for col, photo in enumerate([before, after]):
            w, h = photo.size
            crop = photo.crop((int(w * .86), int(h * .70), w, h)).resize((380, 144))
            sheet.paste(crop, (col * 400, index * 174 + 24))
    sheet.save(output / "background-before-after.png")


def crop_review(manifest, folder):
    assets = manifest["assets"]
    font_path = Path("C:/Windows/Fonts/arial.ttf")
    font = ImageFont.truetype(str(font_path), 18) if font_path.exists() else ImageFont.load_default()
    for start in range(0, len(assets), 36):
        group = assets[start:start+36]
        sheet = Image.new("RGB", (6*210, 6*178), "white")
        draw = ImageDraw.Draw(sheet)
        for pos, asset in enumerate(group):
            photo = Image.open(folder / asset["path"])
            w, h = photo.size
            crop = photo.crop((int(w*.87), int(h*.70), w, h)).resize((200, 150))
            x, y = (pos % 6)*210, (pos // 6)*178
            draw.text((x, y), f"{asset['sku']} / {asset['sort']}", font=font, fill="black")
            sheet.paste(crop, (x, y+24))
        sheet.save(folder / "sheets" / f"background-crops-{start//36+1}.png")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--review-dir", required=True)
    parser.add_argument("--decisions")
    parser.add_argument("--output-dir")
    parser.add_argument("--crop-review", action="store_true")
    args = parser.parse_args()
    folder = Path(args.review_dir).resolve()
    manifest = json.loads((folder / "downloaded-assets.json").read_text(encoding="utf-8"))
    if args.crop_review:
        crop_review(manifest, folder)
        return
    decisions = json.loads(Path(args.decisions).read_text(encoding="utf-8"))
    output = Path(args.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)
    results = []
    if len({(d["sku"], d["sort"]) for d in decisions["retouch"]}) != len(decisions["retouch"]):
        raise ValueError("Duplicate retouch decisions")
    for decision in decisions["retouch"]:
        asset = next(a for a in manifest["assets"] if a["sku"] == decision["sku"] and a["sort"] == decision["sort"])
        source = folder / asset["path"]
        if hashlib.sha256(source.read_bytes()).hexdigest() != asset["sha256"]:
            raise ValueError("Original asset changed")
        before = Image.open(source).convert("RGB")
        current = before.copy()
        mask = np.zeros((before.height, before.width), dtype=bool)
        details = {}
        if decision.get("spot"):
            if not decision.get("center"):
                raise ValueError("Production retouch requires a manually reviewed blemish center")
            current, applied, details = repair_spot(current, decision["spot"], decision["protected_rects"], decision["center"])
            mask |= applied
        if decision.get("bottom_seam"):
            current, applied = repair_bottom_seam(current, decision["bottom_seam"])
            mask |= applied
        if not decision.get("protected_rects"):
            raise ValueError("Explicit device protection is required for every repair")
        for rect in decision["protected_rects"]:
            validate_rect(rect)
            left, top, right, bottom = [int(v * s) for v, s in zip(rect, [before.width, before.height, before.width, before.height])]
            if mask[top:bottom, left:right].any():
                raise ValueError("Combined retouch mask overlaps protected device/shadow region")
        name = f"{asset['sku'].replace('т','t')}-{asset['sort']}.webp"
        target = output / name
        current.save(target, format="WEBP", lossless=True, method=6)
        decoded = np.asarray(Image.open(target).convert("RGB"))
        original = np.asarray(before)
        if np.any(decoded[~mask] != original[~mask]):
            raise ValueError("Lossless delivery failed the outside-mask invariant")
        Image.fromarray((mask*255).astype(np.uint8)).save(output / name.replace(".webp", "-mask.png"))
        results.append({"sku": asset["sku"], "sort": asset["sort"], "original_file_id": asset["file_id"],
                        "path": str(target), "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                        "previous_sha256": asset["sha256"], "bytes": target.stat().st_size,
                        "changed_pixels": int(np.any(decoded != original, axis=-1).sum()),
                        "mask_pixels": int(mask.sum()), "outside_mask_changed_pixels": 0,
                        "width": before.width, "height": before.height, **details})
    (output / "retouch-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    comparison_sheet(results, manifest, folder, output)
    print(json.dumps({"retouched":len(results), "outside_mask_changes":0, "maximum_bytes":max(r['bytes'] for r in results)}))


if __name__ == "__main__":
    main()
