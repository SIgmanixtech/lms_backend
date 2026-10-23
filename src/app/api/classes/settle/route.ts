import { endpoint } from "@backend/lib/http/endpoint";
import { settleClassStatuses } from "@backend/services/classes";

const route = endpoint({ method: "POST" }, ({ auth }) => settleClassStatuses(auth));

export const POST = route.handle;
export const OPTIONS = route.options;
