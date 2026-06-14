"""Send notifications to a Telegram chat (e.g. new leads, low stock, reports).

Intended to be triggered by Directus flows/webhooks or by other scripts in this
folder (for example, after `import_devices_from_excel.py` finishes, or when a
new row lands in the `leads` collection).

Usage (planned):
    python notify_telegram.py --text "Новая заявка: iPhone 13 Pro"

Environment (load from .env, never hard-code secrets):
    TELEGRAM_BOT_TOKEN    bot token from @BotFather
    TELEGRAM_CHAT_ID      target chat / channel id

This is a SKELETON: the HTTP send is left as a TODO.
"""

from __future__ import annotations

import argparse
import os

# import requests
# from dotenv import load_dotenv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send a Telegram message.")
    parser.add_argument("--text", required=True, help="Message text (Markdown/HTML allowed).")
    return parser.parse_args()


def load_config() -> dict[str, str]:
    """Read Telegram credentials from the environment."""
    # load_dotenv()
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        raise SystemExit("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set (see .env.example).")
    return {"token": token, "chat_id": chat_id}


def send_message(cfg: dict[str, str], text: str) -> None:
    """POST to the Telegram Bot API sendMessage endpoint.

    TODO:
      url = f"https://api.telegram.org/bot{cfg['token']}/sendMessage"
      requests.post(url, json={"chat_id": cfg["chat_id"], "text": text}, timeout=10)
      and raise_for_status().
    """
    raise NotImplementedError("TODO: implement Telegram sendMessage")


def main() -> None:
    args = parse_args()
    cfg = load_config()
    send_message(cfg, args.text)


if __name__ == "__main__":
    main()
