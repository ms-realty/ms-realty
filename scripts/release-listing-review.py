#!/usr/bin/env python3
"""Prepare or inspect the unsigned local R02 review. See release/listing-review-contract.md."""
import argparse
import csv
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
from hashlib import sha256
import io
import ipaddress
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit


FAMILIES = ("listing_quality.missing_area", "listing_quality.thin_public_gallery",
            "structured_data.missing_area", "structured_data.missing_bedrooms",
            "structured_data.missing_public_images")
LOCALES = {"bg", "en", "ru", "de", "nl", "el", "he"}
FACTS = ("price", "area", "bedrooms", "location")
ORIGIN = ("review_origin", "broker_owner", "broker_decision", "source_decision",
          "availability_decision", "seller_authority", "media_rights", "publication_decision")
BINDINGS = ("reference", "release_sha", "release_context_digest", "dataset_digest", "row_digest",
            "source_locale", "source_urls", "source_revision", "observations", *FACTS, "availability", "media_digest",
            "source_as_is")
HEADER = (*BINDINGS, *ORIGIN, "fact_decisions", "warning_decisions", "translation_decisions",
          "review_receipt_digest")
WARNING_KEYS = ("family", "url", "locale", "occurrence")
PUBLIC_AVAILABILITY = {"available", "negotiating", "reserved_with_recorded_basis", "sold", "let"}
VERIFICATION = ("pending", "verified", "unknown", "hold", "denied")
DISPOSITIONS = {"review_origin": ("pending", "current_ivan"), "broker_owner": ("", "Ivan"),
                "broker_decision": ("pending", "approve", "hold", "reject"),
                "source_decision": VERIFICATION, "availability_decision": VERIFICATION,
                "seller_authority": VERIFICATION, "media_rights": VERIFICATION,
                "publication_decision": ("pending", "publish", "hold", "withhold", "withdraw")}
FACT_DISPOSITIONS = {"known": "verified", "unknown": "retain_unknown", "not_supplied": "retain_not_supplied",
                     "withheld": "retain_withheld", "not_applicable": "accept_not_applicable",
                     "conflicting": "retain_conflicting"}
FACT_DECISIONS = ("pending", "hold", *FACT_DISPOSITIONS.values())
SURFACES = ("web", "public_api", "structured_data", "sitemap", "hreflang", "search", "comparison",
            "alerts", "feeds", "public_media", "indexable")
GALLERY_SURFACES = {"listing_quality.thin_public_gallery": ("public_gallery", 3),
                    "structured_data.missing_public_images": ("jsonld_images", 1)}
WARNING_DECISIONS = ("retain_unknown", "not_applicable", "accepted_limitation", "corrected", "non_public", "hold", "pending")


class Invalid(ValueError):
    pass


def require(condition, code):
    if not condition:
        raise Invalid(code)


def exact_keys(value, keys):
    return isinstance(value, dict) and value.keys() == set(keys)


def no_duplicate_keys(pairs):
    values = dict(pairs)
    require(len(values) == len(pairs), "duplicate_json_key")
    return values


def reject_constant(_):
    raise Invalid("nonfinite_json_number")


def decode(data):
    try:
        return json.loads(data, object_pairs_hook=no_duplicate_keys, parse_float=Decimal,
                          parse_constant=reject_constant)
    except (json.JSONDecodeError, UnicodeError, RecursionError, InvalidOperation) as error:
        raise Invalid("invalid_json") from error


def compact(value):
    # Decimal preserves the exact value even for extended-precision observed facts.
    if isinstance(value, dict):
        return "{" + ",".join(compact(key) + ":" + compact(value[key]) for key in sorted(value)) + "}"
    if isinstance(value, list):
        return "[" + ",".join(map(compact, value)) + "]"
    if isinstance(value, Decimal):
        return str(value)
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def digest(data):
    return "sha256:" + sha256(data).hexdigest()


def is_hash(value):
    return isinstance(value, str) and re.fullmatch(r"sha256:[0-9a-f]{64}", value) and value[7:] != "0" * 64


def is_reference(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,95}", value)


def revision(value):
    return value is None or (isinstance(value, str) and value.strip() and value.isprintable())


