import { loginSchema } from "@/features/auth/schemas/auth.schemas";
import { publicEndpoint } from "@backend/lib/http/endpoint";
import { parseWithDetails } from "@backend/services/validation";
import { login } from "@backend/services/login";

/** Email + password sign-in. Public (no token yet); rate limited per IP and per email inside `login`. */
const route = publicEndpoint({ method: "POST", input: parseWithDetails(loginSchema), maxBodyBytes: 4096 }, ({ data, ip }) => login(data, ip));

export const POST = route.handle;
export const OPTIONS = route.options;
