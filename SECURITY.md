# Byte Drop Security Policy

Byte Drop is a standalone, local-first application for recording AI usage metadata and estimating operational water consumption. It is designed around minimum data, minimum permissions, minimum network access, secure defaults, and fail-closed behavior.

This document describes the current security posture of the source release. **It is not a guarantee of absolute security.** Security depends on the environment in which Byte Drop is installed and operated.

## Supported release

The current repository release is the supported release for security fixes. Users should keep the source checkout and dependencies current and should re-run the release verification commands after dependency or configuration changes.

## Runtime boundary

The browser communicates with the local Express API. SQLite is the default persistence layer. Prisma 7 uses the official `@prisma/adapter-libsql` driver adapter, and the Prisma CLI reads the database URL from `prisma.config.ts`.

The production server binds to `127.0.0.1` by default. Setting `HOST` is an explicit deployment decision and should only be done after reviewing the exposure implications.

Byte Drop does not require an account, cloud database, remote file store, platform-managed secret, analytics system, telemetry service, or hidden background service.

Provider adapters are opt-in. The default application does not need to make provider requests. External provider endpoints must satisfy the documented HTTPS/host policy on port 443. Local model endpoints must be explicitly configured literal loopback addresses (`127.0.0.1` or `[::1]`).

## Data handled by the application

Byte Drop stores normalized AI usage metadata and calculation metadata. It is intentionally designed **not** to store:

- Prompts or prompt contents.
- Model responses or generated content.
- Chat transcripts.
- Private files.
- Provider API keys or other credentials in the database.
- Unrelated computer activity.

Provider API keys are server-side configuration values. They must never be placed in frontend-exposed environment variables.

## Security controls

| Threat / concern | Current control | Verification |
|---|---|---|
| Malicious input | Zod validation, bounded strings/arrays, request-size limits, JSON-depth limits, bounded pagination and database queries | Automated security tests |
| XSS / unsafe DOM use | React escaped rendering and no intentional dangerous HTML sink | Source review and tests |
| SQL injection | Prisma query APIs and validated input; no user-controlled raw SQL | Source review and tests |
| SSRF | HTTPS/documented-host policy, literal-loopback local mode, redirect rejection, credential URL rejection | Provider/security tests |
| CORS / origin abuse | Explicit API-only allowlist; wildcard and arbitrary-origin reflection rejected | CORS tests |
| CSRF boundary | Same-origin default plus explicit origin validation for API access | Security tests |
| Provider abuse | 15-second timeout, bounded response body, strict schema validation, generic failures | Provider tests |
| Secret exposure | Server-only credentials; no provider-body/header logging; sanitized errors | Source and secret scans |
| Resource exhaustion | Rate-limit rejection, expiration cleanup, bounded bucket count, bounded reads/parses | Security tests |
| Browser privacy | No required analytics, telemetry, tracking pixels, session recording, clipboard reads, or browser filesystem access | Source/network review |
| Clickjacking/content injection | CSP with `frame-ancestors 'none'`, `nosniff`, `DENY`, no-referrer, restrictive Permissions Policy | Header tests |
| Error disclosure | Generic parser/application/provider errors without paths, credentials, provider bodies, or stack traces | Security tests |

## HTTP security policy

Security headers apply across static documents, assets, and API responses. Production CSP restricts scripts, styles, connections, images, and fonts to same-origin resources, with the existing inline-style requirement retained for the UI styling system. Development-only HMR WebSockets are limited to localhost and are absent from the production CSP.

CORS is limited to API routes and uses the configured allowlist. Wildcard CORS and arbitrary-origin reflection are rejected. Requests without an `Origin` header do not receive an invented CORS header.

The API uses bounded JSON and urlencoded parsers. Malformed or oversized bodies are converted to controlled errors, and unexpected application errors are returned through a privacy-safe final boundary.

Error responses must not expose filesystem paths, environment variables, database URLs, provider URLs, provider response bodies, API keys, authorization headers, or stack traces.

## Provider security boundary

Provider responses are untrusted input.

- Outbound provider requests have a maximum 15-second timeout.
- Provider response bodies are limited to 256 KB.
- Declared response sizes are rejected when they exceed the limit.
- Responses without a declared size are consumed through a bounded streaming reader.
- JSON is parsed only after the response body limit is enforced.
- Malformed JSON, unsupported shapes, HTTP errors, connection failures, aborts, and timeouts are converted to generic provider failures.
- Redirects are rejected.
- External provider URLs must use HTTPS on port 443 and satisfy the documented-host policy.
- Local model endpoints are limited to explicitly configured literal loopback addresses.
- Embedded URL credentials and credential-like query parameters are rejected.
- Raw provider payloads are not returned to the browser.
- Every normalized returned event is validated against the strict usage schema before persistence or return.
- Mixed valid/invalid provider arrays are rejected rather than partially accepted.

