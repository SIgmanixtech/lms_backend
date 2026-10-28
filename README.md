# Learning Journey Hub — backend (Next.js)

API server for the LMS. It replaces the former TanStack Start server functions and `/api/public/*`
server routes. Supabase is still the database, auth provider and file storage; this backend holds
the privileged logic (service-role operations, Zoho, Resend, FCM, cron).

## Run locally

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:4000
```

Run the frontend (`learning-journey-hub` repo, `npm run dev`, http://localhost:8080). It calls this backend
at `VITE_API_BASE_URL` (http://localhost:4000 in its `.env`).

```bash
npm test          # vitest (backend + security tests)
npm run typecheck
npm run build
npm run start:local   # production server on :4000 (`npm start` uses $PORT, for hosting)
```

## Shared code with the frontend

`src/shared/` holds exact copies of frontend files (API contracts, schemas, business rules, error codes,
Supabase types), imported as `@/...`. The frontend is the source of truth: change them there, then run
`npm run sync-shared` (frontend at `../learning-journey-hub`) or `npm run sync-shared -- <frontend path>`,
and commit both repos. `npm run sync-shared -- --check` fails if the copies are out of date.

## Deploy (Railway)

1. New project → Deploy from GitHub repo → this repo. Railway detects Next.js and runs `npm run build`
   then `npm start` (which listens on Railway's `$PORT`).
2. Variables: everything in `.env.example`. `ALLOWED_ORIGINS` must list the frontend's exact origin(s);
   `PUBLIC_API_URL` is this service's public URL; `PUBLIC_APP_URL` is the frontend's https URL.
3. Settings → Networking → Generate Domain (or add a custom domain). Health check path: `/api/health`.
4. Set `VITE_API_BASE_URL` in the **frontend** host (Vercel) to this backend URL and redeploy the frontend.
5. Scheduler: call `POST <backend>/api/public/cron/deliver-notifications` with
   `Authorization: Bearer <CRON_SECRET>` every 5 minutes (e.g. cron-job.org or a GitHub Actions schedule).
6. Check `GET <backend>/api/health` returns `{ "ok": true }`.

## Layout

| Path | Purpose |
| --- | --- |
| `src/app/api/**/route.ts` | Route handlers (one per operation) |
| `src/lib/http/` | `endpoint()` wrapper, CORS, rate limits, body limits |
| `src/lib/supabase/` | Token verification (RLS client) and service-role client |
| `src/services/` | Business logic per domain (accounts, auth, classes, attendance, …) |
| `src/server/` | Integrations and workers (Zoho, Resend, FCM, dispatcher, lifecycle, bootstrap) |
| `src/shared/` | Copies of frontend contracts, schemas, rules and DB types (`npm run sync-shared`) |
| `scripts/sync-shared.mjs` | Refreshes `src/shared` from the frontend repo |
| `tests/` | Vitest suites |

## Data gateway (`/api/db/...`)

Every page's database and file-storage requests come through this backend: the frontend's Supabase
client sends `/rest/v1/*` and `/storage/v1/object/*` calls to `/api/db/rest/v1/*` and
`/api/db/storage/v1/object/*` (see the frontend's `src/lib/api/db-gateway.ts`). The gateway
(`src/app/api/db/[...path]/route.ts`, rules in `src/lib/http/db-gateway.ts`):

- requires a verified user token (the anon key alone is refused) and an allowed origin;
- forwards the request **as that user** with the publishable key, so Row Level Security and Storage
  policies still decide every read and write; the service-role key is never used here;
- accepts only `public`-schema tables and RPCs, and storage object paths; the API root (schema
  listing), other schemas, bucket admin and path tricks (`..`, encoded `/`) are refused;
- rate limits per user (600/min) and per IP, caps bodies (2 MB data, 55 MB files), never caches;
- writes one access-log line per request (method, table or bucket, status, ms, user id). Query
  strings and file names are never logged.

Sessions go through this backend too: `POST /api/auth/login` issues the session, `POST /api/auth/refresh`
renews it (refused once an account is deactivated) and `POST /api/auth/logout` revokes it. Private files open
through `GET /api/public/files?bucket=&path=&token=`, which streams the Storage-signed file (script-capable types
are sandboxed and downloaded). The frontend has no Supabase URL or key; set `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` here only.

## Access logs

Every request writes one JSON line to stdout (visible in Railway's Deploy Logs), e.g.
`{"type":"access","method":"POST","path":"/api/db/rest/v1/payments","status":201,"ms":83,"user":"<uuid>"}`.
Filter by `"type":"access"`; warnings are 4xx, errors are 5xx.

## Security model

- **Authentication:** every user endpoint requires `Authorization: Bearer <Supabase access token>`,
  verified with `auth.getClaims` (signature and expiry). No cookies.
- **Authorization:** checked as the caller under RLS (or by an authorizing RPC) before any
  service-role call. Database RLS and triggers remain the final authority.
- **CORS:** exact-origin allowlist, never with credentials. Requests from other browser origins get 403.
- **Input:** JSON only, size-capped (256 KB by default, ~13.5 MB for brief uploads), and zod-validated.
- **Rate limits:** per IP and per user, with stricter limits on password, admin, Zoho and upload operations
  (in-memory per instance; use an edge/WAF limit too for strong guarantees).
- **Errors:** only `AppError` codes and safe messages with a correlation id leave the server;
  internals are logged server-side.
- **Headers:** `nosniff`, `X-Frame-Options: DENY`, HSTS, `no-referrer`, `Cache-Control: no-store`,
  and a `default-src 'none'` CSP on JSON responses.

## Endpoints

All are `POST` with a JSON body unless marked `GET`. Paths are defined in `src/lib/api/contracts.ts`.

| Path | Who | Purpose |
| --- | --- | --- |
| `/api/accounts/students/create`, `/api/accounts/trainers/create` | admin | Provision an account |
| `/api/accounts/students/update`, `/api/accounts/trainers/update` | admin | Edit account details |
| `/api/accounts/reset-password` | admin | Issue a temporary password |
| `/api/accounts/delete` | admin | Delete, or deactivate if there's history |
| `GET /api/auth/access` | any user | Own access state |
| `/api/auth/change-password` | any user | Change own password |
| `/api/auth/account-status` | admin | Activate or deactivate |
| `/api/attendance/override`, `/review`, `/review/mark`, `/retry` | admin/tutor | Automatic attendance |
| `/api/classes/create`, `/update`, `/move`, `/retry-meeting`, `/start-link`, `/end`, `/settle` | admin/tutor | Classes and Zoho meetings |
| `/api/classes/recordings/find` | admin/tutor | Link Zoho recordings |
| `GET /api/zoho/status`, `/api/zoho/check` | admin/tutor, admin | Zoho configuration |
| `/api/recordings/open` | anyone allowed by RLS | Ticketed stream URL |
| `/api/curriculum/delete`, `/api/batches/delete` | admin | Removal or archive |
| `/api/assignments/delete`, `/attachment/upload`, `/attachment/url` | admin/tutor (url: RLS) | Assignments |
| `/api/notifications/admin-welcome`, `GET /delivery-config`, `/run-delivery` | admin | Notifications |
| `GET /api/firebase/web-api-key` | any user | Public Firebase key |
| `POST /api/public/bootstrap-admin` | bootstrap token | First admin |
| `GET/POST /api/public/cron/deliver-notifications` | cron secret | Scheduler |
| `GET/HEAD /api/public/recordings/stream?t=` | signed ticket | Recording stream |
| `GET /api/health` | public | Liveness |
