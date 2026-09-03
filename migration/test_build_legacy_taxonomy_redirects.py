import json
import pathlib
import unittest

from build_legacy_taxonomy_redirects import propose, segments_for

REGISTRY = segments_for(json.loads(pathlib.Path("../locales/registry.json").read_text(encoding="utf-8")))


class ProposeTest(unittest.TestCase):
    def test_property_type_archive_targets_the_facet_of_its_own_language(self):
        self.assertEqual(
            propose("https://makler-realty.com/de/category-type/dom/", "makler-realty.com", REGISTRY),
            ("301", "/de/suche?property_family=house", "property type archive"),
        )

    def test_bare_com_path_is_bulgarian_and_ru_domain_is_russian(self):
        decision, target, _ = propose("https://makler-realty.com/category-type/hotel/", "makler-realty.com", REGISTRY)
        self.assertEqual((decision, target), ("301", "/bg/tarsene?property_family=hotel"))
        decision, target, _ = propose("https://makler-realty.ru/category-type/hotel/", "makler-realty.ru", REGISTRY)
        self.assertEqual((decision, target), ("301", "/ru/search?property_family=hotel"))

    def test_offer_type_and_resort_with_inventory(self):
        self.assertEqual(propose("https://makler-realty.com/property/sell/", "makler-realty.com", REGISTRY)[1], "/bg/tarsene?offer_type=sale")
        self.assertEqual(propose("https://makler-realty.com/resort/petrich/", "makler-realty.com", REGISTRY)[1], "/bg/lokacii/petrich")

    def test_everything_without_an_indexable_equivalent_stays_gone(self):
        for url in (
            "https://makler-realty.com/resort/%d0%bd%d0%b5%d0%b4%d0%b2%d0%b8%d0%b6%d0%b8%d0%bc%d0%be%d1%81%d1%82%d1%8c-%d0%b2-%d0%b1%d0%b0%d0%bd%d1%81%d0%ba%d0%be/",
            "https://makler-realty.com/category-type/%d0%b5lite-realtor/",
            "https://makler-realty.com/floors/3/",
            "https://makler-realty.com/type/featured/",
        ):
            self.assertEqual(propose(url, "makler-realty.com", REGISTRY)[0], "410", url)
