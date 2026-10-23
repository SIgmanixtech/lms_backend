import { endpoint } from "@backend/lib/http/endpoint";
import { ZOHO } from "@backend/lib/http/limits";
import { checkZohoConnection } from "@backend/services/classes";

const route = endpoint({ method: "POST", rateLimit: ZOHO }, ({ auth }) => checkZohoConnection(auth));

export const POST = route.handle;
export const OPTIONS = route.options;
