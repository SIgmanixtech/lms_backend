import { updateStudentSchema } from "@/features/accounts/schemas/account.schemas";
import { endpoint } from "@backend/lib/http/endpoint";
import { parseWith } from "@backend/services/validation";
import { updateStudentAccount } from "@backend/services/accounts";

const route = endpoint({ method: "POST", input: parseWith(updateStudentSchema) }, ({ auth, data }) => updateStudentAccount(auth, data));

export const POST = route.handle;
export const OPTIONS = route.options;
