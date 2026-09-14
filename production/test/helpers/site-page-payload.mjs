import assert from "node:assert/strict";

function matches(row, where) {
  return where.and ? where.and.every((clause) => matches(row, clause)) : Object.entries(where).every(([key, condition]) => row[key] === condition.equals);
}

// Models the Local API subset and transaction boundaries, not Postgres itself.
// The opt-in integration test separately checks the real adapter and database.
export class PagePayload {
  rows = { site_pages: [], site_page_revisions: [] };
  generation = 0;
  nextId = 1;
  transactions = new Map();
  calls = [];
  failOperation = null;
  commitOutcomeUnknown = false;
  commitWithoutApply = false;
  db = {
    beginTransaction: async (options) => {
      assert.equal(options.isolationLevel, "serializable");
      const id = this.nextId++;
      this.transactions.set(id, { rows: structuredClone(this.rows), generation: this.generation });
      return id;
    },
    commitTransaction: async (id) => {
      const transaction = this.transactions.get(id);
      if (transaction.generation !== this.generation) throw Object.assign(new Error("concurrent write"), { code: "40001" });
      if (this.commitWithoutApply) { this.transactions.delete(id); return; }
      this.rows = transaction.rows;
      this.generation++;
      this.transactions.delete(id);
      if (this.commitOutcomeUnknown) throw new Error("commit response lost");
    },
    rollbackTransaction: async (id) => { this.transactions.delete(id); },
  };

  records(req) { return req ? this.transactions.get(req.transactionID).rows : this.rows; }
  record(operation, args) {
    this.calls.push({ operation, ...structuredClone({ collection: args.collection, data: args.data, transactionID: args.req?.transactionID }) });
    assert.equal(args.overrideAccess, true);
    if (operation !== "find") assert.ok(args.req?.transactionID, "every write belongs to the same transaction");
    if (this.failOperation === `${operation}:${args.collection}`) throw new Error("storage connection lost");
  }
  async find(args) {
    this.record("find", args);
    return { docs: structuredClone(this.records(args.req)[args.collection].filter((row) => matches(row, args.where))) };
  }
  async create(args) {
    this.record("create", args);
    const row = { id: this.nextId++, ...structuredClone(args.data), createdAt: "2026-09-14T10:00:00.000Z" };
    this.records(args.req)[args.collection].push(row);
    return structuredClone(row);
  }
  async update(args) {
    this.record("update", args);
    const rows = this.records(args.req)[args.collection];
    const index = rows.findIndex((row) => row.id === args.id);
    assert.notEqual(index, -1);
    rows[index] = { ...rows[index], ...structuredClone(args.data) };
    return structuredClone(rows[index]);
  }
}
