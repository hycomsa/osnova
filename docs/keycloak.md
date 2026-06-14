# Keycloak setup

Osnova authenticates users via Keycloak using OpenID Connect (authorization-code
flow with PKCE). Identities are federated into Osnova on first login; access is then
governed by per-workspace roles (see [administration.md](administration.md)).

## 1. Create the realm

Create a realm named **`osnova`** (the name is referenced by `KEYCLOAK_ISSUER`).

## 2. Create the client

Create a client used by the Osnova web app:

| Setting | Value |
|---------|-------|
| Client ID | `frontend` (matches `KEYCLOAK_CLIENT_ID`) |
| Client type | OpenID Connect |
| Authentication | Public (PKCE) is fine; confidential also works — then set `KEYCLOAK_CLIENT_SECRET`. |
| Standard flow | **Enabled** (authorization code) |
| Valid redirect URIs | `${APP_URL}/api/auth/callback` — e.g. `http://localhost:3000/api/auth/callback` |
| Valid post-logout redirect URIs | `${APP_URL}/` |
| Web origins | `${APP_URL}` |

The app requests the `openid profile email` scopes. The `sub` and `email` claims are
required; `name` is used for display when present.

## 3. Login-screen language (i18n)

Osnova passes the user's chosen locale to Keycloak via the `ui_locales` parameter, so
the login page renders in the same language as the app (Polish, English, German). For
that to take effect, enable internationalization on the realm:

**Realm settings → Localization → Internationalization = On**, supported locales
`pl, en, de`, default `pl`.

Via the Admin REST API (token from a master-realm admin client):

```bash
curl -X PUT "https://<keycloak>/admin/realms/osnova" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"internationalizationEnabled":true,"supportedLocales":["pl","en","de"],"defaultLocale":"pl"}'
```

A successful update returns **HTTP 204**.

## 4. Admin emails

Set `ADMIN_EMAILS` (comma-separated). On first login, a user whose email matches is
granted the `system_admin` global role — letting them create workspaces and bind
repositories.

## 5. Microsoft / Entra ID sign-in (identity brokering)

Internal users can sign in with their Microsoft work account. Keycloak brokers to
Microsoft Entra ID: the login screen gets a "Microsoft" button → Entra → back to
Keycloak → back to Osnova. Osnova itself is unchanged (it always federates through
Keycloak).

**Azure side (App Registration in the hycom tenant):**
- Single-tenant (the hycom directory).
- Add Keycloak's broker callback as a **Web redirect URI**:
  `https://<keycloak>/realms/osnova/broker/microsoft/endpoint`
- Create a **client secret** (Certificates & secrets) and note the **Application
  (client) ID** and **Directory (tenant) ID**.

**Keycloak side** — an OIDC identity provider with alias `microsoft`:
- Endpoints from `https://login.microsoftonline.com/<TENANT-ID>/v2.0`.
- Client authentication `client_secret_post`, PKCE (S256), scopes `openid profile email`.
- `trustEmail` on; attribute mappers for `email`, `given_name`→firstName,
  `family_name`→lastName.
- **Auto-link by email:** a first-broker-login flow that silently links a Microsoft
  identity to an existing Keycloak user with the same (trusted) email. Verify against a
  real sign-in before enabling for everyone.

The IdP can be created/updated via the Admin REST API
(`/admin/realms/osnova/identity-provider/instances`) or in the Admin Console under
**Identity providers**. Keep it **disabled** until the client secret is set, then enable
to surface the button on the login screen.

## How the flow works

1. `GET /api/auth/login` generates PKCE verifier + state, reads the locale cookie, and
   redirects to Keycloak with `ui_locales`.
2. `GET /api/auth/callback` validates state + verifier, exchanges the code, reads
   `sub`/`email`/`name`, find-or-creates the Osnova user, mints the `osnova_session`
   JWT (8 h), and stores the locale cookie.
3. `GET /api/auth/logout` clears the session cookie.

Source: `src/app/api/auth/{login,callback,logout}/route.ts`, `src/lib/auth/keycloak.ts`.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Redirected back to login repeatedly | Redirect URI mismatch — it must equal `${APP_URL}/api/auth/callback` exactly (scheme, host, port, path). |
| `invalid_grant` on token | Wrong user credentials, or expired code. |
| `unauthorized_client` / "Invalid client or Invalid client credentials" | The client is **confidential** but no/invalid secret was sent. Set `KEYCLOAK_CLIENT_SECRET`, or make the client public. |
| `Client not allowed for direct access grants` | You tried a password grant on a client (e.g. `security-admin-console`) that only allows the browser code flow. Use a client with Direct Access Grants enabled, or use the browser flow. |
| Login screen ignores language | Internationalization not enabled on the realm (step 3), or the locale isn't in `supportedLocales`. |

### Admin REST note
Automating realm changes needs a token from a **master-realm** admin client. On some
deployments `admin-cli` is configured as *confidential* and requires a `client_secret`
(Clients → admin-cli → Credentials); `security-admin-console` rejects the password
grant. Use a master-realm client with Direct Access Grants enabled (plus its secret if
confidential), or simply use the Admin Console UI.

Next: [Feature guide »](features.md)
