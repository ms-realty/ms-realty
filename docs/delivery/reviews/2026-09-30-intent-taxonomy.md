# Complete search-intent taxonomy

F02/F29 previously limited the joined place/alias rows to 20,000. Extra names could remove later places and conceal an ambiguity. The reader now groups complete, ordered aliases per identity, with native/Latin names first. Its 20,000-place bound explicitly refuses oversized registries through the existing unavailable/manual-filter path. It re-reads the taxonomy; no facts, private addresses or interpretation results are cached.

Reading the complete alias fixture exposed a second defect: a single registry-sized regular expression blocked the Node worker. Ordered batches preserve leftmost matching, alternative priority, original text offsets, inflection and ambiguity while bounding individual compilation. No model, provider call or automatic filter application was introduced.

Evidence in `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260930/`:

- `intent-source-baseline.log`: all three real PostgreSQL regression checks fail against the previous reader.
- `intent-source-final.log`: reader aggregation alone passes overflow rejection, but the complete-registry interpreter times out; the full run takes 106.97 seconds. Preserved as failed evidence.
- `intent-source-qualified.log`: 166 checks pass in 3.45 seconds after both repairs, including more than 20,000 aliases, current-name replacement, complete refusal of oversized place registries, seven-locale behavior and cross-batch match priority.
- `intent-source-types.log` and `intent-source-lint.log`: TypeScript and 901-file lint pass.

These checks use an isolated PostgreSQL 18 database with synthetic names. They do not approve the imported live taxonomy, human translations, optional model interpretation or R08 load budgets. PostgreSQL [aggregate ordering](https://www.postgresql.org/docs/18/functions-aggregate.html) and [SELECT grouping/limiting](https://www.postgresql.org/docs/18/sql-select.html) underpin the query change.
