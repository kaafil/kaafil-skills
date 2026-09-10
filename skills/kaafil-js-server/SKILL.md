---
name: kaafil-js-server
description: Using kaafil-js on a Node backend — constructing the Kaafil client with an API key, the namespaced resource tree, how responses are shaped, aborting and timeouts, and the boundary that keeps the API key out of the browser.
license: "MIT"
compatibility: "Node.js >=18; kaafil-js ^0.1.0-beta.7"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil sdk server node backend apikey client resources express"
---

> **Ground truth:** the installed `kaafil-js` root entry — the `Kaafil`
> class, `KaafilOptions`, and the 28 resource namespaces on the instance.
> **Docs:** https://developer.kaafil.in/docs/sdk-reference ·
> **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`
> Verify symbols against the installed package before relying on them.

## Two entry points — pick the right one

| Import | Runs where | Auth |
|---|---|---|
| `kaafil-js` | **Your server only** | API key |
| `kaafil-js/client` | The browser | A session opened from minted tokens |

This skill is the first row. If you are writing browser code, you want
`kaafil-js-browser`.

**Never import `kaafil-js` (the root) into anything a bundler ships to a
browser.** The root entry is built around a tenant-wide API key.

## Constructing the client

```ts
import { Kaafil } from 'kaafil-js';

export const kaafil = new Kaafil({
  apiKey: process.env.KAAFIL_API_KEY!, // no VITE_/NEXT_PUBLIC_ prefix, ever
  environment: 'test',                 // 'test' | 'live'
});
```

Optional settings: `baseUrl`, `timeoutMs`, `maxAttempts`, `userAgent`.
Defaults are sensible; reach for them only when you have a reason.

`apiKey` is `Resolvable<string>` — it accepts a value, a thunk, or a
promise, so a key fetched from a secret manager at boot does not force you
to make module initialisation async.

Create **one** client and share it. It holds connection state and a retry
ladder; constructing one per request throws that away.

Call `kaafil.close()` on shutdown.

## The resource tree

Everything hangs off namespaces on the instance:

```ts
import { Kaafil } from 'kaafil-js';

const kaafil = new Kaafil({ apiKey: process.env.KAAFIL_API_KEY!, environment: 'test' });

kaafil.auth;        // mint manager / agency-admin sessions
kaafil.trips;       // upsert, get, cancel — plus .travellers .managers .parties .balance .bulk
kaafil.travellers;  // the traveller directory
kaafil.shareTokens; // create, read, list, patch, revoke, regenerate
kaafil.journey;     // the derived plan and its triggers
kaafil.webhooks;    // event subscriptions
kaafil.test;        // fixtures and the controllable clock (test env only)
```

The full set also includes `agencies`, `agencyAdmins`, `bookings`,
`checklists`, `closeout`, `collections`, `comms`, `events`, `expenses`,
`feedbackNps`, `files`, `float`, `forms`, `itinerary`, `managerToday`,
`pickups`, `rooming`, `seating`, `sync`, `treks` and `vendors`.

Namespaces nest. `kaafil.trips.bulk`, `kaafil.comms.templates`,
`kaafil.rooming.rooms` are all real. When you are unsure of a method name,
read the type rather than guessing — or ask the docs MCP.

## Responses are the resource

`KaafilResponse<T>` is `T & { meta }` — an intersection.

```ts ignore
const trip = await kaafil.trips.get({ tripRef: 'TRIP-8841' });

trip.name;            // ✅ the resource, directly
trip.meta.serverTime; // ✅ the envelope rides along
trip.data;            // ❌ there is no .data
```

`meta` carries `status`, `serverTime`, `requestId` and (on list calls)
`page`. Log `requestId` — it is what support will ask for.

## Aborting

Every operation takes `signal`. Wire it to the inbound request so a
client hangup does not leave work running:

```ts
import { Kaafil } from 'kaafil-js';

const kaafil = new Kaafil({ apiKey: process.env.KAAFIL_API_KEY!, environment: 'test' });

export async function getTrip(tripRef: string, signal: AbortSignal) {
  return kaafil.trips.get({ tripRef, signal });
}
```

An aborted call throws `KaafilAbortError`, which is not a failure worth
alerting on.

## What a backend is actually for, in a Kaafil integration

Three jobs, and only your server can do any of them:

1. **Mint sessions** — `kaafil.auth.mintManagerToken(...)` and
   `mintAgencyAdminToken(...)`, behind your own authentication. See
   `kaafil-auth`.
2. **Ingest trips** — push what your CRM sold. See
   `kaafil-backend-ingest`.
3. **React to change** — receive webhooks. See `kaafil-webhooks`.

Reading trip data server-side to render it yourself is possible but is
usually the wrong shape: the UIKit reads with the user's own credential,
which keeps entitlement enforcement in one place. Proxying reads through
your server means re-implementing that.

## Errors

Branch on `error.code` via `isKaafilError`, not on the status. See
`kaafil-errors`. Two that specifically bite on the server:

- **`ApiKeyEnvironmentMismatchError`** — a `test` key against `live` or
  vice versa. Check which `environment` you constructed with.
- **`403`** — the API key is tenant-wide, so a `403` here usually means the
  operation genuinely does not accept an API key (session-only), not that
  your key is weak.
