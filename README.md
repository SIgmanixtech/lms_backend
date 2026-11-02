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
| `src/app/api/v1/{admin,tutor,student}/**/route.ts` | Each role's own endpoints (thin files binding shared handlers to the role) |
| `src/app/api/v1/auth/**`, `src/app/api/{public,health}/**` | Session, public and liveness routes |
| `src/api/data-routes.ts`, `src/lib/http/supabase-proxy.ts` | Role data endpoints (tables, functions, files), run as the user |
| `scripts/generate-role-routes.ts` | Writes the role route files from contracts.ts (`npm run generate-routes`) |
| `src/api/role-handlers.ts` | One handler per role operation, shared by every role that has it |
| `src/lib/http/` | `endpoint()` wrapper, role access levels (`access.ts`), CORS, rate limits, body limits |
| `src/lib/supabase/` | Token verification (RLS client) and service-role client |
| `src/services/` | Business logic per domain (accounts, auth, classes, attendance, …) |
| `src/server/` | Integrations and workers (Zoho, Resend, FCM, dispatcher, lifecycle, bootstrap) |
| `src/shared/` | Copies of frontend contracts, schemas, rules and DB types (`npm run sync-shared`) |
| `scripts/sync-shared.mjs` | Refreshes `src/shared` from the frontend repo |
| `tests/` | Vitest suites |

## Data endpoints (`/api/v1/<role>/<table>`, functions, files)

Pages read and write their data through each role's own endpoints; there is no generic database route.

| What | Example |
| --- | --- |
| Rows of a table | `GET /api/v1/admin/enrollments?select=*&order=created_at.desc&offset=0&limit=25` |
| One row (by id only, no query string; the server refuses one) | `GET`/`PATCH`/`DELETE /api/v1/tutor/assignments/:id` |
| Insert, filtered update/delete | `POST /api/v1/student/submissions`, `PATCH /api/v1/admin/students?id=eq.<id>` |
| Database function | `POST /api/v1/student/assessments/attempts/start` |
| File upload / signed link | `POST /api/v1/student/files/avatars/<path>`, `POST /api/v1/admin/files/sign/certificates/<path>` |

- **Per-role lists** in `src/lib/api/contracts.ts`: `ROLE_TABLES` (tables and methods), `ROLE_FUNCTIONS`, `ROLE_UPLOAD_BUCKETS`.
  Admins may use every table. Tutors read the app's tables (not settings) and write only teaching data
  (assessments, assignments, attendance, grading, curriculum, recordings). Students read their learning data
  (never answer keys or settings) and write only their profile, submissions and push subscriptions.
- **Server-side checks** on every request (`src/lib/http/supabase-proxy.ts`): allowed origin, IP and user rate limits,
  verified token, exact role and active account. Then it is forwarded **as that user** with the publishable
  key, so Row Level Security and Storage policies still decide every row and file. The service-role key is never used.
- **Route files** under `src/app/api/v1/<role>/` are generated from those lists (`npm run generate-routes`);
  `tests/route-access.test.ts` fails if they are out of date or a role gets a table, method or function it shouldn't.
- The frontend's `src/lib/api/data-client.ts` turns each query into the role's URL and refuses anything the role
  has no endpoint for without sending it.
- One access-log line per request with the role path and user id; query strings and file names are never logged.

## Access logs