def public_url(value, allow_path=False):
    if not isinstance(value, str) or not value or not value.isprintable() or any(c in value for c in "\\?# "):
        return False
    if allow_path and value.startswith("/") and not value.startswith("//"):
        return True
    try:
        url = urlsplit(value)
        host = url.hostname
        if url.scheme != "https" or not host or url.username is not None or url.password is not None or url.port == 0:
            return False
        try:
            return ipaddress.ip_address(host).is_global
        except ValueError:
            host = host.rstrip(".")
            return "." in host and not host.endswith((".local", ".internal", ".localhost"))
    except ValueError:
        return False


def valid_fact(field, fact):
    if not exact_keys(fact, ("state", "value")) or not isinstance(fact["state"], str) or fact["state"] not in FACT_DISPOSITIONS:
        return False
    value = fact["value"]
    if fact["state"] != "known":
        return value is None
    if field == "price":
        return (exact_keys(value, ("amountMinor", "currency", "period", "basis"))
                and type(value["amountMinor"]) is int and 0 <= value["amountMinor"] <= 2**53 - 1
                and value["currency"] in ("EUR", "BGN", "USD", "GBP") and value["period"] in ("total", "month")
                and value["basis"] in ("asking", "negotiable", "fixed", "indicative"))
    if field == "area":
        return (exact_keys(value, ("value", "unit", "basis")) and type(value["value"]) in (int, Decimal)
                and value["value"] > 0 and value["unit"] == "m2"
                and value["basis"] in ("living", "usable", "built", "gross_floor", "total", "land"))
    if field == "bedrooms":
        return type(value) is int and 0 <= value <= 2**53 - 1
    return (exact_keys(value, ("publicLabel", "publicPrecision")) and isinstance(value["publicLabel"], str)
            and bool(value["publicLabel"].strip())
            and value["publicPrecision"] in ("exact", "street", "neighborhood", "settlement", "region"))


def load_inputs(args):
    raw_pins = args.pins.read_bytes()
    pins = decode(raw_pins)
    require(exact_keys(pins, ("schemaVersion", "releaseSha", "releaseContextDigest", "datasetDigest",
                              "scope")) and type(pins["schemaVersion"]) is int and pins["schemaVersion"] == 1,
            "invalid_pins")
    sha = pins["releaseSha"]
    require(sha is None or (isinstance(sha, str) and re.fullmatch(r"[0-9a-f]{40}", sha)
                            and sha != "0" * 40), "invalid_release_sha")
    for key in ("releaseContextDigest", "datasetDigest", "scope"):
        require(pins[key] is None or is_hash(pins[key]), "invalid_pin_digest")

    raw = args.dataset.read_bytes()
    data = decode(raw)
    require(exact_keys(data, ("schemaVersion", "listings")) and type(data["schemaVersion"]) is int
            and data["schemaVersion"] == 2 and isinstance(data["listings"], list), "invalid_dataset")
    listings = {}
    for row in data["listings"]:
        require(exact_keys(row, ("reference", "sourceLocale", "sourceUrls", "sourceRevision", "observations", "facts",
                                 "availability", "mediaDigest", "sourceAsIs", "translations", "warnings")),
                "invalid_dataset_row")
        ref = row["reference"]
        require(is_reference(ref) and ref not in listings, "invalid_or_duplicate_dataset_reference")
        require(isinstance(row["sourceLocale"], str) and row["sourceLocale"] in LOCALES, "invalid_source_locale")
        urls = row["sourceUrls"]
        require(isinstance(urls, list) and all(public_url(url) for url in urls)
                and len(set(urls)) == len(urls), "invalid_source_urls")
        require(revision(row["sourceRevision"]) and (row["mediaDigest"] is None or is_hash(row["mediaDigest"])),
                "invalid_source_or_media_revision")
        require(exact_keys(row["observations"], FACTS) and exact_keys(row["facts"], FACTS)
                and all(valid_fact(key, row["facts"][key]) for key in FACTS)
                and row["sourceAsIs"] in ("observed", "unrecorded"),
                "invalid_source_facts")
        translations = row["translations"]
        require(isinstance(translations, dict) and set(translations) <= LOCALES - {row["sourceLocale"]},
                "invalid_translation_locales")
        for item in translations.values():
            require(exact_keys(item, ("revision", "indexable")) and revision(item["revision"])
                    and type(item["indexable"]) in (bool, type(None)), "invalid_translation")
        counters = defaultdict(list)
        require(isinstance(row["warnings"], list), "invalid_warning_array")
        for item in row["warnings"]:
            require(exact_keys(item, WARNING_KEYS) and item["family"] in FAMILIES
                    and isinstance(item["locale"], str) and item["locale"] in LOCALES
                    and public_url(item["url"], True) and type(item["occurrence"]) is int
                    and item["occurrence"] > 0, "invalid_source_warning")
            counters[item["family"], item["url"], item["locale"]].append(item["occurrence"])
        require(all(sorted(nums) == list(range(1, len(nums) + 1)) for nums in counters.values()),
                "invalid_warning_occurrences")
        listings[ref] = row
    return pins, digest(raw_pins), digest(raw), listings


