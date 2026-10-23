import { endpoint } from "@backend/lib/http/endpoint";
import { sendAdminDailyWelcome } from "@backend/services/notifications";

const route = endpoint({ method: "POST" }, ({ auth }) => sendAdminDailyWelcome(auth));

export const POST = route.handle;
export const OPTIONS = route.options;
