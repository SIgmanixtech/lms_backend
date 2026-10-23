import { endpoint } from "@backend/lib/http/endpoint";
import { ADMIN_WRITE } from "@backend/lib/http/limits";
import { runDeliveryNow } from "@backend/services/notifications";

const route = endpoint({ method: "POST", rateLimit: ADMIN_WRITE }, ({ auth }) => runDeliveryNow(auth));

export const POST = route.handle;
export const OPTIONS = route.options;
