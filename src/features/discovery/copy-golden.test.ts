// Temporary golden master (design/i18n-uncatalogued-copy-plan.md §3.3): the catalog-backed copy
// functions return exactly what their TypeScript dictionaries returned before the move to
// messages/, so no string or property-fact label changed on the way. Each hash is SHA-256 of
// one output with sorted keys, taken at 93cb3535. Delete this file once phase 1 has merged:
// reviewed catalog edits are expected to change these outputs.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publicLocales } from "@/i18n/config";
import { discoveryCopy } from "./copy";
import { intentCopy } from "./intent-copy";
import { mapCopy } from "./map-copy";

const golden: Record<"discovery" | "intent" | "map" | "mapListing", Record<string, string>> = {
  discovery: {
    bg: "0d2bd939dfd8ca0561f5e57df7efb3df38f48b169bc779353b89a944f69003e7",
    en: "b893eafef33e36f8c2047d98455142cd4857cb2a8999018274816a697f16b6a8",
    ru: "053d0c1c21d3bd77d775aab9a7cebcc8ed25385956d3b1a9d2b5a55fda344ba3",
    de: "5f7aa182d66ed206e40529a3a27f2f4b2f918b49df8df393434b45bfa280f80c",
    nl: "97a3b5fae7b6f50889c98d71a14254df964a6e47f567073fe86629f2d9590d09",
    el: "f50e74a8cf08fcfe7e78d5e28aa2848e9015006dea54195a3de930cc4e5e7130",
    he: "a764b18b3f0ad74a676e2a0752271649a5c4a2562b7937177ded8753da3d21fe",
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
};

function hash(copy: Readonly<Record<string, string>>, added: readonly string[] = []): string {
  const kept = Object.entries(copy)
    .filter(([key]) => !added.includes(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256")
    .update(JSON.stringify(Object.fromEntries(kept)))
    .digest("hex");
}

describe.each([...publicLocales])("%s copy moved to messages/ unchanged", (locale) => {
  it("discovery, apart from the new catalogue search-alert link", () => {
    expect(hash(discoveryCopy(locale), ["alertEntry"])).toBe(golden.discovery[locale]);
  });
  it("intent", () => {
    expect(hash(intentCopy(locale))).toBe(golden.intent[locale]);
  });
  it("map, for search results and for one listing", () => {
    expect(hash(mapCopy(locale))).toBe(golden.map[locale]);
    expect(hash(mapCopy(locale, "listing"))).toBe(golden.mapListing[locale]);
  });
});
