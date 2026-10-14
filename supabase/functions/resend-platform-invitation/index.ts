import { teamV2Handler } from "../_shared/platform-team-v2.ts";
export const handler = teamV2Handler("resend");
Deno.serve(handler);
