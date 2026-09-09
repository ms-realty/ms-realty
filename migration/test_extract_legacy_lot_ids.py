import unittest

from extract_legacy_lot_ids import prefix_match, slug_key, split_tuples, split_values


class SlugKeyTest(unittest.TestCase):
    def test_decodes_and_drops_the_trash_suffix(self):
        self.assertEqual(slug_key("%d0%b4%d0%b2%d1%83%d1%81%d1%82%d0%b0%d0%b5%d0%bd"), "двустаен")
        self.assertEqual(slug_key("kashta-v-sandanski__trashed"), "kashta-v-sandanski")
        self.assertEqual(slug_key("kashta-v-sandanski__trashed-2"), "kashta-v-sandanski")


class DumpParsingTest(unittest.TestCase):
    def test_keeps_escaped_quotes_and_commas_inside_values(self):
        self.assertEqual(split_values("1,'a\\'b','x, y'"), ["1", "a'b", "x, y"])

    def test_splits_extended_inserts(self):
        rows = split_tuples("(1,25,'wtf_pid','904'),\n(2,26,'wtf_pid','905');")
        self.assertEqual(rows, [["1", "25", "wtf_pid", "904"], ["2", "26", "wtf_pid", "905"]])


class PrefixMatchTest(unittest.TestCase):
    listings = {
        ("makler-realty.com", "prodava-panoramen-dvustaen-apartament"): {"legacy_lot_id": "904"},
        ("makler-realty.com", "prodava-panoramen-tristaen-apartament"): {"legacy_lot_id": "905"},
    }

    def test_recovers_a_slug_truncated_by_one_character(self):
        hit = prefix_match(self.listings, "makler-realty.com", "prodava-panoramen-dvustaen-apartamentt")
        self.assertEqual(hit["legacy_lot_id"], "904")

    def test_refuses_an_ambiguous_or_too_short_prefix(self):
        self.assertIsNone(prefix_match(self.listings, "makler-realty.com", "prodava-panoramen"))
        self.assertIsNone(prefix_match(self.listings, "makler-realty.ru", "prodava-panoramen-dvustaen-apartament"))