def bindings(row, pins, dataset_digest):
    return dict(zip(BINDINGS, (
        row["reference"], pins["releaseSha"] or "", pins["releaseContextDigest"] or "", dataset_digest,
        digest(compact(row).encode()), row["sourceLocale"], compact(row["sourceUrls"]),
        compact(row["sourceRevision"]), compact(row["observations"]), *(compact(row["facts"][key]) for key in FACTS),
        compact(row["availability"]), row["mediaDigest"] or "", row["sourceAsIs"],
    ), strict=True))


def draft(listings, pins, dataset_digest):
    require(pins["datasetDigest"] in (None, dataset_digest), "dataset_pin_mismatch")
    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, HEADER)
    writer.writeheader()
    for row in listings.values():
        writer.writerow({
            **bindings(row, pins, dataset_digest), **dict.fromkeys(ORIGIN, "pending"), "broker_owner": "",
            "fact_decisions": compact(dict.fromkeys(FACTS, "pending")),
            "warning_decisions": compact([{**item, "decision": "pending", "correctionDigest": None} for item in row["warnings"]]),
            "translation_decisions": compact({locale: {**item, "decision": "pending", "receiptDigest": None}
                                              for locale, item in row["translations"].items()}),
            "review_receipt_digest": "",
        })
    return out.getvalue()


def read_review(raw):
    csv.field_size_limit(sys.maxsize)
    reader = csv.reader(io.StringIO(raw.decode("utf-8-sig"), newline=""), strict=True)
    header = next(reader, [])
    require(len(header) == len(HEADER) and set(header) == set(HEADER), "invalid_csv_header")
    grouped = defaultdict(list)
    for cells in reader:
        require(len(cells) == len(header), "invalid_csv_width")
        row = dict(zip(header, cells))
        require(is_reference(row["reference"]), "invalid_csv_reference")
        grouped[row["reference"]].append(row)
    return grouped


class Receipts:
    """Only content-addressed redacted local files. A matching hash does not authenticate Ivan."""
    def __init__(self, directory):
        self.directory = directory
        self.cache = {}

    def get(self, address):
        if not self.directory or not is_hash(address):
            return None
        if address not in self.cache:
            path = self.directory / (address[7:] + ".json")
            record = None
            try:
                if path.is_file() and not path.is_symlink():
                    raw = path.read_bytes()
                    if digest(raw) == address:
                        record = decode(raw)
            except (OSError, ValueError):
                pass
            self.cache[address] = record if isinstance(record, dict) else None
        return self.cache[address]


def reconciled_sources(record, context, listings, receipts):
    inventory = receipts.get(record.get("sourceInventoryDigest"))
    delta = receipts.get(record.get("deltaEvidenceDigest"))
    if not inventory or not delta or inventory.get("kind") != "r02.source-identities.v1":
        return False
    identities = inventory.get("identities")
    dispositions = delta.get("dispositions")
    if (not isinstance(identities, list) or not identities
            or not all(isinstance(key, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,179}", key)
                       for key in identities)
            or len(identities) != len(set(identities)) or not exact_keys(dispositions, identities)
            or delta.get("kind") != "r02.identity-reconciliation.v1" or delta.get("openItems") != []
            or delta.get("sourceInventoryDigest") != record["sourceInventoryDigest"]
            or any(delta.get(k) != v for k, v in context.items())):
        return False
    mapped = set()
    for identity, choice in dispositions.items():
        if exact_keys(choice, ("reference",)) and is_reference(choice["reference"]) and choice["reference"] in listings:
            mapped.add(choice["reference"])
        elif exact_keys(choice, ("exclusionDigest",)):
            expected = {**context, "kind": "r02.scope-exclusion.v1", "identity": identity, "decision": "exclude"}
            if receipts.get(choice["exclusionDigest"]) != expected:
                return False
        else:
            return False
    return mapped == set(listings)


