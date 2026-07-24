import {
  DEFAULT_LEAD_LEDGER_PATH,
  exportLeadLedgerJsonl,
  importLeadLedgerJsonl,
  readLeadLedger,
  sqlitePathFor,
} from "../lib/lead-ledger.mjs";

const [command, sourceArg, targetArg] = process.argv.slice(2);
const filePath = targetArg || DEFAULT_LEAD_LEDGER_PATH;

if (command === "import") {
  if (!sourceArg) {
    console.error("usage: node production/scripts/run-lead-ledger-sqlite.mjs import <source.jsonl> [ledger-path]");
    process.exit(1);
  }
  const rows = importLeadLedgerJsonl(sourceArg, filePath);
  console.log(JSON.stringify({ kind: "lead_ledger_sqlite_import", source: sourceArg, ledger: filePath, sqlite: sqlitePathFor(filePath), rows }));
} else if (command === "export") {
  const rows = exportLeadLedgerJsonl(filePath, sourceArg || filePath);
  console.log(JSON.stringify({ kind: "lead_ledger_sqlite_export", ledger: filePath, output: sourceArg || filePath, rows }));
} else if (command === "status") {
  const rows = readLeadLedger(filePath);
  console.log(JSON.stringify({ kind: "lead_ledger_sqlite_status", ledger: filePath, sqlite: sqlitePathFor(filePath), rows: rows.length }));
} else {
  console.error("usage: node production/scripts/run-lead-ledger-sqlite.mjs <import <source.jsonl>|export [output.jsonl]|status> [ledger-path]");
  process.exit(1);
}
