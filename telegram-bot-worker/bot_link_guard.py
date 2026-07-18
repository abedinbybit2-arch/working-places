#!/usr/bin/env python3
"""
Telegram group bot: instant link check + keyword auto-reply.
Uses Bot API long-polling. No separate web server required for the bot itself.

Usage:
  python telegram-bot-worker/bot_link_guard.py
  python telegram-bot-worker/bot_link_guard.py ./bot-config.json
  set BOT_TOKEN=123:ABC && python telegram-bot-worker/bot_link_guard.py

Config JSON (optional):
{
  "botToken": "123:ABC",
  "replyAllGroups": true,
  "allowedChatIds": [],
  "replyToMessage": true,
  "linkReply": "Links are not allowed in this group.",
  "linkFilter": "",
  "linkEnabled": true,
  "rules": [
    { "keyword": "hello", "mode": "contains", "reply": "Hi!", "ignoreCase": true, "enabled": true }
  ]
}
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# local import
sys.path.insert(0, str(Path(__file__).resolve().parent))
from link_detect import extract_links, has_link, link_matches_filter  # noqa: E402


def load_config(path: str | None) -> dict:
    cfg: dict = {
        "botToken": os.environ.get("BOT_TOKEN", "").strip(),
        "replyAllGroups": True,
        "allowedChatIds": [],
        "replyToMessage": True,
        "onlyGroups": True,
        "linkEnabled": True,
        "linkReply": "⚠️ Link detected. Links are not allowed here.",
        "linkFilter": "",
        "rules": [],
        "enabled": True,
    }
    p = Path(path or Path.cwd() / "bot-config.json")
    if p.is_file():
        data = json.loads(p.read_text(encoding="utf-8"))
        cfg.update(data)
        print(f"[bot] config: {p}")
    token = str(cfg.get("botToken") or "").strip()
    if not token:
        print("[bot] Missing botToken. Put bot-config.json or set BOT_TOKEN.")
        sys.exit(1)
    cfg["botToken"] = token
    return cfg


def tg(token: str, method: str, params: dict | None = None) -> dict:
    url = f"https://api.telegram.org/bot{token}/{method}"
    body = json.dumps(params or {}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {err}") from e
    if not data.get("ok"):
        raise RuntimeError(data.get("description") or f"{method} failed")
    return data["result"]


def is_group(chat: dict) -> bool:
    return chat.get("type") in ("group", "supergroup")


def allowed(cfg: dict, chat: dict) -> bool:
    if cfg.get("onlyGroups", True) and not is_group(chat):
        return False
    ids = cfg.get("allowedChatIds") or []
    if not ids:
        return True if cfg.get("replyAllGroups", True) else False
    return str(chat.get("id")) in {str(x) for x in ids}


def match_keyword(text: str, rule: dict) -> bool:
    if rule.get("enabled") is False:
        return False
    mode = (rule.get("mode") or "contains").lower()
    reply = (rule.get("reply") or "").strip()
    if not reply:
        return False

    if mode == "link":
        return link_matches_filter(
            text,
            str(rule.get("keyword") or rule.get("linkFilter") or ""),
            ignore_case=rule.get("ignoreCase", True),
        )

    key = str(rule.get("keyword") or "")
    if not key:
        return False
    msg = text
    if rule.get("ignoreCase", True):
        msg = msg.lower()
        key = key.lower()
    if mode == "exact":
        return msg.strip() == key.strip()
    if mode == "starts_with":
        return msg.startswith(key)
    if mode == "regex":
        import re

        flags = re.I if rule.get("ignoreCase", True) else 0
        try:
            return re.search(key, text, flags) is not None
        except re.error:
            return False
    return key in msg


def pick_reply(cfg: dict, text: str) -> str | None:
    """Link rules first (priority), then other rules. Instant check on each message."""
    rules = list(cfg.get("rules") or [])

    # Built-in global link guard (always first if enabled)
    if cfg.get("linkEnabled", True):
        filt = str(cfg.get("linkFilter") or "")
        if link_matches_filter(text, filt, True):
            links = extract_links(text)
            print(f"[bot] LINK DETECTED: {links}")
            return str(cfg.get("linkReply") or "Link not allowed.")

    # Explicit link-mode rules in list
    for rule in rules:
        if (rule.get("mode") or "").lower() == "link" and match_keyword(text, rule):
            print(f"[bot] link rule matched filter={rule.get('keyword')!r}")
            return str(rule.get("reply") or "").strip() or None

    for rule in rules:
        if (rule.get("mode") or "").lower() == "link":
            continue
        if match_keyword(text, rule):
            return str(rule.get("reply") or "").strip() or None
    return None


def handle_message(cfg: dict, msg: dict) -> None:
    chat = msg.get("chat") or {}
    if not chat:
        return
    if msg.get("from", {}).get("is_bot"):
        return
    if not allowed(cfg, chat):
        return

    text = (msg.get("text") or msg.get("caption") or "").strip()
    if not text:
        # entities may still hold urls without plain text in rare cases
        ents = msg.get("entities") or msg.get("caption_entities") or []
        if any(e.get("type") in ("url", "text_link") for e in ents):
            text = msg.get("text") or msg.get("caption") or "http://link"
        else:
            return

    # Telegram message entities = official link flags (hard to bypass if client parses them)
    ents = msg.get("entities") or msg.get("caption_entities") or []
    entity_link = any(e.get("type") in ("url", "text_link") for e in ents)

    reply = None
    if cfg.get("linkEnabled", True) and entity_link:
        print("[bot] LINK via Telegram entities")
        reply = str(cfg.get("linkReply") or "Link not allowed.")
    if reply is None:
        reply = pick_reply(cfg, text)

    if not reply:
        return

    payload = {"chat_id": chat["id"], "text": reply}
    if cfg.get("replyToMessage", True):
        payload["reply_to_message_id"] = msg.get("message_id")
    tg(cfg["botToken"], "sendMessage", payload)
    title = chat.get("title") or chat.get("id")
    print(f"[bot] replied in {title}")


def main() -> None:
    cfg_path = sys.argv[1] if len(sys.argv) > 1 else None
    cfg = load_config(cfg_path)
    token = cfg["botToken"]

    me = tg(token, "getMe")
    print(f"[bot] online @{me.get('username')} id={me.get('id')}")
    print("[bot] link guard:", "ON" if cfg.get("linkEnabled", True) else "OFF")
    print("[bot] privacy must be DISABLED in BotFather for group messages")

    try:
        tg(token, "deleteWebhook", {"drop_pending_updates": True})
    except Exception as e:
        print("[bot] deleteWebhook:", e)

    offset = 0
    while True:
        try:
            updates = tg(
                token,
                "getUpdates",
                {
                    "offset": offset,
                    "timeout": 30,
                    "allowed_updates": ["message", "edited_message"],
                },
            )
            for u in updates or []:
                offset = u["update_id"] + 1
                msg = u.get("message") or u.get("edited_message")
                if not msg:
                    continue
                try:
                    handle_message(cfg, msg)
                except Exception as e:
                    print("[bot] handle error:", e)
        except Exception as e:
            print("[bot] poll error:", e)
            time.sleep(3)


if __name__ == "__main__":
    main()