def scope_blockers(pins, context, listings, counts, receipts):
    blockers = []
    if not listings:
        blockers.append("empty_dataset")
    for key in ("releaseSha", "releaseContextDigest", "datasetDigest"):
        if pins[key] is None:
            blockers.append(key + "_pin_missing")
    if pins["datasetDigest"] is not None and pins["datasetDigest"] != context["datasetDigest"]:
        blockers.append("dataset_pin_mismatch")
    record = receipts.get(pins["scope"])
    if record is None:
        return blockers + ["scope_reconciliation_missing"]
    if record.get("kind") != "r02.scope.v1" or any(record.get(k) != v for k, v in context.items()):
        blockers.append("scope_record_binding_mismatch")
    expected = record.get("expectedReferences")
    if (not isinstance(expected, list) or not all(is_reference(ref) for ref in expected)
            or len(expected) != len(listings) or set(expected) != set(listings)):
        blockers.append("independent_reference_set_mismatch")
    frozen_counts = record.get("warningCounts")
    if (not exact_keys(frozen_counts, FAMILIES) or any(type(n) is not int for n in frozen_counts.values())
            or frozen_counts != counts):
        blockers.append("independent_warning_counts_mismatch")
    if type(record.get("unresolvedCount")) is not int or record["unresolvedCount"] != 0:
        blockers.append("unresolved_scope_or_delta")
    if not reconciled_sources(record, context, listings, receipts):
        blockers.append("incomplete_source_identity_reconciliation")
    locales = record.get("candidateLocales")
    if (not isinstance(locales, list) or not locales or not all(isinstance(k, str) and k in LOCALES for k in locales)
            or len(locales) != len(set(locales)) or any(
                not (set(locales) - {row["sourceLocale"]}) <= row["translations"].keys()
                or any(k not in locales and t["indexable"] is not False for k, t in row["translations"].items())
                for row in listings.values())):
        blockers.append("independent_locale_scope_mismatch")
    return blockers


def nonpublic_members(scope, context, listings, receipts):
    """Absence is meaningful only in an independently pinned, complete candidate census."""
    record = receipts.get(scope.get("projectionInventoryDigest")) if scope else None
    if not record or record.get("kind") != "r02.projections.v1" or any(record.get(k) != v for k, v in context.items()):
        return None
    expected = record.get("expectedReferences")
    surfaces = record.get("surfaces")
    if (not isinstance(expected, list) or not all(is_reference(ref) for ref in expected)
            or len(expected) != len(listings) or set(expected) != set(listings)
            or not exact_keys(surfaces, SURFACES)):
        return None
    visible = set()
    for surface, locales in surfaces.items():
        if not exact_keys(locales, LOCALES | {"global"}):
            return None
        for locale, address in locales.items():
            capture = receipts.get(address)
            identity = {**context, "kind": "r02.projection-members.v1", "surface": surface, "locale": locale}
            if (not capture or any(capture.get(k) != v for k, v in identity.items())
                    or capture.get("openItems") != []):
                return None
            refs = capture.get("references")
            if (not isinstance(refs, list) or not all(is_reference(ref) and ref in listings for ref in refs)
                    or len(refs) != len(set(refs))):
                return None
            visible.update(refs)
    return set(listings) - visible


def correction_supported(row, source, address, facts, basis, binding, cells, receipts):
    proof = receipts.get(address)
    expected = {**binding, "kind": "r02.warning-correction.v1", "warning": source}
    if not proof or not row["sourceRevision"] or any(compact(proof.get(k)) != compact(v) for k, v in expected.items()):
        return False
    family = source["family"]
    if family not in GALLERY_SURFACES:
        field = "bedrooms" if family.endswith("missing_bedrooms") else "area"
        return (isinstance(facts, dict) and facts.get(field) == "verified" and row["facts"][field]["state"] == "known"
                and basis and proof.get("factSourceDigest") == basis.get("factSourceDigest"))
    surface, minimum = GALLERY_SURFACES[family]
    selection = receipts.get(row["mediaDigest"])
    if (cells["media_rights"] != "verified" or not selection or selection.get("kind") != "r02.media-selection.v1"
            or selection.get("reference") != row["reference"] or selection.get("sourceRevision") != row["sourceRevision"]
            or proof.get("mediaDigest") != row["mediaDigest"] or proof.get("surface") != surface):
        return False
    # Actual selected and observed public asset identities give the count; repeated placements cannot inflate it.
    selected, observed = selection.get("publicAssets"), proof.get("publicAssets")
    if not all(isinstance(items, list) and all(exact_keys(asset, ("digest", "url")) and is_hash(asset["digest"])
               and public_url(asset["url"]) for asset in items) for items in (selected, observed)):
        return False
    approved = {(asset["digest"], asset["url"]) for asset in selected}
    return (len(approved) == len({url for _, url in approved})
            and all((asset["digest"], asset["url"]) in approved for asset in observed)
            and len({asset["digest"] for asset in observed}) >= minimum
            and len({asset["url"] for asset in observed}) >= minimum)


