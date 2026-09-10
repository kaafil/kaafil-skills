---
name: kaafil-js-browser
description: Using kaafil-js/client directly in a browser without the React UIKit — constructing KaafilClient, the namespaced session openers, the resource tree, and the offline engine. Use when building non-React UI or a custom frontend on Kaafil.
license: "MIT"
compatibility: "kaafil-js ^0.1.0-beta.7"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil sdk browser client vanilla vue svelte session share offline headless"
---

> **Ground truth:** the installed `kaafil-js/client` entry — the
> `KaafilClient` class, its `session` / `admin` / `share` namespaces, and
> `openOffline`.
> **Docs:** https://developer.kaafil.in/docs/sdk-reference ·
> **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## When you want this

You are not using React, or you are building UI the UIKit does not cover.
If you *are* on React, use the UIKit — it wraps this client and gives you
the offline lane, capability gating and every loading state for free.

Import from **`kaafil-js/client`**, never the root `kaafil-js`. The root
entry is built around a tenant-wide API key and must not reach a browser.

## Construct, then open a session

```ts
import { KaafilClient } from 'kaafil-js/client';

const client = new KaafilClient({ environment: 'test' });
```

Note what is **absent**: no `apiKey`. A browser client has no secret. It
becomes useful only once you open a session with tokens your backend
minted — see `kaafil-auth`.

### The openers are namespaced methods

There is no `openManagerSession` function to import. This trips up
everyone:

```ts
import { KaafilClient } from 'kaafil-js/client';

const client = new KaafilClient({ environment: 'test' });

client.session.open({ accessToken, refreshToken, agencyRef }); // manager
client.admin.open({ accessToken, refreshToken, agencyRef });   // agency admin
client.share.open({ token });                                  // traveller
```

`agencyRef` is required for both staff personas. The share opener's field
is `token` — not `shareToken`, which is the *UIKit provider* prop name.

`open` is synchronous and returns `void`. Rotation afterwards is
automatic: the client refreshes pre-emptively and on a `401` without you
scheduling anything. `onRefresh` and `refresh` are optional hooks, not
obligations.

Opening twice throws `KaafilClientAlreadyOpenError`; using a resource
before opening throws `KaafilClientNotOpenError`.

## The resource tree

Same shape as the server client, minus what a session cannot reach:

```ts ignore
client.trips;       // .get .upsert .cancel .travellers .managers .parties .balance .bulk
client.rooming;     // .rooms .stayWindows and the board
client.itinerary;   // .days .items .changeLog
client.expenses;    // .claims
client.collections;
client.pickups;
client.seating;
client.checklists;
client.forms;
client.files;
client.float;
client.closeout;
client.managerMe;      // the manager's own profile and trips
client.agencyAdminMe;  // the admin's own profile
client.managerToday;   // what is happening now
client.notifications;
client.sync;           // .push .pullTrip .digest .pushShare
client.share;          // .open .snapshot .manifest .forms
```

Responses are the resource: `KaafilResponse<T>` is `T & { meta }`. There
is no `.data`.

## The share lane

A traveller client is read-mostly and needs no account:

```ts
import { KaafilClient } from 'kaafil-js/client';

const client = new KaafilClient({ environment: 'test' });
client.share.open({ token });
```

Then `client.share.snapshot(...)` for the published document,
`client.share.manifest(...)`, and `client.share.forms` for anything the
traveller can submit.

The server decides which sections the snapshot contains. A section the
token does not grant is **absent** from the response — not empty, not
`null`. Render what came back; do not build a layout that assumes a fixed
set of sections.

Expired and revoked links throw `KaafilShareTokenExpiredError` and
`KaafilShareTokenRevokedError`. Whatever you render for those must be
indistinguishable from a link that never existed — no heading, no
divider, nothing that confirms it was once real.

## Offline

`client.openOffline()` starts the offline engine, and
`kaafil-js/client` exports the pieces directly:
`createIndexedDbStorageAdapter`, `createOutbox`, `createOfflineEngine`,
`createSnapshotStore`, `createPullCoordinator`, `createDrainer`,
`createBlobLane`, `reconcileConflict`.

Wiring these by hand is real work — the UIKit does it for you. If you are
building a field app without React, read `kaafil-js-offline-sync` first
and budget for it.

## Errors

Identical to the server: `isKaafilError`, `isRetryable`, typed subclasses,
branch on `error.code`. See `kaafil-errors`.

## NEVER

- **Never import the root `kaafil-js` in browser code.**
- **Never put an API key in a browser client.** It has no `apiKey` option
  for a reason.
- **Never look for a free `openManagerSession` import.** It is
  `client.session.open`.
- **Never call `.data` on a response.**
- **Never add a second cache in front of the client.** It holds session
  and sync state; a parallel store diverges.
- **Never assume a share snapshot has a given section.**
