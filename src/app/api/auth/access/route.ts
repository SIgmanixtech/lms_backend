import { endpoint } from "@backend/lib/http/endpoint";
import { getMyAccess } from "@backend/services/auth";

const route = endpoint({ method: "GET" }, ({ auth }) => getMyAccess(auth));

export const GET = route.handle;
export const OPTIONS = route.options;
