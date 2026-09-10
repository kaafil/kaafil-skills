---
name: kaafil-backend-ingest
description: Pushing trips from your CRM into Kaafil — the upsert lane, why sourceUpdatedAt is required, echoing a trip back, cancelling, bulk pushes, and waiting for the journey to build. Use for "ingest trips", "sync our CRM", "create a trip".
license: "MIT"
compatibility: "Node.js >=18; kaafil-js ^0.1.0-beta.7"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil ingest upsert trip create sync crm bulk journey cancel backend"
---

> **Ground truth:** the installed `kaafil-js` `TripsResource` —
> `upsert`, `get`, `cancel`, and the `travellers` / `managers` / `parties`
> / `balance` / `bulk` namespaces.
> **Docs:** https://developer.kaafil.in/docs/guides/modules/trips ·
> **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## There is no "create a trip"

Creation is **upsert**. `kaafil.trips.upsert(...)` creates the trip if
`externalTripId` is new and re-syncs it if it is not. There is no
`createTrip`, no `POST /trips` you call once and then switch to `PATCH`.

This is the right shape for a CRM integration: you do not have to track
whether Kaafil has seen this trip before. Send the whole trip as you
currently know it, as often as it changes.

```ts
import { Kaafil } from 'kaafil-js';

const kaafil = new Kaafil({ apiKey: process.env.KAAFIL_API_KEY!, environment: 'test' });

export async function pushTrip() {
  return kaafil.trips.upsert({
    externalTripId: 'TRIP-8841',   // YOUR id. The trip's identity.
    externalAgencyId: 'AGY-01',    // YOUR id for the operating agency.
    code: 'LEH-JUN-01',
    name: 'Leh & Nubra — June departure',
    startDate: '2026-06-12',
    endDate: '2026-06-20',
    // The CRM's own record-updated timestamp. Required. See below.
    sourceUpdatedAt: new Date(),
    eventType: 'TRIP',             // or 'TREK'
    tripMode: 'GROUP',             // or 'PERSONALIZED'
    status: 'CONFIRMED',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
  });
}
```

## `sourceUpdatedAt` is required, and deliberately has no default

This is your CRM's own "when was this record last changed" timestamp, and
Kaafil uses it for last-write-wins staleness detection.

It has no "defaults to now" **on purpose**. If it defaulted, every write
would look like the newest write, and a retry of an old payload arriving
after a newer one would silently overwrite the newer data. Out-of-order
delivery is normal in queued systems, so this field is what keeps a stale
replay from winning.

**Send the real timestamp from your record.** Not `new Date()` at call
time — unless the record genuinely just changed.

## Ingest is last-write-wins

Send the whole trip, not a diff. Kaafil reconciles.

That means you can safely re-push on every CRM save, replay a backlog, or
run a nightly full sync. What you must not do is push a *partial* trip and
expect the omitted fields to be preserved — this is a replace lane.

## Then wait for the journey

A trip is not immediately workable. Kaafil derives the **journey** — the
plan that makes the trip operable — from the trip's shape and the agency's
configuration, and that takes a moment.

If you push a trip and immediately open a manager session expecting a
working trip screen, you will see an incomplete one. Use the journey
resource to wait (`WaitUntilJourneyReadyOptions` describes the shape), or
simply do not surface the trip to staff until it is ready.

## Echo it back

```ts
import { Kaafil } from 'kaafil-js';

const kaafil = new Kaafil({ apiKey: process.env.KAAFIL_API_KEY!, environment: 'test' });

export async function echo(tripRef: string) {
  // `tripRef` takes YOUR externalTripId or Kaafil's own id — either resolves.
  return kaafil.trips.get({ tripRef });
}
```

Useful as an integration smoke test: push, echo, compare.

## Cancelling

```ts
import { Kaafil } from 'kaafil-js';

const kaafil = new Kaafil({ apiKey: process.env.KAAFIL_API_KEY!, environment: 'test' });

export async function cancel(tripRef: string, idempotencyKey: string) {
  return kaafil.trips.cancel({ tripRef, idempotencyKey });
}
```

Cancelling is distinct from closing out. A cancellation means the
departure is not happening; a close-out means it happened and the books
are shut. Do not model one as the other.

## What hangs off the trip

Once the trip exists, its sub-resources take the same `tripRef`:

- `kaafil.trips.travellers` — who is on it
- `kaafil.trips.parties` — booking groups (a family, a couple)
- `kaafil.trips.managers` — staff assignment, including the lead manager
- `kaafil.trips.balance` — what each traveller still owes
- `kaafil.trips.bulk` — many trips in one call

Bookings, rooming, itinerary and the rest are their own top-level
namespaces, all scoped by `tripRef`.

## Bulk

`kaafil.trips.bulk` exists for backfills and nightly syncs. Prefer it over
a loop of `upsert` calls when you are pushing many trips — it is one round
trip and one transaction boundary rather than N of each.

## NEVER

- **Never call this from a browser.** It needs the API key. See
  `kaafil-js-server`.
- **Never invent an id space.** `externalTripId` is your own id; storing a
  second Kaafil-specific one is work you do not need to do.
- **Never default `sourceUpdatedAt` to now** to make the type check pass.
  That defeats the exact protection it exists for.
- **Never push a partial trip** expecting a merge. This lane replaces.
- **Never retry an upsert with a fresh idempotency key.** Reuse it — see
  `kaafil-idempotency`.
