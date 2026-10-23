import { endpoint } from "@backend/lib/http/endpoint";
import { parseWith } from "@backend/services/validation";
import { idSchema } from "@backend/services/classes";
import { retryAttendance } from "@backend/services/attendance";

const route = endpoint({ method: "POST", input: parseWith(idSchema) }, ({ auth, data }) => retryAttendance(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
