import { endpoint } from "@backend/lib/http/endpoint";
import { parseWith } from "@backend/services/validation";
import { updateClassSchema, updateClassWithMeeting } from "@backend/services/classes";

const route = endpoint({ method: "POST", input: parseWith(updateClassSchema) }, ({ auth, data }) => updateClassWithMeeting(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
