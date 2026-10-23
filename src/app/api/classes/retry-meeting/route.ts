import { endpoint } from "@backend/lib/http/endpoint";
import { ZOHO } from "@backend/lib/http/limits";
import { parseWith } from "@backend/services/validation";
import { idSchema, retryClassMeeting } from "@backend/services/classes";

const route = endpoint({ method: "POST", input: parseWith(idSchema), rateLimit: ZOHO }, ({ auth, data }) => retryClassMeeting(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
