"""R02 local command tests. All identities, receipts and decisions are synthetic."""
import csv
import hashlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("release-listing-review.py")
FAMILIES = ["listing_quality.missing_area", "listing_quality.thin_public_gallery",
            "structured_data.missing_area", "structured_data.missing_bedrooms",
            "structured_data.missing_public_images"]


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def digest(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


class ReviewCLI(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.files = {n: self.root / n for n in ("dataset", "pins", "review")}
        self.receipts = self.root / "receipts"
        self.receipts.mkdir()
        self.reference = "MS-00001"
        self.row = {
            "reference": self.reference, "sourceLocale": "bg",
            "sourceUrls": ["https://legacy.example/listing/one"], "sourceRevision": "rev-1",
            "facts": {"price": {"minor": 12500, "currency": "EUR"}, "area": None,
                      "bedrooms": 1, "location": 'Public quarter, "A"\nСофия'},
            "availability": {"state": "available", "revision": "rev-1"},
            "mediaDigest": digest(b"redacted selection"), "sourceAsIs": "observed",
            "translations": {"ru": {"revision": "translation-1", "indexable": True}},
            "warnings": [
                {"family": "structured_data.missing_area", "url": "/bg/imoti/a", "locale": "bg", "occurrence": 1},
                {"family": "structured_data.missing_area", "url": "/ru/imoti/a", "locale": "ru", "occurrence": 1},
            ],
        }
        self.dataset = {"schemaVersion": 1, "listings": [self.row]}
        self.write("dataset", self.dataset)
        self.pins = {"schemaVersion": 1, "releaseSha": "1" * 40,
                     "releaseContextDigest": digest(b"release context"),
                     "datasetDigest": digest(self.files["dataset"].read_bytes()), "scope": None}
        self.write("pins", self.pins)

    def write(self, name, value):
        self.files[name].write_text(encode(value), encoding="utf-8")

    def invoke(self, mode):
        cmd = [sys.executable, str(SCRIPT), mode, "--dataset", str(self.files["dataset"]),
               "--pins", str(self.files["pins"])]
        if mode == "check":
            cmd += ["--review", str(self.files["review"]), "--receipts", str(self.receipts)]
        return subprocess.run(cmd, capture_output=True, check=False)

    def draft(self):
        result = self.invoke("draft")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.files["review"].write_bytes(result.stdout)
        return list(csv.DictReader(io.StringIO(result.stdout.decode(), newline="")))

    def save_csv(self, rows, header=None):
        with self.files["review"].open("w", encoding="utf-8", newline="") as output:
            writer = csv.DictWriter(output, fieldnames=header or list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    def check(self, expected):
        result = self.invoke("check")
        self.assertEqual(result.returncode, expected, result.stdout.decode() + result.stderr.decode())
        return json.loads(result.stdout)

    def test_draft_and_scope_unknown(self):
        review = self.draft()[0]
        self.assertEqual(json.loads(review["location"]), self.row["facts"]["location"])
        self.assertIsNone(json.loads(review["area"]))
        self.assertEqual(review["review_origin"], "pending")
        report = self.check(2)
        self.assertIn("scope_reconciliation_missing", report["blockers"])
        self.assertEqual(report["warningFamilies"]["structured_data.missing_area"]["expected"], 2)
        self.assertEqual(report["warningFamilies"]["structured_data.missing_area"]["reviewed"], 0)
        self.assertIsNone(report["gateDecision"])
    def store(self, value):
        raw = encode(value).encode()
        address = digest(raw)
        (self.receipts / (address[7:] + ".json")).write_bytes(raw)
        return address

    def context(self):
        return {key: self.pins[key] for key in ("releaseSha", "releaseContextDigest", "datasetDigest")}

    def independent_scope(self):
        inventory = self.store({"kind": "r02.source-identities.v1", "identities": ["host:1", "host:2"]})
        exclusion = self.store({**self.context(), "kind": "r02.scope-exclusion.v1", "identity": "host:2",
                                "decision": "exclude"})
        self.delta = {**self.context(), "kind": "r02.identity-reconciliation.v1", "openItems": [],
                      "sourceInventoryDigest": inventory,
                      "dispositions": {"host:1": {"reference": self.reference}, "host:2": {"exclusionDigest": exclusion}}}
        self.scope = {**self.context(), "kind": "r02.scope.v1", "candidateLocales": ["bg", "ru"],
                      "expectedReferences": [self.reference], "sourceInventoryDigest": inventory,
                      "deltaEvidenceDigest": self.store(self.delta), "unresolvedCount": 0,
                      "warningCounts": {k: sum(w["family"] == k for w in self.row["warnings"]) for k in FAMILIES}}
        self.set_scope()

    def set_scope(self):
        self.pins["scope"] = self.store(self.scope)
        self.write("pins", self.pins)

    def set_decisions(self):
        review = self.draft()[0]
        review.update({"review_origin": "current_ivan", "broker_owner": "Ivan", "broker_decision": "approve",
                       "source_decision": "verified", "availability_decision": "verified",
                       "seller_authority": "verified", "media_rights": "verified", "publication_decision": "publish",
                       "fact_decisions": encode({"price": "verified", "area": "retain_unknown", "bedrooms": "verified",
                                                 "location": "verified"})})
        warnings = json.loads(review["warning_decisions"])
        for item in warnings:
            item["decision"] = "retain_unknown"
        review["warning_decisions"] = json.dumps(warnings, indent=2, ensure_ascii=False)
        trans = json.loads(review["translation_decisions"])
        self.translation = {**self.context(), "kind": "r02.translation-review.v1", "reviewer": "Ivan",
                            "reference": self.reference, "sourceRevision": "rev-1", "locale": "ru",
                            "revision": "translation-1", "decision": "approve_indexing"}
        trans["ru"].update({"decision": "approve_indexing", "receiptDigest": self.store(self.translation)})
        review["translation_decisions"] = encode(trans)
        return review

    def synthetic_record(self, review):
        # Independently build the decision statement (the script under test never writes a receipt).
        plain_fields = ("review_origin", "broker_owner", "broker_decision", "source_decision",
                        "availability_decision", "seller_authority", "media_rights", "publication_decision")
        decisions = {key: review[key] for key in plain_fields}
        for key in ("fact_decisions", "warning_decisions", "translation_decisions"):
            decisions[key] = json.loads(review[key])
        statement = {"rowDigest": review["row_digest"], "decisions": decisions}
        self.basis = {"kind": "r02.listing-basis.v1", "reference": self.reference, "rowDigest": review["row_digest"],
                      **{key: digest(key.encode()) for key in
                         ("factSourceDigest", "availabilityDigest", "sellerInstructionDigest", "mediaRightsDigest")}}
        self.human = {**self.context(), "kind": "r02.human-review.v1", "reviewer": "Ivan",
                      "decisions": {self.reference: {"decisionDigest": digest(encode(statement).encode()),
                                                     "basisDigest": self.store(self.basis)}}}
        review["review_receipt_digest"] = self.store(self.human)
        self.save_csv([review])

    def test_complete_unsigned_rfc_csv_is_still_awaiting_review(self):
        self.independent_scope()
        review = self.set_decisions()
        self.synthetic_record(review)
        raw = self.files["review"].read_bytes()
        self.assertIn(b'""decision""', raw)
        self.assertIn(b"\r\n", raw)
        self.assertTrue(any(line.startswith(b"  {") for line in raw.splitlines()))
        # CSV column order and UTF-8 BOM are valid. Embedded CSV line breaks stay inside one field.
        self.save_csv([review], header=list(reversed(list(review))))
        self.files["review"].write_bytes(b"\xef\xbb\xbf" + self.files["review"].read_bytes())
        result = self.check(0)
        self.assertEqual(result["status"], "awaiting_independent_review")
        self.assertIsNone(result["humanAttestation"])
        self.assertIsNone(result["gateDecision"])
        self.assertEqual(result["warningFamilies"]["structured_data.missing_area"]["reviewed"], 2)
        self.assertEqual(len(result["externalVerificationRequired"]), 3)

    def test_csv_reference_binding_and_malformed_input(self):
        review = self.draft()[0]
        self.save_csv([review, review, {**review, "reference": "MS-00002"}])
        result = self.check(2)
        self.assertEqual(result["coverage"]["duplicates"], [self.reference])
        self.assertEqual(result["coverage"]["extra"], ["MS-00002"])
        self.assertEqual(result["rows"], [])
        self.save_csv([{**review, "reference": "MS-00002"}])
        self.assertEqual(self.check(2)["coverage"]["missing"], [self.reference])
        self.save_csv([{**review, "price": "1", "source_as_is": "unrecorded"}])
        self.assertIn("frozen_columns_changed", self.check(2)["rows"][0]["blockers"])
        for damaged in (b"bad,header\r\n", ",".join(list(review) + ["reference"]).encode() + b"\n",
                        ",".join(review).encode() + b'\r\n"never closed', ",".join(review).encode() + b'\nshort\n'):
            with self.subTest(damaged=damaged[:12]):
                self.files["review"].write_bytes(damaged)
                self.assertEqual(self.check(1)["status"], "invalid")

    def test_rows_and_warning_occurrences_cannot_be_dropped_duplicated_or_relabelled(self):
        self.independent_scope()
        review = self.set_decisions()
        source = json.loads(review["warning_decisions"])
        for choices in (source[0:1], [source[0], source[0]], [source[0], {**source[1], "url": "/wrong"}],
                        [source[0], {**source[1], "locale": "bg"}], [*source, {**source[0], "occurrence": 2}]):
            review["warning_decisions"] = encode(choices)
            self.synthetic_record(review)
            result = self.check(2)
            self.assertIn("warning_occurrence_coverage", result["rows"][0]["blockers"])
            self.assertEqual(result["warningFamilies"]["structured_data.missing_area"]["reviewed"], 0)
        # Removing an occurrence from the source and recomputing a local data/CSV hash cannot update the retained scope.
        self.row["warnings"].pop()
        self.write("dataset", self.dataset)
        self.pins["datasetDigest"] = digest(self.files["dataset"].read_bytes())
        self.write("pins", self.pins)
        self.draft()
        result = self.check(2)
        self.assertIn("scope_record_binding_mismatch", result["blockers"])
        self.assertIn("independent_warning_counts_mismatch", result["blockers"])

    def test_source_identity_delta_covers_exclusions_expected_refs_and_candidate_locales(self):
        self.independent_scope()
        review = self.set_decisions()
        self.synthetic_record(review)
        self.scope["expectedReferences"].append("MS-00002")
        self.set_scope()
        self.assertIn("independent_reference_set_mismatch", self.check(2)["blockers"])
        self.scope["expectedReferences"].pop()
        self.delta["dispositions"].pop("host:2")
        self.scope["deltaEvidenceDigest"] = self.store(self.delta)
        self.scope["candidateLocales"].append("en")
        self.set_scope()
        result = self.check(2)
        self.assertIn("incomplete_source_identity_reconciliation", result["blockers"])
        self.assertIn("independent_locale_scope_mismatch", result["blockers"])
        self.delta["dispositions"]["host:2"] = {"exclusionDigest": digest(b"missing")}
        self.scope["deltaEvidenceDigest"] = self.store(self.delta)
        self.scope["candidateLocales"].pop()
        self.set_scope()
        self.assertIn("incomplete_source_identity_reconciliation", self.check(2)["blockers"])
        self.scope["unresolvedCount"] = 2
        self.set_scope()
        self.assertIn("unresolved_scope_or_delta", self.check(2)["blockers"])

    def test_receipts_must_match_actual_bytes_bound_decisions_source_revision_and_locale(self):
        self.independent_scope()
        review = self.set_decisions()
        self.save_csv([review])
        self.assertIn("current_ivan_review_missing_or_unbound", self.check(2)["rows"][0]["blockers"])
        self.synthetic_record(review)
        review["broker_decision"] = "hold"
        self.save_csv([review])
        row = self.check(2)["rows"][0]
        self.assertFalse(row["currentRecordMatched"])
        self.assertEqual(row["recordedDecisions"]["broker_decision"], "hold")
        self.assertIn("broker_decision_not_cleared", row["blockers"])
        review["broker_decision"] = "approve"
        trans = json.loads(review["translation_decisions"])
        for change in ({"revision": "stale"}, {"sourceRevision": "old"}, {"locale": "en"},
                       {"releaseContextDigest": digest(b"other context")}, {"reviewer": "Butler"}):
            trans["ru"]["receiptDigest"] = self.store({**self.translation, **change})
            review["translation_decisions"] = encode(trans)
            self.synthetic_record(review)
            self.assertIn("translation_unresolved:ru", self.check(2)["rows"][0]["blockers"])
        trans["ru"]["receiptDigest"] = self.store(self.translation)
        review["translation_decisions"] = encode(trans)
        self.synthetic_record(review)
        (self.receipts / (review["review_receipt_digest"][7:] + ".json")).write_bytes(b'{"replaced":true}')
        self.assertIn("current_ivan_review_missing_or_unbound", self.check(2)["rows"][0]["blockers"])

    def test_holds_unknowns_missing_media_and_invented_corrections(self):
        self.row["availability"] = None
        self.row["mediaDigest"] = None
        self.write("dataset", self.dataset)
        self.pins["datasetDigest"] = digest(self.files["dataset"].read_bytes())
        self.independent_scope()
        review = self.set_decisions()
        review["publication_decision"] = "withdraw"
        review["seller_authority"] = "denied"
        review["media_rights"] = "unknown"
        warning = json.loads(review["warning_decisions"])
        warning[0]["decision"] = "corrected"
        review["warning_decisions"] = encode(warning)
        self.synthetic_record(review)
        row = self.check(2)["rows"][0]
        self.assertTrue(row["currentRecordMatched"])
        self.assertFalse(row["warnings"][0]["reviewed"])
        self.assertEqual(row["factDecisions"]["area"], "retain_unknown")
        self.assertTrue({"current_availability_unknown", "media_selection_unknown", "seller_authority_not_cleared",
                         "media_rights_not_cleared", "publication_decision_not_cleared"} <= set(row["blockers"]))

    def test_malformed_or_unpinned_dataset_and_authorship(self):
        self.draft()
        self.files["dataset"].write_bytes(b'{"schemaVersion":1,"listings":[],"listings":[]}')
        self.assertIn("duplicate_json_key", self.check(1)["blockers"])
        self.dataset["listings"].append(self.row.copy())
        self.write("dataset", self.dataset)
        self.assertIn("invalid_or_duplicate_dataset_reference", self.check(1)["blockers"])
        self.dataset["listings"].pop()
        self.row["warnings"][0]["occurrence"] = 2
        self.write("dataset", self.dataset)
        self.assertIn("invalid_warning_occurrences", self.check(1)["blockers"])
        self.row["warnings"][0]["occurrence"] = 1
        self.row["facts"]["bedrooms"] = 99
        self.write("dataset", self.dataset)
        self.assertIn("dataset_pin_mismatch", self.check(2)["blockers"])
        self.assertEqual(self.invoke("draft").returncode, 1)
        self.pins["datasetDigest"] = None
        self.write("pins", self.pins)
        self.draft()
        self.assertIn("datasetDigest_pin_missing", self.check(2)["blockers"])

    def test_false_indexing_requires_explicit_noindex_and_empty_release_never_clears(self):
        self.row["translations"]["ru"] = {"revision": None, "indexable": False}
        self.write("dataset", self.dataset)
        self.pins["datasetDigest"] = digest(self.files["dataset"].read_bytes())
        self.independent_scope()
        review = self.set_decisions()
        self.synthetic_record(review)
        self.assertIn("translation_unresolved:ru", self.check(2)["rows"][0]["blockers"])
        choices = json.loads(review["translation_decisions"])
        choices["ru"].update({"decision": "noindex", "receiptDigest": None})
        review["translation_decisions"] = encode(choices)
        self.synthetic_record(review)
        self.assertEqual(self.check(0)["rows"][0]["translations"]["ru"], {"decision": "noindex", "indexable": False})
        self.human["reviewer"] = "Butler"
        review["review_receipt_digest"] = self.store(self.human)
        self.save_csv([review])
        self.assertFalse(self.check(2)["rows"][0]["currentRecordMatched"])
        self.dataset["listings"] = []
        self.write("dataset", self.dataset)
        self.pins["datasetDigest"] = digest(self.files["dataset"].read_bytes())
        self.write("pins", self.pins)
        self.assertEqual(self.draft(), [])
        self.assertIn("empty_dataset", self.check(2)["blockers"])

    def test_reviewed_flags_cannot_reclassify_unknown_facts_or_reuse_a_missing_basis(self):
        self.row["facts"]["price"] = {"state": "conflicting"}
        self.row["availability"] = {"state": "withdrawn", "revision": "rev-1"}
        self.write("dataset", self.dataset)
        self.pins["datasetDigest"] = digest(self.files["dataset"].read_bytes())
        self.independent_scope()
        review = self.set_decisions()
        self.synthetic_record(review)
        details = self.check(2)["rows"][0]
        self.assertIn("price_decision_unresolved", details["blockers"])
        self.assertIn("availability_withdrawn", details["blockers"])
        self.basis["sellerInstructionDigest"] = None
        self.human["decisions"][self.reference]["basisDigest"] = self.store(self.basis)
        review["review_receipt_digest"] = self.store(self.human)
        self.save_csv([review])
        self.assertFalse(self.check(2)["rows"][0]["currentRecordMatched"])

    def test_precision_same_url_repeats_and_source_as_is(self):
        self.row["warnings"].append({**self.row["warnings"][0], "occurrence": 2})
        raw = encode(self.dataset).replace('"minor":12500', '"minor":123456789.012345678901234567890').encode()
        self.files["dataset"].write_bytes(raw)
        self.pins["datasetDigest"] = digest(raw)
        self.write("pins", self.pins)
        review = self.draft()[0]
        self.assertIn("123456789.012345678901234567890", review["price"])
        choices = json.loads(review["warning_decisions"])
        self.assertEqual([x["occurrence"] for x in choices], [1, 1, 2])
        result = self.check(2)
        self.assertEqual(result["rows"][0]["sourceAsIs"], "observed")
        self.assertFalse(result["rows"][0]["currentRecordMatched"])
        self.assertEqual(result["warningFamilies"]["structured_data.missing_area"], {"expected": 3, "reviewed": 0})


if __name__ == "__main__":
    unittest.main()
