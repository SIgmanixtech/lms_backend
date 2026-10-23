import { updateTrainerSchema } from "@/features/accounts/schemas/account.schemas";
import { endpoint } from "@backend/lib/http/endpoint";
import { parseWith } from "@backend/services/validation";
import { updateTrainerAccount } from "@backend/services/accounts";

const route = endpoint({ method: "POST", input: parseWith(updateTrainerSchema) }, ({ auth, data }) => updateTrainerAccount(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
