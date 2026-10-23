import { endpoint } from "@backend/lib/http/endpoint";
import { parseBare } from "@backend/services/validation";
import { idSchema } from "@backend/services/classes";
import { deleteAssignment } from "@backend/services/scheduling";

const route = endpoint({ method: "POST", input: parseBare(idSchema) }, ({ auth, data }) => deleteAssignment(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
