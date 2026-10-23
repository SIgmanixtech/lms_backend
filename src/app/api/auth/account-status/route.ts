import { setAccountStatusSchema } from "@/features/auth/schemas/auth.schemas";
import { endpoint } from "@backend/lib/http/endpoint";
import { ADMIN_WRITE } from "@backend/lib/http/limits";
import { parseWithDetails } from "@backend/services/validation";
import { setAccountStatus } from "@backend/services/auth";

const route = endpoint({ method: "POST", input: parseWithDetails(setAccountStatusSchema), rateLimit: ADMIN_WRITE }, ({ auth, data }) => setAccountStatus(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
