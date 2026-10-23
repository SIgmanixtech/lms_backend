import { endpoint } from "@backend/lib/http/endpoint";
import { ZOHO } from "@backend/lib/http/limits";
import { parseWith } from "@backend/services/validation";
import { idSchema } from "@backend/services/classes";
import { findClassRecordings } from "@backend/services/attendance";

const route = endpoint({ method: "POST", input: parseWith(idSchema), rateLimit: ZOHO }, ({ auth, data }) => findClassRecordings(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
