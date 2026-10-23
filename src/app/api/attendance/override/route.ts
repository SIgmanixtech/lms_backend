import { endpoint } from "@backend/lib/http/endpoint";
import { parseWith } from "@backend/services/validation";
import { overrideAttendance, overrideSchema } from "@backend/services/attendance";

const route = endpoint({ method: "POST", input: parseWith(overrideSchema) }, ({ auth, data }) => overrideAttendance(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
