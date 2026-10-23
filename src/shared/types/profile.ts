import type { Row } from "./database";
export type Profile = Row<"profiles">;
export type AppRole = Profile["role"];
export interface AuthPrincipal { userId: string; email: string | null; profile: Profile }
