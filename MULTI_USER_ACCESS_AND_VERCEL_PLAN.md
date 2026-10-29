# Multi-user access and Vercel migration plan

Status: initial two-user gateway implemented and deployed
Scope: an initial two-person private deployment that can evolve into normal account-based authentication  
Last updated: 2026-08-25

## Goal

Move Ideal Day from one platform-provided identity toward a real multi-user architecture without building email verification, signup, password recovery, or account-management screens yet.

The first release will support exactly two private users. A visitor enters one of two shared secrets at a login gate. Each accepted secret maps to a different, stable internal user identity and therefore a completely separate setup, activity catalog, day plan, conversations, artifacts, and preferences. No protected page or API data is available without a valid session.

This is a bootstrap authentication system, not the eventual account system. It must be designed so a future identity provider can be attached to the same internal users without migrating their application data.

## Implemented release

- The existing private Sites application and D1 database remain the source of truth.
- A separate Vercel gateway maps two scrypt-hashed bootstrap passwords to two random, allowlisted user IDs.
- Signed 30-day `HttpOnly`, `Secure`, `SameSite=Lax` sessions are revocable through per-user session versions.
- Both Vercel principals begin in direct onboarding with blank, independently owned records.
- Logged-out application requests are denied, privileged restore and bridge routes are blocked, writes require the deployment origin, and personalized responses are not cached.
- Every push and pull request runs the complete test/lint gate through GitHub Actions. In a repository that holds the Vercel secrets, a push to `main` then deploys the Vercel production project; anywhere else the deploy is skipped.
- Preview deployments remain disabled until an isolated preview backend exists.

## Important finding about the current application

The database is already substantially multi-user ready:

- `users` is a first-class table.
- Most durable domain tables carry `user_id`.
- Important uniqueness constraints are scoped by user.
- Current API and scheduling code generally filters reads and writes by `user_id`.

The main single-user coupling is how the app obtains an identity. Today it reads the Sites-provided `oai-authenticated-user-id` header, and the database layer imports the Cloudflare `DB` binding through `cloudflare:workers`.

Consequently, this application is not currently a drop-in Vercel deployment. The selected design keeps the current Cloudflare/Sites runtime and D1 database as the durable backend while adding Vercel as a separately authenticated delivery surface.

## Decisions recorded on 2026-08-25

- Local development and the existing private Sites deployment remain the primary iteration loop.
- The D1 database bound to the Sites application remains the production source of truth.
- Vercel is an additional deployment surface for the two bootstrap-password users, not a replacement for Sites.
- Both Vercel users are new principals and begin with blank data/onboarding.
- Vercel deployments should be driven by Git, without reseeding or replacing durable user data.

## Recommended approach

Use a staged migration that establishes the correct identity boundary before changing hosting.

### Stage 1: introduce an application-owned identity contract

Create one server-only interface that every protected route uses:

```ts
type Principal = {
  userId: string;
  authMethod: "sites" | "bootstrap_password" | "provider";
};

getCurrentPrincipal(request): Promise<Principal | null>
requirePrincipal(request): Promise<Principal>
```

Replace direct reads of `oai-authenticated-user-id` with this interface. During the transition, its Sites adapter can preserve current production behavior. The Vercel adapter will resolve an authenticated session instead.

Rules:

- Domain code receives only the stable `userId`; it never sees a password, credential slot, email, or provider-specific subject.
- A user ID is a random, permanent identifier. Do not use `user-one`, an email address, a password hash, or the array position of a credential.
- Every server read, write, job, cache key, export, restore, and backup remains scoped to that user ID.
- Client-supplied `userId` values are never trusted. The server derives identity from the session.

This is the most important step because it makes the bootstrap password system replaceable.

### Stage 2: add Vercel as an authenticated gateway

The selected request path is:

```text
Vercel user
  -> Vercel login and session
  -> Vercel server/gateway
  -> authenticated Sites/Cloudflare origin API
  -> existing D1 database

Owner iteration
  -> local development or private Sites deployment
  -> existing D1 database
```

