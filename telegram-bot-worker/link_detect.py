"""
Aggressive link / URL detection for Telegram group auto-reply.
Catches common bypass tricks: spaces, [.], (dot), unicode dots, hxxp, t.me, bare domains, etc.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable

# Zero-width / invisible chars often used to break detectors
_INVISIBLE = re.compile(
    r"[\u200b\u200c\u200d\u2060\ufeff\u00ad\u200e\u200f\u202a-\u202e\u2066-\u2069]"
)

# Homoglyph / alternate dots → normal dot
_DOT_MAP = str.maketrans(
    {
        "。": ".",
        "．": ".",
        "｡": ".",
        "·": ".",
        "•": ".",
        "‧": ".",
        "∙": ".",
        "⋅": ".",
        "﹒": ".",
        "․": ".",
        "。": ".",
        "。": ".",
        "۔": ".",  # Arabic full stop sometimes abused
    }
)

# Common "hxxp" / obfuscation replacements after normalize
_OBFUSCATION_FIXES = [
    (re.compile(r"h\s*x+\s*x+\s*p\s*s?", re.I), "http"),
    (re.compile(r"h\s*t\s*t\s*p\s*s?", re.I), lambda m: "https" if "s" in m.group(0).lower() else "http"),
    (re.compile(r"\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|\s+dot\s+", re.I), "."),
    (re.compile(r"\[\s*\.\s*\]|\(\s*\.\s*\)"), "."),
    (re.compile(r"\s*/\s*/\s*"), "://"),
    (re.compile(r":\s*/\s*/"), "://"),
]

# Direct URL patterns on raw + normalized text
_URL_PATTERNS = [
    re.compile(r"(?:https?|ftp|hxxp|hxxps|tg|ton|magnet):[/\s]*[^\s]+", re.I),
    re.compile(r"www\s*[.\u3002]\s*[a-z0-9\-]+", re.I),
    re.compile(r"(?:t|telegram)\s*[.\u3002\[\(]\s*me\b[^\s]*", re.I),
    re.compile(r"telegram\s*[.\u3002]\s*org\b[^\s]*", re.I),
    re.compile(r"\b[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?(?:\s*[.\u3002]\s*[a-z0-9\-]{2,}){1,6}(?:\s*/\s*\S*)?", re.I),
    re.compile(r"\b\d{1,3}(?:\s*[.\u3002]\s*\d{1,3}){3}(?::\d{2,5})?(?:\s*/\s*\S*)?"),
    re.compile(r"(?:bit\s*[.\u3002]\s*ly|goo\s*[.\u3002]\s*gl|tinyurl|t\s*[.\u3002]\s*co|is\s*[.\u3002]\s*gd|cutt\s*[.\u3002]\s*ly)\b[^\s]*", re.I),
]

# After aggressive denoise — cleaner URL match
_CLEAN_URL = re.compile(
    r"(?i)"
    r"(?:(?:https?|ftp|tg|ton)://|www\.)[^\s<>'\"）】]+"
    r"|(?:t\.me|telegram\.me|telegram\.dog)/[^\s<>'\"]+"
    r"|\b[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?){1,6}(?::\d{2,5})?(?:/[^\s]*)?"
)

_TLD_HINT = re.compile(
    r"(?i)\.(?:com|net|org|io|co|me|xyz|info|biz|app|dev|shop|online|site|link|click|top|icu|ru|cn|uk|de|fr|in|bd|cc|tk|ml|ga|cf|ly|to|tv|gg|ws|pw)\b"
)

# "join chat" / invite obfuscation
_INVITE = re.compile(r"(?i)(?:joinchat|join\s*chat|\+[a-z0-9_-]{8,}|tg://join\?[^\s]+)")


def _strip_invisible(text: str) -> str:
    return _INVISIBLE.sub("", text or "")


def _normalize(text: str) -> str:
    t = _strip_invisible(text)
    t = unicodedata.normalize("NFKC", t)
    t = t.translate(_DOT_MAP)
    # remove zero spaces between letters of schemes: h t t p
    return t


def _denoise(text: str) -> str:
    """Collapse bypass spacing / [dot] tricks into something matchable."""
    t = _normalize(text)
    # remove spaces between single alphanumerics: y o u t u b e . c o m
    t = re.sub(r"(?<=[A-Za-z0-9])\s+(?=[A-Za-z0-9./:_-])", "", t)
    for pat, repl in _OBFUSCATION_FIXES:
        t = pat.sub(repl, t)
    # leftover spaces around dots/slashes
    t = re.sub(r"\s*\.\s*", ".", t)
    t = re.sub(r"\s*/\s*", "/", t)
    t = re.sub(r"\s*:\s*", ":", t)
    return t


def extract_links(text: str) -> list[str]:
    if not text or not str(text).strip():
        return []

    raw = str(text)
    found: list[str] = []

    def add(items: Iterable[str]) -> None:
        for x in items:
            x = x.strip().strip(".,;:!?)]}\"'>")
            if x and x not in found:
                found.append(x)

    variants = [raw, _normalize(raw), _denoise(raw)]

    for v in variants:
        for pat in _URL_PATTERNS:
            add(pat.findall(v))
        add(_CLEAN_URL.findall(v))
        if _INVITE.search(v):
            add([_INVITE.search(v).group(0)])  # type: ignore

    # Extra: denoised text has TLD + looks like host
    d = _denoise(raw)
    if _TLD_HINT.search(d) and re.search(r"[a-z0-9]\.[a-z]{2,}", d, re.I):
        for m in _CLEAN_URL.finditer(d):
            add([m.group(0)])

    return found


def has_link(text: str) -> bool:
    return len(extract_links(text)) > 0


def link_matches_filter(text: str, domain_filter: str = "", ignore_case: bool = True) -> bool:
    """
    True if message contains a link.
    If domain_filter set, at least one link must contain that substring (e.g. youtube.com).
    """
    links = extract_links(text)
    if not links:
        return False
    f = (domain_filter or "").strip()
    if not f:
        return True
    if ignore_case:
        f = f.lower()
        return any(f in link.lower() for link in links)
    return any(f in link for link in links)


if __name__ == "__main__":
    tests = [
        "hello https://google.com",
        "go to www.youtube.com/watch?v=1",
        "t.me/joinchat/xxxxx",
        "h t t p s : / / evil . com / a",
        "site[.]com/path",
        "hxxps://bad.com",
        "y o u t u b e . c o m",
        "just text no link",
        "192.168.1.1:8080/x",
        "telegram。me/channel",
    ]
    for t in tests:
        print(repr(t), "=>", has_link(t), extract_links(t))
