import { sessionFromRequest } from "../lib/auth.mjs";
import { json } from "../lib/responses.mjs";

export default { async fetch(request) { return sessionFromRequest(request) ? json({ authenticated: true }) : json({ authenticated: false }, 401); } };
