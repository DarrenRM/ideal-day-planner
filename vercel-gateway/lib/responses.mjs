export const SECURITY_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "content-security-policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

export function json(value, status = 200, headers = {}) { return Response.json(value, { status, headers: { ...SECURITY_HEADERS, ...headers } }); }
export function redirect(location, status = 303, headers = {}) { return new Response(null, { status, headers: { ...SECURITY_HEADERS, location, ...headers } }); }
