# Ideal Day Vercel gateway

This directory is the Vercel project root. It adds the two-person password gate and proxies authenticated requests to the private Sites application, which remains beside the D1 database.

Configure the environment variables listed in `.env.example` as sensitive Preview and Production values. The two user IDs must also be configured as a comma-separated `IDEAL_DAY_VERCEL_USER_IDS` value on the Sites origin. `IDEAL_DAY_VERCEL_GATEWAY_TOKEN` must match on both platforms.

The Sites bypass token and gateway token are server-only. Browser requests never receive either value. The two password values are stored only as scrypt hashes.

Use a Vercel project whose Root Directory is `vercel-gateway`. Connect the repository to Git after the first verified deployment: non-production branches create previews and the production branch creates production deployments.

The function includes a conservative per-instance login throttle. Configure a Vercel Firewall rate-limit rule for `/_ideal-day/login` before inviting users so enforcement is shared across serverless instances.
