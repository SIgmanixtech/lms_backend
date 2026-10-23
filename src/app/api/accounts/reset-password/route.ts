import { resetPasswordSchema } from "@/features/accounts/schemas/account.schemas";
import { endpoint } from "@backend/lib/http/endpoint";
import { ADMIN_WRITE } from "@backend/lib/http/limits";
import { parseWith } from "@backend/services/validation";
import { resetAccountPassword } from "@backend/services/accounts";

const route = endpoint({ method: "POST", input: parseWith(resetPasswordSchema), rateLimit: ADMIN_WRITE }, ({ auth, data }) => resetAccountPassword(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
