import { endpoint } from "@backend/lib/http/endpoint";
import { parseWith } from "@backend/services/validation";
import { endClassNow, idSchema } from "@backend/services/classes";

const route = endpoint({ method: "POST", input: parseWith(idSchema) }, ({ auth, data }) => endClassNow(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
