import { endpoint } from "@backend/lib/http/endpoint";
import { getZohoStatus } from "@backend/services/classes";

const route = endpoint({ method: "GET" }, ({ auth }) => getZohoStatus(auth));

export const GET = route.handle;
export const OPTIONS = route.options;
