# Development dependency correction

GitHub Dependabot alert 2 reports transitive esbuild <=0.24.2 in the default branch.
The recovery branch also carried 0.18.20 through drizzle-kit -> @esbuild-kit/esm-loader ->
@esbuild-kit/core-utils. The application compiler is already 0.28.2; Drizzle itself uses
0.25.12. A scoped override moves only core-utils to 0.25.12, above the advisory's 0.25.0
first-patched version. The legacy loader's removal remains an upstream dependency decision.

Only esbuild and its platform binaries changed in the lockfile. Unrelated platform/peer
metadata that npm rewrote during install was restored. Clean `npm ci` validates the final
lock and reports zero known vulnerabilities in its current audit; this is not a general
security certification. Both synchronous CommonJS and asynchronous ESM transformations via
core-utils executed and returned the expected runtime value. Drizzle generation reports no
schema change. Seventeen actual PostgreSQL schema/complaint tests and lint passed.

The advisory stays open on GitHub until a corrected dependency graph reaches the default
branch; it was not dismissed. No production dependency, database content or provider setting
was changed. Evidence: `/Users/ivan/Code/.artifacts/ms-realty/dependencies/20260929`.