def review_row(row, cells, frozen, context, receipts, dataset_pinned, nonpublic):
    blockers = []
    if any(cells[key] != value for key, value in frozen.items()):
        blockers.append("frozen_columns_changed")
    decisions = {key: cells[key] for key in ORIGIN}
    for key in ("fact_decisions", "warning_decisions", "translation_decisions"):
        decisions[key] = decode(cells[key])
    decision_digest = digest(compact({"rowDigest": frozen["row_digest"], "decisions": decisions}).encode())
    receipt = receipts.get(cells["review_receipt_digest"])
    entry = (receipt.get("decisions", {}).get(row["reference"]) if receipt
             and isinstance(receipt.get("decisions"), dict) else None)
    basis = receipts.get(entry.get("basisDigest")) if isinstance(entry, dict) else None
    binding = {**context, "reference": row["reference"], "rowDigest": frozen["row_digest"],
               "sourceRevision": row["sourceRevision"]}
    fact_source = receipts.get(basis.get("factSourceDigest")) if basis else None
    fact_source_matches = bool(fact_source and all(fact_source.get(k) == v for k, v in binding.items())
                               and fact_source.get("kind") == "r02.current-facts.v1"
                               and compact(fact_source.get("facts")) == compact(row["facts"]))
    record_matches = bool(
        receipt and receipt.get("kind") == "r02.human-review.v1" and receipt.get("reviewer") == "Ivan"
        and all(receipt.get(k) == v and v for k, v in context.items())
        and isinstance(entry, dict) and entry.get("decisionDigest") == decision_digest
        and basis and basis.get("kind") == "r02.listing-basis.v1"
        and basis.get("reference") == row["reference"] and basis.get("rowDigest") == frozen["row_digest"]
        and fact_source_matches and all(
            is_hash(basis.get(key)) or (key in basis and basis[key] is None and cells[choice] == "unknown")
            for key, choice in (("availabilityDigest", "availability_decision"),
                                ("sellerInstructionDigest", "seller_authority"), ("mediaRightsDigest", "media_rights"))))
    current = (dataset_pinned and record_matches and cells["review_origin"] == "current_ivan"
               and cells["broker_owner"] == "Ivan" and "frozen_columns_changed" not in blockers)
    if not current:
        blockers.append("current_ivan_review_missing_or_unbound")
    private_decision = cells["publication_decision"] in ("withhold", "withdraw")
    private_proven = private_decision and nonpublic is not None and row["reference"] in nonpublic
    if private_decision:
        if not private_proven:
            blockers.append("non_public_projection_unproven")
        if any(t["indexable"] is not False for t in row["translations"].values()):
            blockers.append("non_public_indexability_inconsistent")
    elif cells["publication_decision"] != "publish":
        blockers.append("publication_decision_not_cleared")
    if cells["broker_decision"] not in (("approve", "reject") if private_decision else ("approve",)):
        blockers.append("broker_decision_not_cleared")
    for key in ("source_decision", "availability_decision", "seller_authority", "media_rights"):
        if cells[key] not in (("verified", "denied", "unknown") if private_decision else ("verified",)):
            blockers.append(key + "_not_cleared")
    if (not private_decision or cells["source_decision"] == "verified") and (not row["sourceUrls"] or not row["sourceRevision"]):
        blockers.append("source_identity_unknown")
    if (not private_decision or cells["media_rights"] == "verified") and not row["mediaDigest"]:
        blockers.append("media_selection_unknown")
    available = row["availability"]
    if not private_decision or cells["availability_decision"] == "verified":
        state = available.get("state") if isinstance(available, dict) else None
        if not private_decision and state in ("withdrawn", "confirmation_required"):
            blockers.append("availability_" + state)
        elif (not isinstance(state, str) or state not in PUBLIC_AVAILABILITY | {"withdrawn", "confirmation_required"}
              or not row["sourceRevision"] or available.get("revision") != row["sourceRevision"]):
            blockers.append("current_availability_unknown")

    facts = decisions["fact_decisions"]
    if not exact_keys(facts, FACTS):
        blockers.append("fact_decision_coverage")
    else:
        for key in FACTS:
            state = row["facts"][key]["state"]
            if facts[key] != FACT_DISPOSITIONS[state] or (state == "conflicting" and not private_decision):
                blockers.append(key + "_decision_unresolved")
    if cells["publication_decision"] == "publish":
        # Public minima from src/domain/listing-readiness.ts (mustBeDecided).
        for key, allowed in (("price", ("known", "withheld")), ("location", ("known",))):
            if row["facts"][key]["state"] not in allowed:
                blockers.append(key + "_publication_minimum_unmet")

    translations = decisions["translation_decisions"]
    translation_summary = {}
    if not exact_keys(translations, row["translations"]):
        blockers.append("translation_coverage")
    for locale, source in row["translations"].items():
        choice = translations.get(locale) if isinstance(translations, dict) else None
        decision = choice.get("decision") if isinstance(choice, dict) else None
        translation_summary[locale] = {"indexable": source["indexable"], "decision": decision
                                       if decision in ("noindex", "approve_indexing", "hold", "pending") else None}
        if (not exact_keys(choice, ("revision", "indexable", "decision", "receiptDigest"))
                or choice["revision"] != source["revision"] or choice["indexable"] is not source["indexable"]):
            blockers.append("translation_binding:" + locale)
            continue
        if source["indexable"] is False and decision == "noindex" and choice["receiptDigest"] is None:
            continue
        expected = {**context, "kind": "r02.translation-review.v1", "reviewer": "Ivan",
                    "reference": row["reference"], "sourceRevision": row["sourceRevision"],
                    "locale": locale, "revision": source["revision"], "decision": "approve_indexing"}
        if (source["indexable"] is not True or not row["sourceRevision"] or not source["revision"]
                or decision != "approve_indexing" or receipts.get(choice["receiptDigest"]) != expected):
            blockers.append("translation_unresolved:" + locale)

    # The source provides the universe of occurrences. The CSV cannot waive an omitted occurrence.
    expected_warnings = {compact(item): item for item in row["warnings"]}
    dispositions = {}
    choices = decisions["warning_decisions"]
    coverage = isinstance(choices, list)
    for choice in choices if coverage else []:
        if not exact_keys(choice, (*WARNING_KEYS, "decision", "correctionDigest")):
            coverage = False
            continue
        key = compact({k: choice[k] for k in WARNING_KEYS})
        if key not in expected_warnings or key in dispositions:
            coverage = False
        dispositions[key] = choice
    if not coverage or set(dispositions) != set(expected_warnings):
        blockers.append("warning_occurrence_coverage")
        coverage = False
    warnings = []
    for key, source in expected_warnings.items():
        choice = dispositions.get(key, {})
        decision, correction = choice.get("decision"), choice.get("correctionDigest")
        if decision == "corrected":
            supported = correction_supported(row, source, correction, facts, basis, binding, cells, receipts)
        else:
            supported = correction is None and (decision in ("retain_unknown", "accepted_limitation")
                                                  or (decision == "non_public" and private_proven))
            if source["family"] not in GALLERY_SURFACES and decision in ("not_applicable", "retain_unknown"):
                field = "bedrooms" if source["family"].endswith("missing_bedrooms") else "area"
                state = row["facts"][field]["state"]
                supported = (correction is None and isinstance(facts, dict) and facts.get(field) == FACT_DISPOSITIONS[state]
                             and (state == "not_applicable" if decision == "not_applicable"
                                  else state not in ("known", "not_applicable")))
        reviewed = bool(current and coverage and supported)
        if not reviewed:
            blockers.append("warning_unresolved:" + source["family"])
        warnings.append({**source, "decision": decision if decision in WARNING_DECISIONS else None,
                         "correctionDigest": correction if is_hash(correction) else None, "reviewed": reviewed})
    return {"reference": row["reference"], "rowDigest": frozen["row_digest"],
            "sourceAsIs": row["sourceAsIs"], "currentRecordMatched": current,
            "reviewDisposition": ("incomplete" if blockers else "reviewed_non_public" if private_proven
                                  else "reviewed_for_proposed_publication"),
            "recordedDecisions": {key: cells[key] if cells[key] in allowed else None
                                  for key, allowed in DISPOSITIONS.items()},
            "factDecisions": {key: facts[key] if isinstance(facts, dict) and facts.get(key) in FACT_DECISIONS
                              else None for key in FACTS},
            "decisionDigest": decision_digest, "reviewReceiptDigest": cells["review_receipt_digest"]
            if is_hash(cells["review_receipt_digest"]) else None, "warnings": warnings, "translations": translation_summary,
            "blockers": sorted(set(blockers))}


