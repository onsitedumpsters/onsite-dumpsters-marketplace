# Security

Non-negotiable requirements from BUILD_SPEC §10 and how this repo meets them.

## HTTP security headers

Set in `next.config.ts`: Content-Security-Policy (CSP), Strict-Transport-Security
(HSTS), X-Frame-Options, X-Content-Type-Options (`nosniff`). Cookies are
`SameSite=Lax` (CSRF mitigation) via Auth.js session configuration.

## Authentication & RBAC

- Auth.js v5 sessions; credentials provider uses **bcryptjs, 12 rounds**
  (see `prisma/seed.ts` — demo password `Demo1234!` is a documented demo credential only).
- Roles: `client`, `provider`, `fleet_owner`, `admin` (`Role` enum).
- RBAC middleware (`src/middleware.ts`) guards `/api/*` and dashboard routes;
  order transitions are additionally role-gated server-side via `TRANSITION_ROLES`
  / `mayTransition()` in `src/lib/order-machine.ts` — the client can never escalate a
  transition the state machine denies its role.

## Input validation & data access

- **zod** validation on every API input (reject malformed payloads before they reach
  the database).
- **Prisma parameterized queries only** — no raw SQL string interpolation; where raw
  queries are unavoidable they use Prisma's tagged-template parameterization
  (see `/api/health`).

## Rate limiting

- Auth endpoints: **10 requests/min/IP**; booking endpoints: **30 requests/min/user**;
  upload endpoint: **30 requests/min/user**; ad telemetry endpoint: **120 requests/min/IP**
  (`src/lib/rate-limit.ts`).
- **Distributed backend (Upstash Redis):** when `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN` are set (production), limits are enforced with
  sliding-window counters in Redis shared across all serverless instances.
  Without those env vars (local dev, tests) the limiter falls back to the
  in-memory token bucket (bounded at 10k buckets) with identical semantics.
- If Redis is unreachable at request time the limiter **fails open** (allows
  the request) and logs a warning — rate limiting is defense-in-depth, not an
  auth gate, and a Redis outage must not take the marketplace down.

## File uploads

- Validated server-side: **magic-byte detection** (JPEG/PNG/WebP — the client-supplied
  MIME type is not trusted), size cap (5 MB), filename sanitized
  (server-generated UUID); stored under `public/uploads` for v1.
- **Upgrade path:** move to S3-compatible object storage with signed URLs
  (documented; production S3 is out of scope for v1). Never trust client-supplied
  paths — uploads are keyed by server-generated IDs.

## Stripe webhook security

- Every webhook is **signature-verified** with `STRIPE_WEBHOOK_SECRET` before any
  processing (`stripe.webhooks.constructEvent`); unverified payloads are rejected
  with 400 and never touch the ledger.
- Handlers are **idempotent** (idempotency keys on PaymentIntent creation and
  `LedgerEntry.idempotencyKey`); replayed events can't double-post money.
- PCI: the app never touches raw card data — Stripe Elements / Payment Element only.

## Audit log

All admin and money actions write `AuditLog` rows (`actorId`, `action`, `entityType`,
`entityId`, `metadata`, `ip`). The admin audit viewer reads this table; rows are
append-only (no update/delete path in the app).

## Secrets

- Secrets live **only in environment variables**; `.env.example` documents every key
  with no real values. `.env` is gitignored.
- Never log PII or secrets (Prisma log level is `warn`/`error` only; no query text
  in production logs).
- Demo credentials in `prisma/seed.ts` are clearly labeled and must never be reused
  outside local/demo environments.

## Dependency hygiene

- `npm audit` must be clean before deploy (CI can be extended to fail on
  high/critical: `npm audit --audit-level=high`).
- **Dependabot** (`.github/dependabot.yml`) opens weekly npm update PRs; CI
  (typecheck + tests + build) must pass before merge.
