#!/usr/bin/env python3
"""Static QA checks for the MS Realty mobile/elderly screen pack."""

from __future__ import annotations

import csv
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREEN = ROOT / "makler-realty-design-system" / "project" / "ui_kits" / "remaining" / "index.html"
ARTIFACT = ROOT / "migration" / "artifacts" / "20260704-211155"


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def require(text: str, needle: str, label: str) -> None:
    if needle not in text:
        fail(f"Missing {label}: {needle}")


def count_csv(path: Path) -> int:
    csv.field_size_limit(sys.maxsize)
    with path.open(newline="", encoding="utf-8") as handle:
        return sum(1 for _ in csv.DictReader(handle))


def main() -> int:
    if not SCREEN.exists():
        fail(f"Missing screen pack: {SCREEN}")

    html = SCREEN.read_text(encoding="utf-8")
    required_markers = {
        "viewport": '<meta name="viewport"',
        "mobile search tab": "mobile-search",
        "listing detail tab": "listing-detail",
        "sell property tab": "sell-property",
        "lead inbox tab": "lead-inbox",
        "property editor tab": "property-editor",
        "touch target": "--touch: 48px",
        "sticky mobile actions": "mobile-actions",
        "phone action": "Phone",
        "viber/message action": "Viber",
        "photo sphere viewer field": "Photo Sphere Viewer",
        "psv mount": "psv-editor-preview",
        "accessible caption field": "Accessibility caption",
        "language coverage": "BG · EN · DE · NL · RU",
        "no homepage redirect assertion": "No homepage redirect assumption",
    }
    for label, marker in required_markers.items():
        require(html, marker, label)

    forbidden_pairs = ["Sandanski sea", "Сандански море", "Сандански морски"]
    for phrase in forbidden_pairs:
        if phrase in html:
            fail(f"Forbidden geography claim found: {phrase}")

    url_rows = count_csv(ARTIFACT / "url-inventory.csv")
    meta_rows = count_csv(ARTIFACT / "metadata-inventory.csv")
    redirect_rows = count_csv(ARTIFACT / "redirect-map-draft.csv")
    if not (url_rows == meta_rows == redirect_rows == 457):
        fail(f"Unexpected crawl row counts: url={url_rows}, metadata={meta_rows}, redirect={redirect_rows}")

    media_rows = count_csv(ARTIFACT / "media-inventory.csv")
    if media_rows < 10000:
        fail(f"Media inventory looks too small: {media_rows}")

    print("PASS: mobile/elderly static QA markers present")
    print(f"PASS: crawl rows url={url_rows} metadata={meta_rows} media={media_rows} redirect={redirect_rows}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
