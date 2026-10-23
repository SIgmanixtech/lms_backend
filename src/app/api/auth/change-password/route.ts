import { changePasswordSchema } from "@/features/auth/schemas/auth.schemas";
import { endpoint } from "@backend/lib/http/endpoint";
import { PASSWORD } from "@backend/lib/http/limits";
import { parseWithDetails } from "@backend/services/validation";
import { changeMyPassword } from "@backend/services/auth";

const route = endpoint({ method: "POST", input: parseWithDetails(changePasswordSchema), rateLimit: PASSWORD }, ({ auth, data }) => changeMyPassword(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
