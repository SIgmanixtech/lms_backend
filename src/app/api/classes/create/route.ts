import { endpoint } from "@backend/lib/http/endpoint";
import { parseWith } from "@backend/services/validation";
import { createClassSchema, createClassWithMeeting } from "@backend/services/classes";

const route = endpoint({ method: "POST", input: parseWith(createClassSchema) }, ({ auth, data }) => createClassWithMeeting(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
