import { endpoint } from "@backend/lib/http/endpoint";
import { ADMIN_WRITE } from "@backend/lib/http/limits";
import { parseBare } from "@backend/services/validation";
import { idSchema } from "@backend/services/classes";
import { deleteBatch } from "@backend/services/scheduling";

const route = endpoint({ method: "POST", input: parseBare(idSchema), rateLimit: ADMIN_WRITE }, ({ auth, data }) => deleteBatch(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
