import { endpoint } from "@backend/lib/http/endpoint";
import { getDashboardSummary } from "@backend/services/dashboard";

/** All dashboard tiles for the caller in one request (counts run in parallel on the server, under RLS). */
const route = endpoint({ method: "GET" }, ({ auth }) => getDashboardSummary(auth));

export const GET = route.handle;
export const OPTIONS = route.options;
