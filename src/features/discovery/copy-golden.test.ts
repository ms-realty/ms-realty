// Frozen outputs from the integrated source before this catalog migration. These hashes
// establish accessor equivalence; they do not approve wording or translation quality.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publicLocales } from "@/i18n/config";
import { discoveryCopy } from "./copy";
import { intentCopy } from "./intent-copy";
import { mapCopy } from "./map-copy";

const golden = {
  discovery: {
    bg: "1c03fe02f7748c10412673d2945bb6f811078f54b44db433751e40cf42760dcd",
    en: "1b85f4d901e86e58f813d22e70800d76a9c1747053bbbf44bceb27fdb8b05ea1",
    ru: "37bb832e708598478f6001ec3f3671101e598567ca19b40a1974d525e812b7b3",
    de: "b1904c90c03cb712631238906b7a3dbcd5277400a926ebf2a329c6625f77c57e",
    nl: "3b9eced36ce7ecc5ca4813bf2c98b8c5025d4560e838b32e734ecd1bb3928e10",
    el: "a0eb2d273d0935085f73c0a0e0f4a3c900a1e9fe6d5f5a658846c3a12ee86f50",
    he: "fd6d75b45cd28e659bd2f5b43db48fa054ee2d30021c96cb33a7ab683e32835d",
  },
  intent: {
    bg: "7df079995fe6fd3bed3f950dd29a45fd0aee5cfa8559207eab1c40c96adafc48",
    en: "9945750df95bbacff04d5cc509019fbd395706a7c81a1e5ee7cb434d3685e5a6",
    ru: "aa6aebbd779683da8d1b1de3b0d41775ab44564b706c4732d87db84f1793b300",
    de: "35fcf045ee385054a7c6d92105a51fa9b50fc479e479eb2bfeece24e21654b9f",
    nl: "9ec01c93dd175e129dbfe1f2788fc6385510e9d2e1f27e11c8ff2d8f1d24ff61",
    el: "e5394e36571df583398ab41287c693571a5c97dd59b2de6a95073817c67c736f",
    he: "417d63f9504d8ce939056b772475892b772ebaa991df025e0e26aeaa63a28429",
  },
  map: {
    bg: "09a0733b1f2780d964575073159b709dc7b331e72d5dba76551782746b6bae5a",
    en: "0d206439cc755eaa35de31daf57de37f83ff7bf87ad2e08a4011e49f99a2a4ba",
    ru: "813641d673aa7b1c588641f2174f23a97cbc7e5bbf6a8e7dd37212e64ba12beb",
    de: "31f04b3230693b82ead292517da202b8360406aadf1efb6dbe13737669e00c91",
    nl: "60386c1c0378fee57aef4150fb5316b2da453678b4aeb4d8c46cf6f1eedce8a6",
    el: "19e93d8151978cf9fdea72493b92cdde909f713918197490b870bc36385e5e91",
    he: "991be37966ac511c903d97d10c6d32ccbcb22cee113250b56bbda3073e8b3c2d",
  },
  mapListing: {
    bg: "82f252f2c16b75b7d5be6873867fe92aa84537579159ce152f4b56e86161127f",
    en: "a13a47e9f8be19dacb7c11058e6c8f7cbd7755a690bf32e39a23bb60e8ce8e92",
    ru: "82166494be0aeacb04662840d2346c7be7f1d855e881010cdd17ea6623057591",
    de: "ea1d92ee8bee11f6097f7215153d0e0053f83e7c0de31053db5fd0ebf12271fa",
    nl: "13ddd4260a0e904efe4339fb1277e678dd41f01fc3de06385a71d67efe87a837",
    el: "fe95f75e9b2cae092ebe3b6a283c7aa2f8abf2ea8792aed9febb31be7b7d3208",
    he: "7e91692df9f1f7f178cc617b99aba6eb8a8964c15a21012fb847073a039d7782",
  },
} as const;

// The intent question was deliberately rewritten after migration, and the gallery gained
// a disclosure label. Restore the old question and exclude that added key for this historical
// equivalence check; every original key/value keeps its frozen hash.
// Catalog tests still enforce its presence, nonempty translation, script and placeholders.
const originalPurpose = {
  bg: "Цел",
  en: "Purpose",
  ru: "Цель",
  de: "Zweck",
  nl: "Doel",
  el: "Σκοπός",
  he: "מטרה",
} as const;

function hash(copy: Readonly<Record<string, string>>): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(Object.entries(copy).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      ),
    )
    .digest("hex");
}

describe.each([...publicLocales])("%s accessors preserve the catalog migration", (locale) => {
  it("preserves discovery except the revised intent question, and every intent key and value", () => {
    const { morePhotos, ...discovery } = discoveryCopy(locale);
    expect(morePhotos).toContain("{count}");
    expect(Object.hasOwn(discovery, "purpose")).toBe(true);
    expect(hash({ ...discovery, purpose: originalPurpose[locale] })).toBe(golden.discovery[locale]);
    expect(hash(intentCopy(locale))).toBe(golden.intent[locale]);
  });
  it("preserves the search and listing map text independently", () => {
    expect(hash(mapCopy(locale))).toBe(golden.map[locale]);
    expect(hash(mapCopy(locale, "listing"))).toBe(golden.mapListing[locale]);
  });
  it("keeps each caller's returned object independent", () => {
    expect(discoveryCopy(locale)).not.toBe(discoveryCopy(locale));
    expect(intentCopy(locale)).not.toBe(intentCopy(locale));
    expect(mapCopy(locale)).not.toBe(mapCopy(locale));
  });
});