Every request writes one JSON line to stdout (visible in Railway's Deploy Logs), e.g.
`{"type":"access","method":"POST","path":"/api/v1/admin/payments","status":201,"ms":83,"user":"<uuid>"}`.
Filter by `"type":"access"`; warnings are 4xx, errors are 5xx.

## Security model

- **Authentication:** every user endpoint requires `Authorization: Bearer <Supabase access token>`,
  verified with `auth.getClaims` (signature and expiry). No cookies.
- **Authorization:** every role endpoint belongs to exactly one role (`/api/v1/admin`, `/api/v1/tutor`, `/api/v1/student`),
  checked on the server from the caller's own profile (active account, exact role) before the handler runs. Then
  checked as the caller under RLS (or by an authorizing RPC) before any service-role call. Database RLS and
  triggers remain the final authority.
- **CORS:** exact-origin allowlist, never with credentials. Requests from other browser origins get 403.
- **Input:** JSON only, size-capped (256 KB by default, ~13.5 MB for brief uploads), and zod-validated.
- **Rate limits:** per IP and per user, with stricter limits on password, admin, Zoho and upload operations
  (in-memory per instance; use an edge/WAF limit too for strong guarantees).
- **Errors:** only `AppError` codes and safe messages with a correlation id leave the server;
  internals are logged server-side.
- **Headers:** `nosniff`, `X-Frame-Options: DENY`, HSTS, `no-referrer`, `Cache-Control: no-store`,
  and a `default-src 'none'` CSP on JSON responses.

## Endpoints

Versioned REST API under `/api/v1`. Admin, tutor and student each have their own endpoints:
`/api/v1/admin/*`, `/api/v1/tutor/*` (stored role value `trainer`) and `/api/v1/student/*`. Only that role
may call its paths: the server checks the caller's own profile (active account, exact role) on every
request before the handler runs. Row Level Security and the services' own checks (e.g. only the class's
tutor or an admin may start a class) still apply after that, so a URL prefix never grants access by itself.

- **One table, shared with the frontend:** `ROLE_API` in `src/lib/api/contracts.ts` lists every operation's
  method, path (with `:params`) and roles. The frontend calls `roleApi("<operation>", input)`, which uses the
  signed-in role's path, puts `:params` in the URL and sends the rest as query (GET/DELETE) or JSON.
- **Same behaviour for every role:** each operation has one handler in `src/api/role-handlers.ts`. Route files
  under `src/app/api/v1/<role>/` only bind those handlers to their role (`roleRoutes("<role>", [ops])`).
  Path params are merged over the body/query before the same validation as before.
- **Tests:** `tests/route-access.test.ts` fails if a role is missing an endpoint it should have, has one it
  shouldn't, or a route file is bound to the wrong role or path.
- **Not versioned on purpose:** `/api/public/*` (external cron and signed links) and `/api/health` (host health
  check), so external configuration keeps working.

To add an operation: add it to `ROLE_API` in the frontend's contracts.ts, run `npm run sync-shared`, add its
handler to `ROLE_HANDLERS`, and add a route file for each role listed (copy an existing one).

### Inventory

Every row was checked against the source: the route file exists, and its authorization was inspected (role
gate + RLS/service checks). Table, function and file endpoints are listed in **Data endpoints** above (one per
table per role, from `ROLE_TABLES`), not repeated here.

#### Session, public and infrastructure

| Method | Exact path | Role(s) | Purpose | Caller (frontend) | Source file (backend) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | public | Sign in | `src/lib/supabase-auth.ts` | `src/app/api/v1/auth/login/route.ts` | VERIFIED |
| POST | `/api/v1/auth/refresh` | public (refresh token) | Renew the session | `src/lib/auth/session.ts` | `src/app/api/v1/auth/refresh/route.ts` | VERIFIED |
| POST | `/api/v1/auth/logout` | any signed-in user | Revoke the session | `src/lib/supabase-auth.ts` | `src/app/api/v1/auth/logout/route.ts` | VERIFIED |
| GET | `/api/v1/auth/me` | any signed-in user | Own access state and role (minimal) | `src/lib/supabase-auth.ts`, `src/lib/api/client.ts` | `src/app/api/v1/auth/me/route.ts` | VERIFIED |
| POST | `/api/v1/auth/change-password` | any signed-in user | Change own password | `src/features/auth/services/account.functions.ts` | `src/app/api/v1/auth/change-password/route.ts` | VERIFIED |
| POST | `/api/public/bootstrap-admin` | bootstrap token | First admin | — (operator) | `src/app/api/public/bootstrap-admin/route.ts` | VERIFIED |
| GET, POST | `/api/public/cron/deliver-notifications` | cron secret (`Authorization: Bearer`) | Scheduler | — (external cron) | `src/app/api/public/cron/deliver-notifications/route.ts` | VERIFIED |
| GET, HEAD | `/api/public/recordings/stream?t=` | signed ticket | Recording stream | recording player | `src/app/api/public/recordings/stream/route.ts` | VERIFIED |
| GET | `/api/public/files` | Storage-signed token | Private file download | `src/lib/supabase-storage.ts` | `src/app/api/public/files/route.ts` | VERIFIED |
| GET | `/api/health` | public | Liveness (host health check) | — | `src/app/api/health/route.ts` | VERIFIED |

