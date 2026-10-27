import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { PublicPlace } from "@/server/listings/view-models";
import { Locality, placeNameLanguage } from "./locality";

afterEach(cleanup);
it("P02/P05 keeps recorded native/Latin locality names in source language islands within RTL", () => {
  const name = {
    id: "id",
    level: "settlement",
    slug: "synthetic",
    name: "Sandanski",
    nameNative: "Сандански",
    nameLatin: "Sandanski",
  } as const;
  const place: PublicPlace = {
    country: "BG",
    district: null,
    municipality: null,
    settlement: name,
    neighborhood: "Synthetic recorded area",
    precision: "neighborhood",
  };
  render(
    <div lang="he" dir="rtl">
      <Locality listing={{ place }} />
    </div>,
  );
  expect(screen.getByText("Sandanski")).toHaveAttribute("lang", "bg-Latn");
  expect(screen.getByText("Synthetic recorded area")).toHaveAttribute("lang", "und");
  expect(placeNameLanguage({ ...name, name: name.nameNative }, "BG")).toBe("bg");
  expect(placeNameLanguage(name, "UNKNOWN")).toBe("und");
});
