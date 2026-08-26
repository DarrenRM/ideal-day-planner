import { clearSessionCookie } from "../lib/auth.mjs";
import { redirect } from "../lib/responses.mjs";

export default { async fetch() { return redirect("/login", 303, { "set-cookie": clearSessionCookie() }); } };
