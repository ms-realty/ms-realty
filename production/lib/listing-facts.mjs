const BEDROOM_EXEMPT_TYPES = new Set(["land", "commercial", "hotel"]);

export function bedroomsRequired(facts = {}) {
  return !BEDROOM_EXEMPT_TYPES.has(facts.property_type);
}
