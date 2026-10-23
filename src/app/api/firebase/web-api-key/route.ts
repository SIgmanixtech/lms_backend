import { endpoint } from "@backend/lib/http/endpoint";
import { getFirebaseWebApiKey } from "@backend/services/notifications";

const route = endpoint({ method: "GET" }, () => getFirebaseWebApiKey());

export const GET = route.handle;
export const OPTIONS = route.options;