Vercel must not attempt to use a Cloudflare `DB` binding directly. It hosts the login/session boundary and a server-side gateway. The gateway calls a narrowly scoped origin API beside D1 using a service credential. The origin independently verifies the Vercel service request and resolves its signed principal to one of the two permanent Vercel user IDs.

The existing Sites application continues to accept its platform identity through the identity adapter. The backend therefore supports two trusted authentication adapters:

1. Sites platform identity for the current private owner/iteration surface.
2. Vercel service authentication plus a validated user claim for the two Vercel users.

The Vercel browser must never be allowed to invent or forward its own `userId`. Only the Vercel server can assert a principal to the origin, and the origin must validate the service credential/signature before trusting it. Direct browser access to the origin API must fail.

This creates three distinct principals in the same D1 database: the existing Sites owner and two new Vercel users. Sharing a database does not mean sharing records; all durable data remains partitioned by `user_id`.

Do not query D1 through Cloudflare's account-level REST API for normal application traffic. Cloudflare documents that API as better suited to administrative use and recommends a Worker API for application access.

This split is intentional for the first multi-user phase. A future decision may move the full runtime and database, but it is not part of this release.

### Stage 3: create two bootstrap principals

Create two permanent internal user IDs and two credential records. Passwords must never be committed to this repository, and each must be a strong, unique passphrase.

For a two-person bootstrap, either of these storage forms is acceptable:

1. A small credentials table containing `user_id`, password hash, status, session version, and timestamps.
2. Vercel Sensitive Environment Variables containing two user IDs and two password hashes.

A credentials table is preferable because revocation, rotation, and auditing do not require coupling identity to deployment configuration. Environment variables are acceptable for the smallest first release, provided only hashes—not plaintext passwords—are stored. Vercel supports sensitive environment variables whose values are hidden after creation.

Password handling requirements:

- Hash with a password-specific KDF such as Argon2id or scrypt, with a unique salt and an intentionally expensive work factor.
- Verify only on the server and use constant-time comparison where applicable.
- Never place plaintext passwords in source, Git history, browser storage, URLs, analytics, logs, error reports, build output, or database backups.
- Return the same error message and comparable timing for every failed login.
- Rate-limit by a combination of source and credential slot; add exponential backoff after repeated failures.
- Record a bounded security event for success, failure, logout, revocation, and rotation without recording the attempted password.

### Stage 4: issue real sessions

After a successful password check, issue a random opaque session token. Store only its hash server-side and return the token in a cookie with:

- `HttpOnly`
- `Secure`
- `SameSite=Lax` or stricter
- `Path=/`
- a `__Host-` cookie name where supported
- an explicit idle and absolute expiry

Recommended initial behavior is a 30-day absolute session with activity-based renewal, manual logout, and immediate server-side revocation. Rotate the session identifier at login. A per-user `session_version` provides a simple “log out everywhere” and credential-rotation mechanism.

Every page loader, server action, route handler, API endpoint, streaming endpoint, and bridge-facing endpoint must authenticate independently. Hiding pages in the browser is not access control.

### Stage 5: define the two setups

User separation must exist at the durable data layer, not as a front-end preference switch.

Approved initial provisioning:

- The existing Sites owner and all existing production data remain unchanged.
- Vercel Principal A receives a new `users` row and begins at onboarding with no inherited activities or history.
- Vercel Principal B receives a different new `users` row and begins at onboarding with no inherited activities or history.
- Normal application defaults may be created as each person completes onboarding, but neither Vercel user receives a copy of the Sites owner's mutable records.
- If starter templates are introduced later, they are copied into independently owned records rather than shared as mutable data.
- The local bridge resolves every job to the authenticated/requested user and never falls back to a global default user.
- Restores and exports require an explicit target user and cannot overwrite another user.

Before migration, produce a read-only ownership report that counts each user-owned table by `user_id`, flags null/orphan ownership, and identifies any table or query that is not scoped.

## Access boundary

“No access without a password” should mean:

