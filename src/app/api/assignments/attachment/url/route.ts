import { endpoint } from "@backend/lib/http/endpoint";
import { parseBare } from "@backend/services/validation";
import { idSchema } from "@backend/services/classes";
import { getAssignmentAttachmentUrl } from "@backend/services/scheduling";

const route = endpoint({ method: "POST", input: parseBare(idSchema) }, ({ auth, data }) => getAssignmentAttachmentUrl(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
