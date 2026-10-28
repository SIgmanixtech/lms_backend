import { endpoint } from "@backend/lib/http/endpoint";
import { signOutSession } from "@backend/services/session";

/** Sign-out: revokes the caller's current session. */
const route = endpoint({ method: "POST" }, ({ request }) => signOutSession((request.headers.get("authorization") ?? "").replace(/^Bearer /, "")));

export const POST = route.handle;
export const OPTIONS = route.options;