- Logged-out requests to protected pages are redirected to the login page.
- Logged-out API, action, stream, attachment, export, and bridge requests receive `401` or `403` and no private data.
- User A cannot read, infer, mutate, export, or trigger work for User B, even by changing IDs or URLs.
- Personalized HTML and API responses use `Cache-Control: private, no-store` unless a user-safe cache design is explicitly proven.
- Preview URLs, historical deployment URLs, testing routes, restore routes, source maps, and operational endpoints are protected or disabled in production.
- Search engines receive `noindex, nofollow`; private content is absent from metadata and social preview generation.
- The backend origin cannot be used to bypass Vercel authentication for either Vercel principal.

Static JavaScript, CSS, fonts, and non-sensitive images may remain publicly fetchable; they must contain no secrets or user data. Requiring authentication before even static assets are served is possible but adds edge/proxy complexity without protecting private data. This distinction should be confirmed before implementation.

Vercel's built-in Deployment Protection is useful as an additional shield for preview deployments, but it is not the primary identity system here: its password protection uses one deployment password and cannot map two passwords to two separate Ideal Day users. As of this document, protecting production with Vercel Password Protection also has plan/add-on constraints. Application-level authorization is still required.

## Security baseline

### Application controls

- Deny by default. New routes are protected unless explicitly declared public.
- Keep the public surface to the login page, login submission endpoint, required static assets, and a minimal health response with no environment details.
- Validate authorization after authentication on every object lookup; never fetch by object ID alone when `user_id` can be part of the predicate.
- Protect state-changing requests against CSRF using SameSite cookies plus Origin/Referer validation or a server-issued CSRF token.
- Validate and bound all request bodies, upload types, message lengths, and identifiers.
- Escape rendered user content and retain the existing structured-action validators.
- Do not leak stack traces, SQL, tokens, internal IDs, or whether a particular credential exists.
- Apply security headers: a restrictive Content Security Policy, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and framing protection through CSP `frame-ancestors`.
- Separate human sessions from the bridge service credential. Give the bridge only the endpoints and user scopes it needs.
- Keep production, preview, and development databases and secrets separate.

### Automated security suite

Add tests at three levels.

#### Unit tests

- Both valid credential hashes map to the intended stable principals.
- Invalid, empty, very long, malformed, and Unicode inputs fail safely.
- Session creation, expiry, rotation, revocation, and session-version invalidation work.
- `requirePrincipal` rejects missing and tampered sessions.
- User-scoped query helpers require a user ID and cannot silently fall back to a default.

#### Integration tests

- Every protected API family rejects an unauthenticated request.
- Both principals can complete their intended workflows.
- User A cannot access User B's known activity, conversation, artifact, schedule, record, or export IDs.
- Changing `userId`, `activityId`, `conversationId`, or nested subject keys cannot cross the ownership boundary.
- Login is rate-limited and returns a generic error.
- Logout invalidates the token server-side; replay fails.
- Write requests with an invalid Origin/CSRF value fail.
- Personalized responses are not publicly cached and never cross users.
- Bridge requests with missing, invalid, expired, or over-scoped service credentials fail.

#### Deployment smoke tests

- Production domain, generated deployment domains, previews, `/testing`, `/restore`, API routes, streams, and source maps are checked while logged out.
- Cookie attributes and security headers are asserted from real HTTPS responses.
- Direct backend-origin access is tested if the system is split across Vercel and Cloudflare.
- Dependency audit, secret scanning, lint, tests, and build run in CI before deployment.
- A small authorized dynamic scan covers authentication, authorization, session management, CSRF, input handling, and security headers. The OWASP Web Security Testing Guide and ASVS are the checklist baseline.

## Migration sequence