The local model path requires no API secret and does not silently fall back to an external provider.

## Rate limiting and resource bounds

The API applies bounded rate limiting with expiration cleanup and a maximum in-memory bucket count. Request parsing, provider response handling, JSON nesting, collection sizes, pagination, and database reads are bounded to reduce accidental or malicious resource exhaustion.

The in-memory rate limiter is intentionally scoped to a single application process. It is not a substitute for a distributed reverse-proxy or gateway rate limiter in a multi-instance public deployment.

## Dependency posture

The release uses a frozen pnpm lockfile. Key direct versions in the verified project are:

| Component | Version / requirement |
|---|---:|
| Node.js | `>=22.0.0` |
| pnpm | `>=10.4.1` |
| React | `19.2.8` |
| Vite | `8.2.2` |
| TypeScript | `7.0.2` |
| Express | `5.2.1` |
| Prisma / `@prisma/client` | `7.10.0` |
| Zod | `4.4.3` |
| Vitest | `4.1.11` |
| Tailwind CSS | `4.3.3` |
| `@prisma/adapter-libsql` | `7.10.0` |

The repository's `.pnpmfile.cjs` is part of the reproducible dependency configuration. It pins the required patched transitive packages recorded in the lockfile and does not suppress dependency advisories or alter audit results.

Do not remove or bypass the committed pnpm configuration simply to make an install succeed. Regenerate the lockfile deliberately when dependencies are intentionally changed.

## Database security and retention

Use a new SQLite database for fresh installations and keep local database files outside the source handoff. Database files must not be committed.

The repository contains the Prisma schema and migration history, not a development database. The application does not auto-seed production usage records.

The settings flow provides confirmation-gated deletion of local records. Users are responsible for protecting the local machine, filesystem permissions, backups, and any explicitly configured external provider credentials.

## Release verification

From a clean checkout, run:

```bash
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm check
pnpm test
pnpm build
pnpm audit
pnpm audit --prod --audit-level high
```

A release should also verify:

1. A fresh empty SQLite database can be migrated successfully.
2. Basic CRUD behavior works against the fresh database.
3. Production binds to the intended host and port.
4. CORS and security headers behave as intended.
5. Rate limiting remains bounded and cleans up expired state.
6. Provider timeout and 256 KB response limits are enforced.
7. SSRF, redirect, credential-URL, and unsafe-local-endpoint cases are rejected.
8. Invalid schemas, malformed JSON, oversized requests, and unsafe numbers/timestamps are rejected.
9. Error responses and logs do not expose secrets or sensitive implementation details.
10. No secrets, personal data, databases, generated output, logs, or temporary artifacts are present in the release archive.

Automated tests are evidence of the tested controls; they do not establish that the software is immune to all vulnerabilities.

## Clean artifact policy

The GitHub source release should contain source code, configuration, migrations, tests, documentation, and the lockfile. It should not contain:

- `.env` or other secret-bearing environment files.
- API keys, passwords, tokens, certificates, or private keys.
- `node_modules/`.
- `dist/` or other generated build output.
- `generated/` Prisma output.
- SQLite databases or journals.
- Logs, caches, coverage data, temporary files, or editor metadata.
- Personal or development usage records.

The `.gitignore` file provides baseline protection, but a final `git status`/archive-content review remains required before publication.

## Vulnerability reporting

**Do not report security vulnerabilities through public GitHub issues or other public channels.**

If GitHub Security Advisories/private vulnerability reporting is enabled for the repository, use that private channel. Otherwise, contact the repository maintainer through the private contact method published with the repository or its owner profile.

When reporting a vulnerability, include:

- Affected version or commit.
- Affected module, route, or configuration.
- Expected behavior and observed behavior.
- A minimal reproduction or proof of concept where safe.
- Security impact and any required conditions for exploitation.

Do not include real API keys, passwords, private usage data, or other secrets in a report.

Please allow the maintainer reasonable time to investigate and release a fix before public disclosure.

## Security limitations

Byte Drop is designed primarily for local single-user use. Exposing it to a shared or public network changes the threat model. In particular, operators should add appropriate network access controls, TLS termination, authentication/authorization, centralized rate limiting, process isolation, monitoring, and secret-management practices before treating the application as a public multi-user service.

No security review can guarantee the absence of future vulnerabilities. Dependency vulnerabilities, operating-system vulnerabilities, deployment mistakes, and newly discovered application flaws remain possible.

## References

- [Prisma ORM v7 upgrade guidance][prisma-v7]
- [Prisma SQLite quickstart][prisma-sqlite]

[prisma-v7]: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
[prisma-sqlite]: https://www.prisma.io/docs/v7/prisma-orm/quickstart/sqlite