def check(args, pins, pin_digest, dataset_digest, listings):
    raw = args.review.read_bytes()
    grouped = read_review(raw)
    receipts = Receipts(args.receipts)
    context = {"releaseSha": pins["releaseSha"], "releaseContextDigest": pins["releaseContextDigest"],
               "datasetDigest": dataset_digest}
    counts = dict.fromkeys(FAMILIES, 0)
    for row in listings.values():
        for warning in row["warnings"]:
            counts[warning["family"]] += 1
    blockers = scope_blockers(pins, context, listings, counts, receipts)
    nonpublic = None if blockers else nonpublic_members(receipts.get(pins["scope"]), context, listings, receipts)
    coverage = {"expected": len(listings), "csvRows": sum(map(len, grouped.values())),
                "missing": sorted(listings.keys() - grouped.keys()), "extra": sorted(grouped.keys() - listings.keys()),
                "duplicates": sorted(ref for ref, values in grouped.items() if len(values) > 1)}
    if any(coverage[key] for key in ("missing", "extra", "duplicates")):
        blockers.append("csv_reference_coverage")
    rows = []
    reviewed = Counter()
    for ref, row in listings.items():
        if len(grouped.get(ref, [])) != 1:
            continue
        details = review_row(row, grouped[ref][0], bindings(row, pins, dataset_digest), context, receipts,
                             pins["datasetDigest"] == dataset_digest, nonpublic)
        reviewed.update(warning["family"] for warning in details["warnings"] if warning["reviewed"])
        rows.append(details)
    if any(detail["blockers"] for detail in rows):
        blockers.append("listing_decisions_incomplete_or_held")
    return {"kind": "r02.unsigned-checklist.v2", **context, "pinFileDigest": pin_digest,
            "reviewCsvDigest": digest(raw), "expectedDatasetDigest": pins["datasetDigest"], "scopeRecordDigest": pins["scope"],
            "status": "blocked" if blockers else "awaiting_independent_review",
            "gateDecision": None, "humanAttestation": None, "publicationAuthority": None, "coverage": coverage,
            "inventoryReview": {"complete": not blockers,
                                "reviewedNonPublic": sum(r["reviewDisposition"] == "reviewed_non_public" for r in rows),
                                "reviewedForProposedPublication": sum(r["reviewDisposition"] == "reviewed_for_proposed_publication" for r in rows)},
            "externalVerificationRequired": ["freeze_custody_and_scope", "receipt_authorship_and_truth",
                                              "independent_review_and_trusted_signature"],
            "warningFamilies": {family: {"expected": count, "reviewed": reviewed[family]}
                                for family, count in counts.items()}, "blockers": blockers, "rows": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="mode", required=True)
    for name in ("draft", "check"):
        cmd = commands.add_parser(name)
        cmd.add_argument("--dataset", required=True, type=Path)
        cmd.add_argument("--pins", required=True, type=Path)
        if name == "check":
            cmd.add_argument("--review", required=True, type=Path)
            cmd.add_argument("--receipts", type=Path)
    args = parser.parse_args()
    try:
        pins, pin_digest, dataset_digest, listings = load_inputs(args)
        if args.mode == "draft":
            sys.stdout.buffer.write(draft(listings, pins, dataset_digest).encode())
            return 0
        result = check(args, pins, pin_digest, dataset_digest, listings)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2 if result["blockers"] else 0
    except (OSError, ValueError, csv.Error, UnicodeError, RecursionError) as error:
        code = str(error) if isinstance(error, Invalid) else "unreadable_or_malformed_input"
        if args.mode == "check":
            print(json.dumps({"kind": "r02.unsigned-checklist.v2", "status": "invalid",
                              "gateDecision": None, "humanAttestation": None, "blockers": [code]}))
        else:
            print(code, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
