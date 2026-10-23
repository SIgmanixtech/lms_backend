# Shared code (copied from the frontend)

Everything under this folder is an exact copy of files from the frontend repo
(`learning-journey-hub/src`): API contracts, validation schemas, business rules, error codes
and the generated Supabase types. Backend code imports them as `@/...`.

They are copied, not referenced, so this backend builds and deploys on its own.

**Don't edit these files here.** Change them in the frontend, then from `backend/` run:

```bash
npm run sync-shared                 # frontend checked out at ../learning-journey-hub
npm run sync-shared -- <path>       # or point at the frontend repo
npm run sync-shared -- --check      # fails if the copies are out of date
```

Commit the frontend and the backend together so both sides keep the same rules.