1. Freeze and back up the current production database; retain the known-good production routine snapshot.
2. Inventory every direct identity-header read and introduce `getCurrentPrincipal` / `requirePrincipal`.
3. Audit schema ownership, indexes, foreign keys, API predicates, cache keys, jobs, exports, and restore paths.
4. Record the selected Vercel-gateway/Sites-origin/D1 architecture in a short decision record.
5. Create the two stable principals and define how each is provisioned.
6. Build the login, session store, logout, revocation, rate limiting, and security-event logging.
7. Protect all server entry points using a deny-by-default route policy.
8. Add automated cross-user and unauthenticated-access tests before importing the second setup.
9. Add the authenticated origin API and Vercel gateway while keeping D1 as the source of truth.
10. Update the local bridge so it authenticates as a service and preserves the target user on every job.
11. Deploy to an isolated preview with production-like secrets and a non-production database.
12. Run the deployment security smoke suite and manually test both identities in separate browser profiles.
13. Provision two new blank Vercel principals, verify ownership counts, and exercise onboarding independently for each.
14. Keep the prior production deployment and database backup available for rollback until both users have exercised the core flows.

## Acceptance criteria for the two-person release

- Entering Credential A opens only Setup A; entering Credential B opens only Setup B.
- Refreshing and reopening the browser preserves a valid session according to the agreed lifetime.
- Logging out, rotating a credential, or revoking sessions works predictably.
- A logged-out user cannot retrieve private HTML, JSON, streams, files, or job results.
- Cross-user object-ID and API tampering is rejected and covered by tests.
- The current Sites owner's production history and iteration workflow remain unchanged.
- Both Vercel users begin blank, complete onboarding independently, and create data under different permanent user IDs.
- The bridge and background jobs never process work under an implicit/global user.
- No plaintext bootstrap credential exists in Git, Vercel configuration output, logs, analytics, or the database.
- The production deployment passes the security smoke suite and has a rehearsed rollback.

## Later migration to normal accounts

When email, passkeys, OAuth, or another identity provider is introduced, add an `auth_identities` mapping such as:

```text
provider + provider_subject -> existing internal user_id
```

After each person proves control of their bootstrap credential, link their new provider identity to the existing user ID. Domain records do not move. Then disable bootstrap login, revoke its sessions, and delete the bootstrap password hashes after an agreed recovery window.

Do not make email the primary key for application data. Emails can change; the internal user ID should not.

## Git and deployment workflow

This section is the plan as written before implementation. As built, there are no preview deployments and no secret scanning: CI runs lint, tests and the build on every push and pull request, and only `main` deploys (see "Implemented release" above).

Use Git integration for Vercel, but distinguish validation from production release:

- Every pull request and non-production branch push creates a Vercel Preview Deployment.
- Every commit merged to the designated production branch creates a Vercel Production Deployment.
- A routine local commit should not publish production unless it lands on that production branch.
- CI runs lint, tests, build, secret scanning, and the multi-user security suite before production deployment.
- Deployment changes code and configuration only. It must never delete, recreate, or automatically reseed the two Vercel users.
- Preview deployments use separate credentials and must not write to production D1 by default. Any preview that needs realistic data gets an isolated preview database or read-only fixtures.
- The Sites publishing workflow remains independent so local/Sites iteration is not blocked by Vercel.

Recommended branch policy: feature commits produce previews; merging to `main` produces the two-user Vercel production deployment. This preserves rapid iteration without turning every incomplete commit into a user-facing release.

## Decisions that were open before implementation

The release settled two of these: sessions last 30 days with per-user revocation, and production deploys from `main` with previews disabled. The rest remain open.

1. **Session lifetime:** use the recommended 30-day remembered session with manual logout, or require the password more often?
2. **Meaning of no access:** is protecting every page, API, file, and datum sufficient while non-sensitive static assets remain public?
3. **Recovery during bootstrap:** is manual credential rotation by the operator acceptable until real account recovery exists?
4. **Production branch:** should Vercel production deploy from `main`, with other branches producing previews?
5. **Long-term auth milestone:** evaluate a managed identity provider when a third user is added, or at another explicit milestone?

## Official references

- [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)
- [Vercel sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
- [Vercel response and cache headers](https://vercel.com/docs/headers/response-headers)
- [Cloudflare: build an API to access D1](https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/)
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/latest/README)
