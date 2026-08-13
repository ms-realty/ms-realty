function parsedPostgresTarget(value, label) {
  const raw = String(value || "");
  const text = raw.trim();
  if (!text) throw new Error(`${label} must include database target evidence`);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} must include a valid Postgres target`);
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(`${label} must use postgres:// or postgresql://`);
  }
  if (!parsed.hostname) throw new Error(`${label} must include a database host`);
  let database;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\//, "")).trim();
  } catch {
    throw new Error(`${label} must include a valid database name`);
  }
  if (!database) throw new Error(`${label} must include a database name`);
  return { parsed, database, raw, text };
}

function canonicalTarget(parsed, database) {
  return `${parsed.protocol}//${parsed.hostname}:${Number(parsed.port || 5432)}/${encodeURIComponent(database)}`;
}

export function redactPostgresDatabaseTarget(value, label = "DATABASE_URL") {
  const { parsed, database } = parsedPostgresTarget(value, label);
  return canonicalTarget(parsed, database);
}

export function assertExactRedactedPostgresTarget(value, label = "Postgres database target") {
  const { parsed, database, raw, text } = parsedPostgresTarget(value, label);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must be an exact redacted Postgres target without credentials, query, or fragment`);
  }
  const canonical = canonicalTarget(parsed, database);
  if (raw !== text || text !== canonical) {
    throw new Error(`${label} must be an exact redacted Postgres target`);
  }
  return canonical;
}
