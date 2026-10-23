import { endpoint } from "@backend/lib/http/endpoint";
import { parseWith } from "@backend/services/validation";
import { moveClassDay, moveClassSchema } from "@backend/services/classes";

const route = endpoint({ method: "POST", input: parseWith(moveClassSchema) }, ({ auth, data }) => moveClassDay(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
