import type { ListingCard, PlaceName } from "@/server/listings/view-models";

const recordedLanguages: Record<string, string> = { BG: "bg", GR: "el" };
/** The recorded native/Latin names are source text, never an invented locale translation. */
export function placeNameLanguage(
  place: Pick<PlaceName, "name" | "nameNative" | "nameLatin">,
  country: string,
) {
  const source = recordedLanguages[country];
  return !source
    ? "und"
    : place.name === place.nameNative
      ? source
      : place.name === place.nameLatin
        ? `${source}-Latn`
        : "und";
}
export function Locality({ listing }: { listing: Pick<ListingCard, "place"> }) {
  const place = listing.place;
  const values = [
    ...(place.neighborhood ? [{ text: place.neighborhood, lang: "und" }] : []),
    ...[place.settlement, place.municipality ?? place.district].flatMap((name) =>
      name ? [{ text: name.name, lang: placeNameLanguage(name, place.country) }] : [],
    ),
  ].filter((item, index, all) => all.findIndex((other) => other.text === item.text) === index);
  return values.length ? (
    values.map((item, index) => (
      <span key={`${item.lang}-${item.text}`}>
        {index ? ", " : ""}
        <bdi lang={item.lang} dir="auto">
          {item.text}
        </bdi>
      </span>
    ))
  ) : (
    <bdi>{place.country}</bdi>
  );
}
