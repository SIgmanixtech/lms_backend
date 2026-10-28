# Backend (Next.js) rules

- This folder is the only server: every privileged operation is a route handler under `src/app/api/`; the frontend calls it through `src/lib/api/client.ts`, so no server code ships in the browser bundle.
- Every user endpoint is built with `endpoint()` in `src/lib/http/endpoint.ts` (origin allowlist, rate limits, Supabase token verification, bounded JSON body, zod validation, safe `AppError` responses), so no route can skip a check.
- Authorization first runs as the caller (`auth.supabase`, RLS-scoped) or via an authorizing RPC; `supabaseAdmin` is used only after that, because the service-role client bypasses RLS.
- Paths and response types live in `src/lib/api/contracts.ts` (shared with the frontend); `tests/http-security.test.ts` fails if a contract path has no route.
- Pure rules (schemas, policies, `AppError`, DB types) are copied from the frontend into `src/shared` (`npm run sync-shared`, never edited here) and imported via `@/`; backend-only code uses `@backend/`, so validation and decisions are identical on both sides.
- Auth uses bearer tokens only and CORS never allows credentials, so cookies are never involved and CSRF doesn't apply.
- `/api/public/*` routes take no user token: bootstrap and cron require their shared secrets (constant-time compare), and the recording stream requires a signed short-lived ticket, and file downloads (`/api/public/files`) require a Storage-signed short-lived token.
- The browser talks only to this backend: data via the `/api/db` gateway, sessions via `/api/auth/login|refresh|logout`, files via `/api/public/files`; the frontend holds no Supabase URL or key.
