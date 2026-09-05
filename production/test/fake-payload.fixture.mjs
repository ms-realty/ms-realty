// An in-memory stand-in for the Payload runtime the document service talks
// to: find, create, update, with the where-clause subset the service uses.
// Shared by every test that drives the document routes.
function scalarEqual(actual, expected) {
  if (actual === expected) return true;
  if (actual === null || actual === undefined || expected === null || expected === undefined) return false;
  return String(actual) === String(expected);
}

function matches(where, row) {
  if (!where) return true;
  if (Array.isArray(where.and)) return where.and.every((clause) => matches(clause, row));
  if (Array.isArray(where.or)) return where.or.some((clause) => matches(clause, row));
  return Object.entries(where).every(([field, condition]) => {
    if (field === "and" || field === "or") return matches({ [field]: condition }, row);
    const value = row[field];
    if (!condition || typeof condition !== "object") return scalarEqual(value, condition);
    if (Object.hasOwn(condition, "equals")) return scalarEqual(value, condition.equals);
    if (Object.hasOwn(condition, "in")) return condition.in.some((candidate) => scalarEqual(value, candidate));
    return true;
  });
}

export class FakePayload {
  constructor() {
    this.rows = new Map();
    this.nextId = 1;
  }

  async find({ collection, where }) {
    return { docs: [...(this.rows.get(collection) || [])].filter((row) => matches(where, row)) };
  }

  async create({ collection, data }) {
    const now = new Date().toISOString();
    const row = { id: String(this.nextId++), ...data, createdAt: now, updatedAt: now };
    this.rows.set(collection, [...(this.rows.get(collection) || []), row]);
    return row;
  }

  async update({ collection, id, data }) {
    const rows = [...(this.rows.get(collection) || [])];
    const index = rows.findIndex((row) => scalarEqual(row.id, id));
    if (index < 0) throw new Error(`Missing ${collection}:${id}`);
    rows[index] = { ...rows[index], ...data, updatedAt: new Date().toISOString() };
    this.rows.set(collection, rows);
    return rows[index];
  }
}

