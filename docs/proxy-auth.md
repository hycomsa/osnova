# Authentication

Osnova supports two pluggable authentication modes, selected with the `AUTH_MODE`
environment variable:

| `AUTH_MODE` | Who authenticates | Use when |
|-------------|-------------------|----------|
| `proxy` (default) | A reverse proxy in front of the app (corporate SSO) | You already terminate SSO at a gateway (Apache, nginx, oauth2-proxy, …) |
| `oidc` | The app itself, via OpenID Connect PKCE | You want Osnova to drive the login against an OIDC provider (e.g. Keycloak) |

Authorization (workspace roles, permissions, `system_admin`) is identical in both modes —
only the *source of identity* differs. Emails listed in `ADMIN_EMAILS` always receive the
global `system_admin` role.

---

## Proxy mode (default)

The app does not log anyone in. A gateway (reverse proxy) sits in front of Osnova and is the
only thing exposed to the world.

1. The user hits the public address → they reach the **gateway**, not the app.
2. The gateway logs them in through your corporate SSO (e.g. Microsoft Entra ID / Office 365).
3. After a successful login, the gateway adds a trusted header — by default **`X-User-UPN`**,
   containing the user's email — to every request it forwards to the app.
4. The app reads that header and knows who the user is. It checks no passwords or tokens —
   the gateway already did the authentication.

On each request the app finds-or-creates the Osnova user keyed on that email and resolves
their workspace roles as usual.

### Configuration

```env
AUTH_MODE=proxy
PROXY_AUTH_HEADER=X-User-UPN          # header carrying the user's email
PROXY_AUTH_NAME_HEADER=X-User-Name    # optional display-name header
PROXY_AUTH_SHARED_SECRET=             # optional; see "Security" below
PROXY_AUTH_SECRET_HEADER=X-Proxy-Secret
PROXY_LOGOUT_URL=                     # where /api/auth/logout sends the browser; empty = home
PROXY_AUTH_DEV_USER=                  # local dev only (ignored in production)
```

The header names are configurable, so any gateway works: set `PROXY_AUTH_HEADER` to whatever
your proxy injects (e.g. `X-Forwarded-Email` / `X-Auth-Request-Email` for oauth2-proxy, or a
custom `X-User-UPN` from Apache `mod_auth_openidc`).

### Security — read this

Trusting a header is only safe if the header can only come from your proxy. **All three:**

1. **Bind the app to localhost.** Run Osnova on `127.0.0.1:3000`; never expose `:3000`
   publicly. The proxy is the sole public entry point.
2. **Strip then set.** The proxy must remove any client-supplied copy of the identity header
   before injecting its own (the Apache example does `RequestHeader unset` before
   `RequestHeader set`). Otherwise a user could send `X-User-UPN: ceo@company.com` themselves.
3. **Optional shared secret.** Set `PROXY_AUTH_SHARED_SECRET` in the app and have the proxy
   inject the same value in `PROXY_AUTH_SECRET_HEADER`. The app then rejects any request that
   doesn't carry the secret — a belt-and-braces guard against direct access.

### Apache example

A complete, commented Apache vhost (TLS + `mod_auth_openidc` against Entra ID + header
injection + reverse proxy) is provided at
[`deploy/apache/osnova.conf.example`](../deploy/apache/osnova.conf.example).

### Local development

With `AUTH_MODE=proxy` and no real proxy, set `PROXY_AUTH_DEV_USER=you@example.com` — the app
treats you as that user. This is **ignored when `NODE_ENV=production`**. Alternatively run with
`AUTH_MODE=oidc` locally.

---

## OIDC mode

Set `AUTH_MODE=oidc` to have the app perform the login itself via OpenID Connect (PKCE). See
[`keycloak.md`](keycloak.md) for provider/realm setup. Required env:

```env
AUTH_MODE=oidc
KEYCLOAK_ISSUER=https://auth.example.com/realms/osnova
KEYCLOAK_CLIENT_ID=frontend
KEYCLOAK_CLIENT_SECRET=        # only for confidential clients
APP_URL=https://osnova.example.com   # MUST be the public URL
```

> **Behind a reverse proxy, `APP_URL` must be the public HTTPS URL.** The OIDC callback derives
> the token-exchange `redirect_uri` from `APP_URL` (not from the internal request URL), and it
> must exactly match the redirect URI registered with the provider
> (`${APP_URL}/api/auth/callback`). A mismatch surfaces as `?error=token_exchange`.
