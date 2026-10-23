import { endpoint } from "@backend/lib/http/endpoint";
import { ZOHO } from "@backend/lib/http/limits";
import { parseWith } from "@backend/services/validation";
import { idSchema } from "@backend/services/classes";
import { openZohoRecording } from "@backend/services/attendance";

const route = endpoint({ method: "POST", input: parseWith(idSchema), rateLimit: ZOHO }, ({ auth, data, request }) => openZohoRecording(auth, data, request));

export const POST = route.handle;
export const OPTIONS = route.options;
