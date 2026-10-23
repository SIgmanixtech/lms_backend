import { endpoint } from "@backend/lib/http/endpoint";
import { ADMIN_WRITE } from "@backend/lib/http/limits";
import { parseBare } from "@backend/services/validation";
import { curriculumDeleteSchema, deleteCurriculumItem } from "@backend/services/curriculum";

const route = endpoint({ method: "POST", input: parseBare(curriculumDeleteSchema), rateLimit: ADMIN_WRITE }, ({ auth, data }) => deleteCurriculumItem(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
