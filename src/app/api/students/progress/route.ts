import { progressBatchSchema } from "@/lib/progress/progress-batch";
import { endpoint } from "@backend/lib/http/endpoint";
import { parseWithDetails } from "@backend/services/validation";
import { getStudentsProgress } from "@backend/services/progress";

/** Progress for a page of students in one request (each source read once, under the caller's RLS). */
const route = endpoint({ method: "POST", input: parseWithDetails(progressBatchSchema), maxBodyBytes: 32 * 1024 }, ({ auth, data }) => getStudentsProgress(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
