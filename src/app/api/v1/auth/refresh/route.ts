import { refreshSessionSchema } from "@/features/auth/schemas/auth.schemas";
import { publicEndpoint } from "@backend/lib/http/endpoint";
import { parseWithDetails } from "@backend/services/validation";
import { refreshSession } from "@backend/services/session";

/** Session renewal. Public (the access token may already be expired); the refresh token authorizes. */
const route = publicEndpoint({ method: "POST", input: parseWithDetails(refreshSessionSchema), maxBodyBytes: 8192 }, ({ data, ip }) => refreshSession(data, ip));

export const POST = route.handle;
export const OPTIONS = route.options;
