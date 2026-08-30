# Ideal Day Vercel gateway

This directory is the Vercel project root. It adds the two-person password gate and proxies authenticated requests to the private Sites application, which remains beside the D1 database.

Configure the environment variables listed in `.env.example` as sensitive Preview and Production values. The two user IDs must also be configured as a comma-separated `IDEAL_DAY_VERCEL_USER_IDS` value on the Sites origin. `IDEAL_DAY_VERCEL_GATEWAY_TOKEN` must match on both platforms.

The Sites bypass token and gateway token are server-only. Browser requests never receive either value. The two password values are stored only as scrypt hashes.

`/login` always shows the password form, including when a session is already active. Enter either demo's password to replace the current session with that demo's identity; visiting the form or entering an invalid password leaves the current session unchanged. Successful login performs a full-page navigation, retaining a safe `next` destination when supplied and otherwise opening `/testing`.

The root GitHub Actions workflow validates the complete application, builds this directory, and deploys the Vercel production project after every push to `main`. Preview deployments are intentionally disabled until they have an isolated backend; a preview must never write to the production D1 database.

The function includes a conservative per-instance login throttle. Configure a Vercel Firewall rate-limit rule for `/_ideal-day/login` before inviting users so enforcement is shared across serverless instances.
