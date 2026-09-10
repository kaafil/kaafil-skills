---
name: kaafil-auth
description: Kaafil's credentials — which one each persona uses, how a backend mints manager and agency-admin sessions with the API key, how share tokens work, and why the API key must never reach a browser. Read before writing any Kaafil code.
license: "MIT"
compatibility: "kaafil-js ^0.1.0-beta.7; kaafil-react-uikit ^0.1.0-beta.1"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil auth authentication credential token session manager agencyadmin share apikey"
---

> **Ground truth:** the installed `kaafil-js` types (`AuthResource`,
> `KaafilOptions`, `KaafilClientOptions`, `OpenManagerSessionOptions`).
> **Docs:** https://developer.kaafil.in/docs/guides/authentication ·
> **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`
> Verify symbols against the installed package before relying on them.

## The shape of it

Kaafil has **one secret and three sessions**. The secret lives on your
server. The sessions live in browsers.

```
         your server                          the browser
   ┌───────────────────────┐            ┌──────────────────────┐
   │  API key  (secret)    │  mints →   │  manager session     │
   │  new Kaafil({apiKey}) │  mints →   │  agencyAdmin session │
   │                       │  mints →   │  share token (link)  │
   └───────────────────────┘            └──────────────────────┘
```

The API key is **tenant-wide**. It can read and write every agency, every
trip, every traveller. A session token is scoped to one person or one link.
That difference is the whole security model.

## NEVER

- **Never put the API key in browser-reachable code.** Not in a
  `VITE_*` / `NEXT_PUBLIC_*` / `PUBLIC_*` env var, not in a client
  component, not in a "temporary" hardcode. Those prefixes mean *shipped to
  the browser*. A leaked API key exposes every agency in the tenant.
- **Never import `kaafil-js` (the root entry) in browser code.** The root
  entry is the server client. The browser entry is `kaafil-js/client`.
- **Never decode a JWT to work out the persona.** Ask the kit —
  `usePersona()`. The token's contents are not your API.
- **Never pass more than one credential shape** to the provider. It is a
  compile error by design, not a precedence question.

## Server side — minting a session

The server client is the `Kaafil` class from the **root** entry.

```ts
import { Kaafil } from 'kaafil-js';

const kaafil = new Kaafil({
  apiKey: process.env.KAAFIL_API_KEY!, // server-only. No VITE_/NEXT_PUBLIC_ prefix.
  environment: 'test',                 // 'test' | 'live'
});

// A manager signs in to YOUR app; you decide who they are, then mint.
export async function mintManagerSession(ref: string) {
  const session = await kaafil.auth.mintManagerToken({ managerRef: ref });
  // NOT `session.data` — see "The response IS the resource" below.
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    agencyRef: session.agencyId,
  };
}

// The agency-admin analogue.
export async function mintAdminSession(ref: string) {
  const session = await kaafil.auth.mintAgencyAdminToken({ agencyAdminRef: ref });
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    agencyRef: session.agencyId,
  };
}
```

### The response IS the resource

`KaafilResponse<T>` is `T & { meta }` — an **intersection**, not a wrapper.
There is no `.data`, no `.body`, no `.result`.

```ts ignore
const session = await kaafil.auth.mintManagerToken({ managerRef: 'MGR-104' });

session.accessToken; // ✅ read the resource directly
session.meta;        // ✅ envelope — request id, serverTime
session.data;        // ❌ does not exist, and never did
```

This holds for **every** SDK call, not just auth. If you find yourself
reaching for `.data`, you are writing for a different SDK.

`managerRef` and `agencyAdminRef` accept **either** Kaafil's own id **or**
your CRM's external id for that person — send whichever you have and Kaafil
resolves it. That is deliberate: you should not have to store a second id.

**Kaafil does not authenticate your users.** It has no password, no login
form, no session cookie of its own. *You* decide the request really is
manager `MGR-104`, using whatever auth you already have; then you mint. So
the mint endpoint must sit behind your own authentication — an unprotected
mint route hands anyone a manager session for any `managerRef` they name.

The `refreshToken` in the response is shown **exactly once**. Hand the pair
straight to the browser; do not log it, and do not try to read it back
later.

## Browser side — using a session

Two ways in, depending on whether you are using the UIKit.

### With the UIKit (the common case)

The provider takes the credential directly. The *shape* you pass decides
which persona the session opens as.

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';

// Manager OR agency admin — whichever the token was minted for.
<KaafilUIKitProvider
  environment="test"
  accessToken={accessToken}
  refreshToken={refreshToken}
  agencyRef={agencyRef}
>
  {children}
</KaafilUIKitProvider>;
```

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';

