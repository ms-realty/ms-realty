"""Propose 301 targets for the legacy taxonomy URLs that are currently 410.

The migration approved a terminal decision for all 457 legacy URLs, but only the
165 listing URLs became redirects. The rest are Gone, which throws away the
ranking of the pages that actually earned it: the property type archives, the
buy and rent archives, and the resort pages for the two towns the new site
covers. This proposes one target per URL, and deliberately leaves everything
else at 410 rather than inventing a destination.

A target is only proposed when an indexable equivalent will exist:
  * property type archives  -> the indexable search facet for that family
  * /property/sell and rent -> the offer_type facet
  * Sandanski and Petrich   -> the location page, which already exists
Bansko, Melnik, Sveti Vlas, Blagoevgrad, the Greek resorts, the "elite realty"
archive, the floor/bedroom/balcony facets and the internal flags keep 410:
redirecting them to a generic page would be a soft 404, not preservation.

Usage:
    python3 migration/build_legacy_taxonomy_redirects.py \
        --workbook production/data/redirect-approval-workbook.csv \
        --registry locales/registry.json \
        --out production/data/legacy-taxonomy-redirect-proposal.json \
        --review migration/reviews/legacy-taxonomy/proposal.csv
"""

from __future__ import annotations

import argparse
import collections
import csv
import json
import pathlib
import urllib.parse

# The old theme's property type archive slugs, mapped onto the six canonical
# families in production/lib/listing-facts.mjs. Studio was a one room apartment;
# a floor of a house and a villa are both houses; offices, office buildings and
# industrial buildings are all commercial in the new taxonomy.
CATEGORY_TYPE_TO_FAMILY = {
    "apartment": "apartment",
    "studio": "apartment",
    "dom": "house",
    "villa": "house",
    "house-floor": "house",
    "участок-земли": "plot",
    "сельскохозяйственная-земля": "agricultural_land",
    "commercial-area": "commercial",
    "office": "commercial",
    "office-building": "commercial",
    "industrial-building": "commercial",
    "hotel": "hotel",
}

# The old site's "property" taxonomy was the offer type.
PROPERTY_TO_OFFER = {"sell": "sale", "rent": "rent"}

# Resort archives that have an indexable location page on the new site. Every
# other resort keeps 410 until the catalog carries inventory there.
RESORT_TO_LOCATION = {
    "недвижимость-в-сандански": "sandanski",
    "petrich": "petrich",
}

LOCALE_PREFIXES = {"bg", "en", "de", "nl", "ru"}


def locale_for(domain: str, prefix: str) -> str:
    """The old URL's language. A bare .com path is Bulgarian, .ru is Russian."""
    if prefix:
        return prefix
    return "ru" if domain.endswith(".ru") else "bg"


def segments_for(registry: dict) -> dict[str, dict]:
    return {locale["code"]: locale["route_segments"] for locale in registry["locales"]}


def propose(old_url: str, domain: str, segments: dict[str, dict]) -> tuple[str, str, str]:
    """Return (decision, target_path, reason) for one legacy URL."""
    path = urllib.parse.unquote(urllib.parse.urlparse(old_url).path)
    parts = [part for part in path.split("/") if part]
    if not parts:
        return ("410", "", "site root is handled by the preservation contract")

    prefix = parts[0] if parts[0] in LOCALE_PREFIXES else ""
    rest = parts[1:] if prefix else parts
    locale = locale_for(domain, prefix)
    routes = segments.get(locale)
    if not routes or len(rest) < 2:
        return ("410", "", "no localized route for this URL")

    taxonomy, slug = rest[0], rest[1]
    if taxonomy == "category-type":
        family = CATEGORY_TYPE_TO_FAMILY.get(slug)
        if not family:
            return ("410", "", f"no canonical family for category-type/{slug}")
        return ("301", f"/{locale}/{routes['search']}?property_family={family}", "property type archive")
    if taxonomy == "property":
        offer = PROPERTY_TO_OFFER.get(slug)
        if not offer:
            return ("410", "", f"no offer type for property/{slug}")
        return ("301", f"/{locale}/{routes['search']}?offer_type={offer}", "offer type archive")
    if taxonomy == "resort":
        location = RESORT_TO_LOCATION.get(slug)
        if not location:
            return ("410", "", f"no location page for resort/{slug}")
        return ("301", f"/{locale}/{routes['location']}/{location}", "resort archive with inventory")
    return ("410", "", f"{taxonomy} archive has no indexable equivalent")


def build(workbook: pathlib.Path, registry_path: pathlib.Path) -> dict:
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    segments = segments_for(registry)
    rows = [row for row in csv.DictReader(workbook.open(encoding="utf-8")) if not row["decision"]]

    proposals = []
    for row in rows:
        decision, target, reason = propose(row["old_url"], row["source_domain"], segments)
        proposals.append(
            {
                "old_url": row["old_url"],
                "source_domain": row["source_domain"],
                "url_type": row["url_type"],
                "source_title": row.get("source_title", ""),
                "source_h1": row.get("source_h1", ""),
                "decision": decision,
                "target_path": target,
                "reason": reason,
            }
        )

    counts = collections.Counter(item["decision"] for item in proposals)
    by_kind = collections.Counter(
        item["reason"] for item in proposals if item["decision"] == "301"
    )
    return {
        "artifact_id": "legacy-taxonomy-redirect-proposal",
        "summary": {
            "undecided_urls": len(proposals),
            "proposed_301": counts["301"],
            "kept_410": counts["410"],
            "by_kind": dict(by_kind),
        },
        "proposals": proposals,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=pathlib.Path, default=pathlib.Path("production/data/redirect-approval-workbook.csv"))
    parser.add_argument("--registry", type=pathlib.Path, default=pathlib.Path("locales/registry.json"))
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("production/data/legacy-taxonomy-redirect-proposal.json"))
    parser.add_argument("--review", type=pathlib.Path, default=pathlib.Path("migration/reviews/legacy-taxonomy/proposal.csv"))
    args = parser.parse_args()

    artifact = build(args.workbook, args.registry)
    args.out.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    args.review.parent.mkdir(parents=True, exist_ok=True)
    with args.review.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["old_url", "source_domain", "url_type", "source_h1", "decision", "target_path", "reason", "reviewer", "approved_at"],
        )
        writer.writeheader()
        for item in artifact["proposals"]:
            row = {field: item.get(field, "") for field in writer.fieldnames}
            row["reviewer"] = ""
            row["approved_at"] = ""
            writer.writerow(row)
    print(json.dumps(artifact["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
