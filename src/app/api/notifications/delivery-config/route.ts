import { endpoint } from "@backend/lib/http/endpoint";
import { getDeliveryConfig } from "@backend/services/notifications";

const route = endpoint({ method: "GET" }, ({ auth }) => getDeliveryConfig(auth));

export const GET = route.handle;
export const OPTIONS = route.options;