#### Role endpoints

| Method | Exact path | Role(s) | Purpose | Caller (frontend) | Source file (backend) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/profile` | admin | Own profile | `src/lib/supabase-auth.ts` | `src/app/api/v1/admin/profile/route.ts` | VERIFIED |
| GET | `/api/v1/tutor/profile` | tutor | Own profile | `src/lib/supabase-auth.ts` | `src/app/api/v1/tutor/profile/route.ts` | VERIFIED |
| GET | `/api/v1/student/profile` | student | Own profile | `src/lib/supabase-auth.ts` | `src/app/api/v1/student/profile/route.ts` | VERIFIED |
| GET | `/api/v1/admin/dashboard` | admin | Dashboard tiles for the role | `src/components/shared/Dashboard.tsx` | `src/app/api/v1/admin/dashboard/route.ts` | VERIFIED |
| GET | `/api/v1/tutor/dashboard` | tutor | Dashboard tiles for the role | `src/components/shared/Dashboard.tsx` | `src/app/api/v1/tutor/dashboard/route.ts` | VERIFIED |
| GET | `/api/v1/student/dashboard` | student | Dashboard tiles for the role | `src/components/shared/Dashboard.tsx` | `src/app/api/v1/student/dashboard/route.ts` | VERIFIED |
| GET | `/api/v1/admin/notifications` | admin | Own notifications, filtered page (`read`, `type`, `search`, `page`) | `src/lib/supabase-notifications.ts` | `src/app/api/v1/admin/notifications/route.ts` | VERIFIED |
| GET | `/api/v1/tutor/notifications` | tutor | Own notifications, filtered page (`read`, `type`, `search`, `page`) | `src/lib/supabase-notifications.ts` | `src/app/api/v1/tutor/notifications/route.ts` | VERIFIED |
| GET | `/api/v1/student/notifications` | student | Own notifications, filtered page (`read`, `type`, `search`, `page`) | `src/lib/supabase-notifications.ts` | `src/app/api/v1/student/notifications/route.ts` | VERIFIED |
| GET | `/api/v1/admin/notifications/unread-count` | admin | Own unread count (header bell) | `src/lib/supabase-notifications.ts` | `src/app/api/v1/admin/notifications/unread-count/route.ts` | VERIFIED |
| GET | `/api/v1/tutor/notifications/unread-count` | tutor | Own unread count (header bell) | `src/lib/supabase-notifications.ts` | `src/app/api/v1/tutor/notifications/unread-count/route.ts` | VERIFIED |
| GET | `/api/v1/student/notifications/unread-count` | student | Own unread count (header bell) | `src/lib/supabase-notifications.ts` | `src/app/api/v1/student/notifications/unread-count/route.ts` | VERIFIED |
| PATCH | `/api/v1/admin/notifications/:id` | admin | Mark one own notification read | `src/lib/supabase-notifications.ts` | `src/app/api/v1/admin/notifications/[id]/route.ts` | VERIFIED |
| PATCH | `/api/v1/tutor/notifications/:id` | tutor | Mark one own notification read | `src/lib/supabase-notifications.ts` | `src/app/api/v1/tutor/notifications/[id]/route.ts` | VERIFIED |
| PATCH | `/api/v1/student/notifications/:id` | student | Mark one own notification read | `src/lib/supabase-notifications.ts` | `src/app/api/v1/student/notifications/[id]/route.ts` | VERIFIED |
| POST | `/api/v1/admin/notifications/read-all` | admin | Mark all own notifications read | `src/lib/supabase-notifications.ts` | `src/app/api/v1/admin/notifications/read-all/route.ts` | VERIFIED |
| POST | `/api/v1/tutor/notifications/read-all` | tutor | Mark all own notifications read | `src/lib/supabase-notifications.ts` | `src/app/api/v1/tutor/notifications/read-all/route.ts` | VERIFIED |
| POST | `/api/v1/student/notifications/read-all` | student | Mark all own notifications read | `src/lib/supabase-notifications.ts` | `src/app/api/v1/student/notifications/read-all/route.ts` | VERIFIED |
| GET | `/api/v1/admin/firebase-key` | admin | Public Firebase key for push | `src/integrations/firebase/firebase-config.functions.ts` | `src/app/api/v1/admin/firebase-key/route.ts` | VERIFIED |
| GET | `/api/v1/tutor/firebase-key` | tutor | Public Firebase key for push | `src/integrations/firebase/firebase-config.functions.ts` | `src/app/api/v1/tutor/firebase-key/route.ts` | VERIFIED |
| GET | `/api/v1/student/firebase-key` | student | Public Firebase key for push | `src/integrations/firebase/firebase-config.functions.ts` | `src/app/api/v1/student/firebase-key/route.ts` | VERIFIED |
| POST | `/api/v1/admin/recordings/:id/open` | admin | Ticketed recording stream URL | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/admin/recordings/[id]/open/route.ts` | VERIFIED |
| POST | `/api/v1/tutor/recordings/:id/open` | tutor | Ticketed recording stream URL | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/tutor/recordings/[id]/open/route.ts` | VERIFIED |
| POST | `/api/v1/student/recordings/:id/open` | student | Ticketed recording stream URL | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/student/recordings/[id]/open/route.ts` | VERIFIED |
| GET | `/api/v1/admin/assignments/:id/attachment` | admin | Signed URL of an assignment brief | `src/features/scheduling/services/scheduling.functions.ts` | `src/app/api/v1/admin/assignments/[id]/attachment/route.ts` | VERIFIED |
| GET | `/api/v1/tutor/assignments/:id/attachment` | tutor | Signed URL of an assignment brief | `src/features/scheduling/services/scheduling.functions.ts` | `src/app/api/v1/tutor/assignments/[id]/attachment/route.ts` | VERIFIED |
| GET | `/api/v1/student/assignments/:id/attachment` | student | Signed URL of an assignment brief | `src/features/scheduling/services/scheduling.functions.ts` | `src/app/api/v1/student/assignments/[id]/attachment/route.ts` | VERIFIED |
| POST | `/api/v1/admin/students` | admin | Provision a student account | `src/features/accounts/services/accounts.functions.ts` | `src/app/api/v1/admin/students/route.ts` | VERIFIED |
| POST | `/api/v1/admin/tutors` | admin | Provision a tutor account | `src/features/accounts/services/accounts.functions.ts` | `src/app/api/v1/admin/tutors/route.ts` | VERIFIED |
| PATCH | `/api/v1/admin/students/:profileId` | admin | Edit a student's details | `src/features/accounts/services/account-admin.functions.ts` | `src/app/api/v1/admin/students/[id]/route.ts` | VERIFIED |
| PATCH | `/api/v1/admin/tutors/:profileId` | admin | Edit a tutor's details | `src/features/accounts/services/account-admin.functions.ts` | `src/app/api/v1/admin/tutors/[id]/route.ts` | VERIFIED |
| POST | `/api/v1/admin/users/:profileId/reset-password` | admin | Issue a temporary password | `src/features/accounts/services/accounts.functions.ts` | `src/app/api/v1/admin/users/[id]/reset-password/route.ts` | VERIFIED |
| DELETE | `/api/v1/admin/users/:profileId` | admin | Delete, or deactivate if there's history | `src/features/accounts/services/account-admin.functions.ts` | `src/app/api/v1/admin/users/[id]/route.ts` | VERIFIED |
| PATCH | `/api/v1/admin/users/:profileId/status` | admin | Activate or deactivate (`status`) | `src/features/auth/services/account.functions.ts` | `src/app/api/v1/admin/users/[id]/status/route.ts` | VERIFIED |
| DELETE | `/api/v1/admin/curriculum/:kind/:id` | admin | Delete or archive a course/module/lesson/resource | `src/features/curriculum/services/curriculum.functions.ts` | `src/app/api/v1/admin/curriculum/[id]/[subId]/route.ts` | VERIFIED |
| DELETE | `/api/v1/admin/batches/:id` | admin | Delete or archive a batch | `src/features/scheduling/services/scheduling.functions.ts` | `src/app/api/v1/admin/batches/[id]/route.ts` | VERIFIED |
| POST | `/api/v1/admin/notifications/welcome` | admin | Daily admin welcome notification | `src/features/notifications/services/notifications.functions.ts` | `src/app/api/v1/admin/notifications/welcome/route.ts` | VERIFIED |
| GET | `/api/v1/admin/notifications/delivery-config` | admin | Which delivery channels are configured | `src/features/notifications/services/notifications.functions.ts` | `src/app/api/v1/admin/notifications/delivery-config/route.ts` | VERIFIED |
| POST | `/api/v1/admin/notifications/run-delivery` | admin | Process queued deliveries now | `src/features/notifications/services/notifications.functions.ts` | `src/app/api/v1/admin/notifications/run-delivery/route.ts` | VERIFIED |
| POST | `/api/v1/admin/zoho/check` | admin | Zoho identity check | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/admin/zoho/check/route.ts` | VERIFIED |
| PATCH | `/api/v1/admin/classes/:class_id/attendance/:student_id` | admin | Override a student's attendance (`status`, `reason`) | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/admin/classes/[id]/attendance/[subId]/route.ts` | VERIFIED |
| PATCH | `/api/v1/tutor/classes/:class_id/attendance/:student_id` | tutor | Override a student's attendance (`status`, `reason`) | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/tutor/classes/[id]/attendance/[subId]/route.ts` | VERIFIED |
| GET | `/api/v1/admin/classes/:id/attendance-review` | admin | Automatic attendance review | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/admin/classes/[id]/attendance-review/route.ts` | VERIFIED |
| GET | `/api/v1/tutor/classes/:id/attendance-review` | tutor | Automatic attendance review | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/tutor/classes/[id]/attendance-review/route.ts` | VERIFIED |
| POST | `/api/v1/admin/classes/:id/attendance-review` | admin | Mark attendance reviewed | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/admin/classes/[id]/attendance-review/route.ts` | VERIFIED |
| POST | `/api/v1/tutor/classes/:id/attendance-review` | tutor | Mark attendance reviewed | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/tutor/classes/[id]/attendance-review/route.ts` | VERIFIED |
| POST | `/api/v1/admin/classes/:id/attendance/retry` | admin | Re-run automatic attendance | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/admin/classes/[id]/attendance/retry/route.ts` | VERIFIED |
| POST | `/api/v1/tutor/classes/:id/attendance/retry` | tutor | Re-run automatic attendance | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/tutor/classes/[id]/attendance/retry/route.ts` | VERIFIED |
| POST | `/api/v1/admin/classes` | admin | Create a class (and Zoho meeting) | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/admin/classes/route.ts` | VERIFIED |
| POST | `/api/v1/tutor/classes` | tutor | Create a class (and Zoho meeting) | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/tutor/classes/route.ts` | VERIFIED |
| PATCH | `/api/v1/admin/classes/:id` | admin | Edit a class (and Zoho meeting) | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/admin/classes/[id]/route.ts` | VERIFIED |
| PATCH | `/api/v1/tutor/classes/:id` | tutor | Edit a class (and Zoho meeting) | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/tutor/classes/[id]/route.ts` | VERIFIED |
| PATCH | `/api/v1/admin/classes/:id/date` | admin | Move a class to another day (`class_date`) | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/admin/classes/[id]/date/route.ts` | VERIFIED |
| PATCH | `/api/v1/tutor/classes/:id/date` | tutor | Move a class to another day (`class_date`) | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/tutor/classes/[id]/date/route.ts` | VERIFIED |
| POST | `/api/v1/admin/classes/:id/meeting/retry` | admin | Retry Zoho meeting creation | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/admin/classes/[id]/meeting/retry/route.ts` | VERIFIED |
| POST | `/api/v1/tutor/classes/:id/meeting/retry` | tutor | Retry Zoho meeting creation | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/tutor/classes/[id]/meeting/retry/route.ts` | VERIFIED |
| POST | `/api/v1/admin/classes/:id/start` | admin | Live presenter start link | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/admin/classes/[id]/start/route.ts` | VERIFIED |
| POST | `/api/v1/tutor/classes/:id/start` | tutor | Live presenter start link | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/tutor/classes/[id]/start/route.ts` | VERIFIED |
| POST | `/api/v1/admin/classes/:id/end` | admin | End a live class early | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/admin/classes/[id]/end/route.ts` | VERIFIED |
| POST | `/api/v1/tutor/classes/:id/end` | tutor | End a live class early | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/tutor/classes/[id]/end/route.ts` | VERIFIED |
| POST | `/api/v1/admin/classes/settle` | admin | Mark ended classes Completed | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/admin/classes/settle/route.ts` | VERIFIED |
| POST | `/api/v1/tutor/classes/settle` | tutor | Mark ended classes Completed | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/tutor/classes/settle/route.ts` | VERIFIED |
| POST | `/api/v1/admin/classes/:id/recordings/find` | admin | Find and link Zoho recordings | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/admin/classes/[id]/recordings/find/route.ts` | VERIFIED |
| POST | `/api/v1/tutor/classes/:id/recordings/find` | tutor | Find and link Zoho recordings | `src/features/attendance/services/attendance.functions.ts` | `src/app/api/v1/tutor/classes/[id]/recordings/find/route.ts` | VERIFIED |
| GET | `/api/v1/admin/zoho/status` | admin | Is Zoho configured | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/admin/zoho/status/route.ts` | VERIFIED |
| GET | `/api/v1/tutor/zoho/status` | tutor | Is Zoho configured | `src/features/classes/services/classes.functions.ts` | `src/app/api/v1/tutor/zoho/status/route.ts` | VERIFIED |
| DELETE | `/api/v1/admin/assignments/:id` | admin | Delete, or close if it has submissions | `src/features/scheduling/services/scheduling.functions.ts` | `src/app/api/v1/admin/assignments/[id]/route.ts` | VERIFIED |
| DELETE | `/api/v1/tutor/assignments/:id` | tutor | Delete, or close if it has submissions | `src/features/scheduling/services/scheduling.functions.ts` | `src/app/api/v1/tutor/assignments/[id]/route.ts` | VERIFIED |
| PUT | `/api/v1/admin/assignments/:id/attachment` | admin | Upload an assignment brief | `src/features/scheduling/services/scheduling.functions.ts` | `src/app/api/v1/admin/assignments/[id]/attachment/route.ts` | VERIFIED |
| PUT | `/api/v1/tutor/assignments/:id/attachment` | tutor | Upload an assignment brief | `src/features/scheduling/services/scheduling.functions.ts` | `src/app/api/v1/tutor/assignments/[id]/attachment/route.ts` | VERIFIED |
| POST | `/api/v1/admin/students/progress` | admin | Progress for a page of students | `src/lib/table-enrichment.ts` | `src/app/api/v1/admin/students/progress/route.ts` | VERIFIED |
| POST | `/api/v1/tutor/students/progress` | tutor | Progress for a page of students | `src/lib/table-enrichment.ts` | `src/app/api/v1/tutor/students/progress/route.ts` | VERIFIED |
| POST | `/api/v1/student/progress` | student | Own progress (other students refused) | `src/lib/student-learning.ts` | `src/app/api/v1/student/progress/route.ts` | VERIFIED |
