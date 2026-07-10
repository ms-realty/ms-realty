function filled(value) {
  return value !== null && value !== undefined && value !== "";
}

function asNumber(value) {
  if (!filled(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildListingSchema({ path: listingPath, view, copy, publicMedia }) {
  const price = asNumber(view.price_eur);
  const schema = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${listingPath}#listing`,
    url: listingPath,
    identifier: view.id,
    name: copy.title,
    description: copy.description,
    category: view.property_type,
    image: publicMedia.gallery.map((item) => item.url),
    additionalProperty: [
      { "@type": "PropertyValue", name: "offer_type", value: view.offer_type },
      { "@type": "PropertyValue", name: "bedrooms", value: view.bedrooms },
      { "@type": "PropertyValue", name: "source_locale", value: view.source_locale },
    ].filter((item) => filled(item.value)),
  };

  if (filled(view.location)) {
    schema.areaServed = {
      "@type": "Place",
      name: view.location,
    };
  }

  if (price !== null) {
    schema.offers = {
      "@type": "Offer",
      price,
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
    };
  }

  return schema;
}

export function schemaIssues(schema) {
  const issues = [];
  if (schema?.["@context"] !== "https://schema.org") issues.push("missing_context");
  if (schema?.["@type"] !== "RealEstateListing") issues.push("missing_listing_type");
  for (const field of ["@id", "url", "identifier", "name", "description"]) {
    if (!filled(schema?.[field])) issues.push(`missing_${field.replace("@", "")}`);
  }
  return issues;
}

export function assertListingSchema(schema) {
  const issues = schemaIssues(schema);
  if (issues.length) throw new Error(`Listing schema is not launch-ready: ${issues.join(", ")}`);
  return true;
}
