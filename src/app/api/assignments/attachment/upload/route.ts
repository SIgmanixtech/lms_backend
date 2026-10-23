import { endpoint } from "@backend/lib/http/endpoint";
import { UPLOAD } from "@backend/lib/http/limits";
import { parseBare } from "@backend/services/validation";
import { UPLOAD_MAX_BODY_BYTES, uploadAssignmentAttachment, uploadSchema } from "@backend/services/scheduling";

const route = endpoint({ method: "POST", input: parseBare(uploadSchema), rateLimit: UPLOAD, maxBodyBytes: UPLOAD_MAX_BODY_BYTES }, ({ auth, data }) => uploadAssignmentAttachment(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
