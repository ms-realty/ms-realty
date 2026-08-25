import { absolutePublicUrl, isAbsoluteHttpUrl } from "./public-origin.mjs";

function filled(value) {
  return value !== null && value !== undefined && value !== "";
}

function asNumber(value) {
  if (!filled(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRentalOffer(offerType) {
  return String(offerType || "").trim().toLowerCase() === "rent";
}

// A rent is a recurring price, not a sale price. Published as a bare
// `offers.price` a 600 EUR monthly flat is a 600 EUR property to Google, price
// comparison surfaces and answer engines -- a factually false commercial claim
// about the agency's inventory. UnitPriceSpecification with the UN/CEFACT code
// for a month is the periodicity those consumers read.
function offersFor(view, price) {
  const offer = {
    "@type": "Offer",
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
  };
  if (!isRentalOffer(view.offer_type)) return { ...offer, price };
  return {
    ...offer,
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price,
      priceCurrency: "EUR",
      unitCode: "MON",
      unitText: "MONTH",
    },
  };
}

export function buildListingSchema({ path: listingPath, view, copy, publicMedia }) {
  const candidatePrice = asNumber(view.price_eur);
  const price = view.price_on_request === true || candidatePrice === null || candidatePrice <= 1 ? null : candidatePrice;
  // A relative @id is no identifier at all: the node cannot be linked to or
  // deduplicated across the site.
  const url = absolutePublicUrl(listingPath);
  const schema = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${url}#listing`,
    url,
    identifier: view.id,
    name: copy.title,
    description: copy.description,
    category: view.property_type,
    image: publicMedia.gallery.map((item) => item.url),
    additionalProperty: [
      { "@type": "PropertyValue", name: "offer_type", value: view.offer_type },
      { "@type": "PropertyValue", name: "bedrooms", value: view.bedrooms },
      { "@type": "PropertyValue", name: "floor_area_sqm", value: asNumber(view.area_sqm) },
      { "@type": "PropertyValue", name: "floor", value: asNumber(view.floor) },
      { "@type": "PropertyValue", name: "total_floors", value: asNumber(view.total_floors) },
      { "@type": "PropertyValue", name: "land_area_sqm", value: asNumber(view.land_area_sqm) },
      { "@type": "PropertyValue", name: "condition", value: view.condition },
    ].filter((item) => filled(item.value)),
  };

  if (filled(view.workflow?.availability_verified_at)) schema.dateModified = view.workflow.availability_verified_at;

  if (filled(view.location)) {
    schema.areaServed = {
      "@type": "Place",
      name: view.location,
    };
  }

  if (price !== null) schema.offers = offersFor(view, price);

  return schema;
}

export function schemaIssues(schema) {
  const issues = [];
  if (schema?.["@context"] !== "https://schema.org") issues.push("missing_context");
  if (schema?.["@type"] !== "RealEstateListing") issues.push("missing_listing_type");
  for (const field of ["@id", "url", "identifier", "name", "description"]) {
    if (!filled(schema?.[field])) issues.push(`missing_${field.replace("@", "")}`);
  }
  for (const field of ["@id", "url"]) {
    if (filled(schema?.[field]) && !isAbsoluteHttpUrl(schema[field])) issues.push(`relative_${field.replace("@", "")}`);
  }
  const offerType = (schema?.additionalProperty || []).find((item) => item.name === "offer_type")?.value;
  if (isRentalOffer(offerType) && filled(schema?.offers?.price)) issues.push("rent_offer_price");
  return issues;
}

export function assertListingSchema(schema) {
  const issues = schemaIssues(schema);
  if (issues.length) throw new Error(`Listing schema is not launch-ready: ${issues.join(", ")}`);
  return true;
}
