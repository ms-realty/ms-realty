#!/usr/bin/env python3
"""Validate the universal language coverage contract."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "locales" / "registry.json"
BCP47 = re.compile(r"^[a-z]{2,3}(-[A-Z]{2})?$")


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def main() -> int:
    data = json.loads(REGISTRY.read_text(encoding="utf-8"))
    if data.get("policy") != "dynamic_approved":
        fail("policy must be dynamic_approved")
    if data.get("source_locale") != "bg":
        fail("source locale must be bg")
    if data.get("url_strategy") != "locale_prefix":
        fail("url strategy must be locale_prefix")
    if data.get("admin_locales") != ["bg", "ru", "en"]:
        fail("admin locales must be bg, ru, en")

    locales = data.get("locales") or []
    by_code = {locale["code"]: locale for locale in locales}
    if len(by_code) != len(locales):
        fail("locale codes must be unique")

    required_public = {"bg", "en", "de", "nl", "ru", "el", "he"}
    missing = required_public - set(by_code)
    if missing:
        fail(f"missing seeded public locales: {sorted(missing)}")

    for code, locale in by_code.items():
        if not BCP47.match(code):
            fail(f"invalid BCP 47-ish code: {code}")
        if locale.get("direction") not in {"ltr", "rtl"}:
            fail(f"invalid direction for {code}")
        if code in required_public and not (locale.get("public_enabled") and locale.get("indexable")):
            fail(f"{code} must be public and indexable")
        fallback = locale.get("fallback_locale")
        if fallback and fallback not in by_code:
            fail(f"{code} fallback does not exist: {fallback}")
        if locale.get("translation_provider_mode") not in {"human", "hermes_draft", "external_import"}:
            fail(f"invalid provider mode for {code}")
        segments = locale.get("route_segments") or {}
        if not segments.get("listing") or not segments.get("search"):
            fail(f"missing route segments for {code}")

    if by_code["he"].get("direction") != "rtl":
        fail("Hebrew must be RTL")
    if by_code["el"].get("direction") != "ltr":
        fail("Greek must be LTR")
    if by_code["fr"].get("indexable"):
        fail("disabled French example must not be indexable")

    print("PASS: locale registry supports dynamic approved public locales")
    print("PASS: admin CMS/CRM locales are bg, ru, en")
    print("PASS: Greek and Hebrew website locales are seeded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