// A traveller, from a share link. No account, no login.
<KaafilUIKitProvider shareToken={token}>{children}</KaafilUIKitProvider>;
```

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';

// Deferred — you fetch the credential yourself, lazily.
<KaafilUIKitProvider credentialResolver={async () => mintTokens()}>
  {children}
</KaafilUIKitProvider>;
```

`accessToken + refreshToken + agencyRef` opens **either** a manager or an
agency-admin session — whichever the token itself was minted for. The kit
reads the resolved persona from the session, never from a prop and never by
decoding the token. `usePersona()` is the one legitimate way to ask.

Rotation is automatic. Once the session is open, the SDK refreshes the pair
pre-emptively and on a `401`. You do not need to schedule anything.

### Without the UIKit

`KaafilClient` from `kaafil-js/client`. The session openers are namespaced
methods, **not** free functions — there is no `openManagerSession` import.

```ts
import { KaafilClient } from 'kaafil-js/client';

const client = new KaafilClient({ environment: 'test' });

// `agencyRef` is REQUIRED alongside the token pair, for both staff
// personas — the session is scoped to one agency, and the kit will not
// infer it by decoding the token.
client.session.open({ accessToken, refreshToken, agencyRef }); // manager
client.admin.open({ accessToken, refreshToken, agencyRef });   // agency admin
// Note the field name: `token`, NOT `shareToken`. The UIKit provider prop
// IS called `shareToken`; the SDK option is `token`. They are different
// APIs and the names genuinely differ — check which one you are calling.
client.share.open({ token });                                  // traveller
```

## Share tokens — the traveller lane

A share token is a link, not an account. Your backend mints it, scoped to a
trip (and optionally one traveller), with an expiry, and with an explicit
list of which sections the traveller may see.

```ts
import { Kaafil } from 'kaafil-js';

const kaafil = new Kaafil({ apiKey: process.env.KAAFIL_API_KEY!, environment: 'test' });

// `create`, not `mint`. Minting is what `auth.*` does for the two staff
// personas; a share link is a resource you create, patch, revoke and
// regenerate.
const link = await kaafil.shareTokens.create({
  tripRef: 'TRIP-8841',
  travellerRef: 'TRV-22', // omit for a whole-trip family link
});
```

The rest of the lane is `shareTokens.read`, `.list`, `.patch`,
`.revoke` and `.regenerate`.

**The server decides the sections, not the component.** If a traveller says
a section is missing, the token's configuration is the cause — not a UI
prop. See `kaafil-react-troubleshooting`.

A dead, revoked or expired link renders `Not found.` and nothing else. That
blankness is deliberate and must not be "improved": any heading, divider or
layout hint would confirm to a stranger that the link was once real.

## Which credential reaches which operation

| Operation class | Credential |
|---|---|
| Minting sessions, ingesting trips, bulk writes, webhooks config | API key (server only) |
| On-ground trip work — manifest, rooming, expenses, pickups | manager session |
| Everything a manager can do, plus agency-wide directories and settings | agencyAdmin session |
| Reading one shared trip document, submitting a form on it | share token |

Which one an operation takes is a property of **the operation**, not of the
resource. Reading a trip as a manager and reading it as a share link are
different operations against the same trip.

## Environments

`environment: 'test' | 'live'`. They are separate tenants reached through
the same host with different keys — data never crosses. Develop against
`'test'`; it has fixtures and a controllable clock.

## When something is refused

Branch on `error.code`, never on the status alone — `kaafil-errors` has the
catalog. The two you will meet first here:

- **`401`** — the session is not valid. If rotation is working this should
  be rare; it usually means the tokens were never opened, or the API key
  minted them for the other environment.
- **`403`** — the credential is valid but not entitled to that operation.
  Usually a manager session reaching for an agency-wide read. Mount the
  surface that matches the credential rather than widening the credential.
