#!/usr/bin/env python3
"""Small internal-only media transcoder for communications attachments."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


MAX_BYTES = 20_000_000
MAX_IMAGE_PIXELS = int(os.environ.get("SANITIZER_MAX_IMAGE_PIXELS", "40000000"))
MAX_AUDIO_SECONDS = float(os.environ.get("SANITIZER_MAX_AUDIO_SECONDS", "1800"))
MAX_VIDEO_SECONDS = float(os.environ.get("SANITIZER_MAX_VIDEO_SECONDS", "600"))
PROCESS_TIMEOUT = int(os.environ.get("SANITIZER_PROCESS_TIMEOUT_SECONDS", "50"))
VERSION = "isvoi-safe-media/1"
WORKER = threading.BoundedSemaphore(1)

FORMATS = {
    "image/jpeg": ("image", "jpg", "image/jpeg"),
    "image/png": ("image", "png", "image/png"),
    "image/webp": ("image", "webp", "image/webp"),
    "audio/ogg": ("audio", "ogg", "audio/ogg"),
    "audio/ogg; codecs=opus": ("audio", "ogg", "audio/ogg"),
    "audio/opus": ("audio", "ogg", "audio/ogg"),
    "audio/mpeg": ("audio", "ogg", "audio/ogg"),
    "audio/wav": ("audio", "ogg", "audio/ogg"),
    "audio/x-wav": ("audio", "ogg", "audio/ogg"),
    "video/mp4": ("video", "mp4", "video/mp4"),
    "video/webm": ("video", "mp4", "video/mp4"),
}


class Rejected(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def run(command: list[str], timeout: int = PROCESS_TIMEOUT) -> str:
    try:
        completed = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            timeout=timeout,
            text=True,
            env={
                "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                "HOME": "/tmp",
                "VIPS_CONCURRENCY": "1",
                "OMP_NUM_THREADS": "1",
                "MAGICK_THREAD_LIMIT": "1",
            },
        )
        return completed.stdout.strip()
    except subprocess.TimeoutExpired as error:
        raise Rejected("PROCESSING_LIMIT_EXCEEDED") from error
    except (subprocess.CalledProcessError, OSError) as error:
        raise Rejected("MEDIA_SANITIZATION_FAILED") from error


def media_duration(source: Path) -> float:
    value = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(source),
        ],
        min(PROCESS_TIMEOUT, 15),
    )
    try:
        return float(value)
    except (TypeError, ValueError) as error:
        raise Rejected("MEDIA_SANITIZATION_FAILED") from error


def sanitize_image(source: Path, output: Path, extension: str) -> None:
    try:
        width = int(run(["vipsheader", "-f", "width", str(source)], 15))
        height = int(run(["vipsheader", "-f", "height", str(source)], 15))
    except ValueError as error:
        raise Rejected("MEDIA_SANITIZATION_FAILED") from error
    if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
        raise Rejected("IMAGE_DIMENSIONS_EXCEEDED")
    options = {
        "jpg": "[Q=88,strip,optimize_coding]",
        "png": "[strip,compression=9]",
        "webp": "[Q=85,strip]",
    }[extension]
    run(["vips", "autorot", str(source), f"{output}{options}"])


def sanitize_audio(source: Path, output: Path) -> None:
    duration = media_duration(source)
    if duration <= 0 or duration > MAX_AUDIO_SECONDS:
        raise Rejected("MEDIA_DURATION_EXCEEDED")
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-i",
            str(source),
            "-map",
            "0:a:0",
            "-vn",
            "-sn",
            "-dn",
            "-map_metadata",
            "-1",
            "-c:a",
            "libopus",
            "-threads",
            "1",
            "-b:a",
            "96k",
            "-vbr",
            "on",
            "-application",
            "audio",
            "-f",
            "ogg",
            str(output),
        ]
    )


def sanitize_video(source: Path, output: Path) -> None:
    duration = media_duration(source)
    if duration <= 0 or duration > MAX_VIDEO_SECONDS:
        raise Rejected("MEDIA_DURATION_EXCEEDED")
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-sn",
            "-dn",
            "-map_metadata",
            "-1",
            "-c:v",
            "libx264",
            "-threads",
            "1",
            "-preset",
            "veryfast",
            "-crf",
            "24",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            "-f",
            "mp4",
            str(output),
        ]
    )


def sanitize(payload: bytes, mime: str, requested_kind: str) -> tuple[bytes, str, str, str]:
    normalized_mime = mime.strip().lower()
    format_info = FORMATS.get(normalized_mime)
    if not format_info:
        raise Rejected("FILE_FORMAT_NOT_ALLOWED")
    family, extension, output_mime = format_info
    if requested_kind not in ({"image"} if family == "image" else {"voice", "audio"} if family == "audio" else {"video"}):
        raise Rejected("FILE_TYPE_MISMATCH")
    with tempfile.TemporaryDirectory(prefix="isvoi-") as temporary:
        root = Path(temporary)
        source = root / "source.bin"
        output = root / f"sanitized.{extension}"
        source.write_bytes(payload)
        if family == "image":
            sanitize_image(source, output, extension)
        elif family == "audio":
            sanitize_audio(source, output)
        else:
            sanitize_video(source, output)
        result = output.read_bytes()
        if not result or len(result) > MAX_BYTES:
            raise Rejected("SANITIZED_FILE_TOO_LARGE")
        return result, output_mime, extension, requested_kind


class Handler(BaseHTTPRequestHandler):
    server_version = "isvoi-media-sanitizer"

    def log_message(self, format: str, *args: object) -> None:
        return

    def json_error(self, status: int, code: str) -> None:
        body = json.dumps({"error_code": code}, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path != "/healthz":
            self.json_error(404, "NOT_FOUND")
            return
        body = json.dumps({"status": "ok", "version": VERSION}, separators=(",", ":")).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if self.path != "/v1/sanitize":
            self.json_error(404, "NOT_FOUND")
            return
        try:
            self.connection.settimeout(15)
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.json_error(400, "INVALID_CONTENT_LENGTH")
            return
        if length <= 0 or length > MAX_BYTES:
            self.json_error(413, "FILE_TOO_LARGE")
            return
        if not WORKER.acquire(blocking=False):
            self.json_error(503, "SANITIZER_BUSY")
            return
        try:
            payload = self.rfile.read(length)
            if len(payload) != length:
                self.json_error(400, "FILE_SIZE_MISMATCH")
                return
            result, mime, extension, kind = sanitize(
                payload,
                self.headers.get("X-Input-Mime", ""),
                self.headers.get("X-Input-Kind", ""),
            )
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(result)))
            self.send_header("X-Sanitized-Extension", extension)
            self.send_header("X-Sanitized-Kind", kind)
            self.send_header("X-Sanitizer-Version", VERSION)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(result)
        except Rejected as error:
            self.json_error(415 if error.code in {"FILE_FORMAT_NOT_ALLOWED", "FILE_TYPE_MISMATCH"} else 422, error.code)
        except Exception:
            self.json_error(503, "SANITIZER_UNAVAILABLE")
        finally:
            WORKER.release()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    server.daemon_threads = True
    server.serve_forever()
