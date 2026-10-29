# Google OAuth setup

How to create Google OAuth credentials for Astir's "Sign in with Google" and Calendar connection, then wire them into local development. This takes about 10–15 minutes, requires no Google Workspace org, and no billing account.

## What you get at the end

- A **Client ID** and **Client Secret** in your `.env`.
- Visiting `http://localhost:5173/api/auth/google` signs you in with your Google account and self-provisions a row in the `users` table on first sign-in.

## Part 1: Google Cloud console

### 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com> and sign in with any personal Google account. If it is your first visit, accept the terms of service — that is the whole "account creation". No billing or credit card is needed for OAuth credentials.
2. Open the project picker in the top bar and click **New project**.
3. Name it something like `astir-local`, leave **Location** as `No organization`, and click **Create**. Wait for the notification, then switch to the new project.

### 2. Configure the OAuth consent screen (branding)

Google now manages this under **APIs & Services → OAuth consent screen** (also labeled **Google Auth Platform** in newer console versions).

1. Click **Get started** (or **Configure consent screen**).
2. **App name**: `Astir`. **User support email**: your own address.
3. **Audience**: choose **External**. (Internal only exists for Workspace orgs — External is correct and expected for a personal account.)
4. **Contact information**: your email again. Agree to the policy and click **Create**.

### 3. Set the publishing status

Under **Audience** you will see the publishing status:

- **Testing** (default): only listed test users can sign in. Add your own Gmail address under **Test users**. Up to 100 test users are allowed.
- **In production**: anyone with a Google account can sign in. Because Astir only requests non-sensitive scopes, you can click **Publish app** without triggering any verification review.

For a personal instance either works. Testing mode's 7-day refresh-token expiry does not apply here — Astir issues its own session cookie and never stores Google refresh tokens.

### 4. Create the OAuth client

1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type**: `Web application`.
3. **Name**: `astir-local`.
4. **Authorized JavaScript origins**: add

   ```text
   http://localhost:5173
   ```

5. **Authorized redirect URIs**: add exactly

   ```text
   http://localhost:5173/api/auth/google/callback
   http://localhost:5173/api/calendar/callback
   ```

   This must match `GOOGLE_CALLBACK_URL` character for character. Note that it points at the **frontend** origin: the browser only ever talks to `http://localhost:5173`, and the Next.js `/api` rewrite forwards the callback to the NestJS backend.

6. Click **Create** and copy the **Client ID** and **Client secret** from the confirmation dialog. (You can re-download them later from the credentials list.)

No APIs need to be enabled for basic sign-in — the OAuth endpoints and userinfo profile come with the consent screen. To use the Calendar connection, enable **Google Calendar API** under **APIs & Services → Library** in the same project.

## Part 2: Wire it into Astir

### 1. Set environment variables

Copy `.env.example` to `.env` at the repo root if you have not already, then fill in:

```bash
GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret-here
GOOGLE_CALLBACK_URL=http://localhost:5173/api/auth/google/callback
GOOGLE_CALENDAR_CALLBACK_URL=http://localhost:5173/api/calendar/callback
CALENDAR_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -hex 32)
```

`JWT_SECRET` signs the session cookie. Anything long and random works; keep it stable or existing sessions are invalidated.

Docker Compose reads `.env` from the repo root automatically and passes these into the backend container. For a non-Docker backend (`npm run dev:backend`), export them in your shell or use a tool like `direnv`.

## Calendar connection

Astir requests `calendar.events.readonly` only after someone chooses **Connect calendar**. It never broadens normal sign-in. The backend exchanges that one-time authorization code, encrypts the refresh and access tokens before database storage, and reads only regular calendar events beginning within the next 30 days. It does not cache event titles, attendees, or descriptions.

For local testing, add the same Google account as a test user on the consent screen. Calendar read access is a sensitive scope, so a public production app may require Google verification. Google may also expire refresh tokens issued while the consent screen is in Testing mode, which means the user will need to reconnect.

### 2. Run the migration

The `users` table ships as a Prisma migration:

```bash
npm run db:migrate
```

### 3. Start the stack and sign in

```bash
npm run dev
```

Then open:

```text
http://localhost:5173/api/auth/google
```

You are redirected to Google's consent screen. After approving, Google redirects back to the callback, the backend upserts your user record (self-provisioning — no manual account creation), sets an `astir_session` HTTP-only cookie valid for 7 days, and redirects you to `http://localhost:5173`.

Verify the session:

```bash
# In the browser (sends the cookie automatically):
open http://localhost:5173/api/users/me
```

Expected response:

```json
{
  "id": "cm...",
  "email": "you@gmail.com",
  "name": "Your Name",
  "avatarUrl": "https://lh3.googleusercontent.com/...",
  "createdAt": "2026-07-09T..."
}
```

Sign out with `POST /api/auth/logout`, which clears the cookie.

## How the flow works

```text
Browser                        Next.js :5173              NestJS :3000                Google
   |                                |                          |                        |
   |-- GET /api/auth/google ------->|-- proxy ---------------->|                        |
   |<------------------- 302 to accounts.google.com -----------|                        |
   |-- consent screen ---------------------------------------------------------------->|
   |<-- 302 to /api/auth/google/callback?code=... --------------------------------------|
   |-- GET /api/auth/google/callback?code=... -->|-- proxy --->|                        |
   |                                |                          |-- exchange code ------>|
   |                                |                          |<-- profile ------------|
   |                                |                          | upsert users row       |
   |<----- 302 to / + Set-Cookie: astir_session (JWT) ---------|                        |
   |-- GET /api/users/me (cookie) ->|-- proxy ---------------->| verify JWT, load user  |
```

Backend pieces:

- [google.strategy.ts](../backend/src/auth/google.strategy.ts) — passport strategy; exchanges the code, maps the Google profile to `{ googleId, email, name, avatarUrl }`.
- [auth.controller.ts](../backend/src/auth/auth.controller.ts) — `/auth/google`, `/auth/google/callback`, `/auth/logout`.
- [auth.service.ts](../backend/src/auth/auth.service.ts) — upserts the user and signs the session JWT.
- [jwt.strategy.ts](../backend/src/auth/jwt.strategy.ts) — reads the JWT from the `astir_session` cookie for guarded routes.
- [users.service.ts](../backend/src/users/users.service.ts) — user persistence; `upsertFromGoogleProfile` is what self-provisions accounts.

## Troubleshooting

- **`Error 400: redirect_uri_mismatch`** — the redirect URI registered in Google Cloud does not exactly match `GOOGLE_CALLBACK_URL`. Check protocol, host, port, and path; no trailing slash.
- **`Error 403: access_denied` / "app has not completed verification"** — the consent screen is in Testing mode and the Google account you used is not in the test users list. Add it, or publish the app.
- **Redirected to Google with `client_id=google-client-id-not-set`** — the backend did not receive `GOOGLE_CLIENT_ID`. Check `.env` and restart the stack (compose only reads `.env` at startup).
- **Sign-in succeeds but `/api/users/me` returns 401** — the cookie was set for a different host than the one you are browsing. Always use `http://localhost:5173`, not `127.0.0.1` and not the backend port directly.

## Later: production

When Astir gets a real domain, add `https://yourdomain.com` as an authorized origin and `https://yourdomain.com/api/auth/google/callback` as a redirect URI on the same OAuth client (or a second client), set `GOOGLE_CALLBACK_URL` and `FRONTEND_ORIGIN` accordingly, and use a strong unique `JWT_SECRET`. As long as only `openid email profile` is requested, no Google verification is needed even in production.
