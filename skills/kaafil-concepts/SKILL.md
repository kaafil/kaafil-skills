---
name: kaafil-concepts
description: The Kaafil mental model — what the product does, the trip-to-journey pipeline, the scoping hierarchy (tenant, agency, trip), capabilities, and the vocabulary (ref vs id, trip vs trek, manifest, close-out). Read this before any other Kaafil skill.
license: "MIT"
compatibility: "kaafil-js ^0.1.0-beta.7; kaafil-react-uikit ^0.1.0-beta.1"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil concepts model architecture journey capability agency trip trek manifest glossary"
---

> **Ground truth:** https://developer.kaafil.in/docs/guides/what-is-kaafil
> and `/docs/guides/platform-overview`. **Docs MCP:**
> `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`
> Verify symbols against the installed package before relying on them.

## What Kaafil is — and is not

Kaafil runs the **operations of a trip that has already been sold**.

It is **not**: a booking engine, a payment gateway, a CRM, an inventory
system, or a consumer brand. It never puts its own name in front of a
traveller. Your product keeps its branding; Kaafil is the engine
underneath.

It **is**: the manifest, rooming, itinerary, pickups, vehicles and seating,
expenses and float, collections, checklists, forms, documents, comms and
close-out for a live group trip — plus the three surfaces the people
involved use to work it.

If a request is about selling, pricing, or acquiring the trip, it is
upstream of Kaafil. If it is about *running* the trip, it is Kaafil's.

## The pipeline

```
your CRM  ──upsert──▶  Trip  ──Kaafil builds──▶  Journey  ──▶  three surfaces
(sold it)              (facts)                   (the plan)     (people work it)
```

1. **You push a confirmed trip in.** `kaafil.trips.upsert(...)`. This is a
   last-write-wins ingest lane: send the whole trip as you know it, as
   often as you like.
2. **Kaafil builds the Journey.** Derived from the trip's shape and the
   agency's configuration — you do not author it directly. It takes a
   moment; a trip is not immediately workable.
3. **People work it.** A field manager on a phone, desk staff in the
   office, and the traveller on a link.

Everything else — bookings, travellers, rooming, expenses — hangs off the
trip you ingested.

## Scoping

```
Tenant  ──▶  Agency  ──▶  Trip  ──▶  everything else
```

- **Tenant** — you, the platform customer. Your API key is tenant-wide.
  `live` and `test` are separate tenants.
- **Agency** — one operating business inside your tenant. Most real data
  lives here. An agency is **immutable** on a person: a manager belongs to
  one agency and cannot be moved.
- **Trip** — one departure. The unit almost every operation is scoped to.

This is why `agencyRef` is required when opening a staff session: the
session is bound to one agency, and the kit will not guess.

## Capabilities

A **capability** is a module an agency has switched on — rooming, seating,
expenses, forms, feedback. Not every agency runs every module.

This produces a state that has no equivalent in most APIs: a feature that
is not merely empty but **absent**. A capability that is off should not
render a disabled button or an empty state advertising what could be — it
should not appear.

The UIKit handles this for you if you let it. Do not add your own
"if (hasRooming)" gate on top; use `useCapabilities()` and let components
render their own dark treatment.

## Refs vs ids

Kaafil accepts **your** identifiers almost everywhere.

- `externalTripId`, `externalAgencyId`, `managerRef`, `travellerRef` — your
  CRM's ids.
- Kaafil also has its own ids, returned in responses.

Where an option is named `*Ref`, you may send **either** your id or
Kaafil's and it resolves. That is deliberate: you should not have to store
and reconcile a second identifier space.

## Trip vs trek

Both are departures, and they share most machinery. The difference is
shape:

- **`TRIP`** — a group with a known manifest that travels together.
- **`TREK`** — a recurring/open departure where people join per-instance,
  including walk-ins.

`eventType: 'TRIP' | 'TREK'` on ingest. Most operations take both; a few
(walk-ins, trek boards) are trek-only.

## Vocabulary you will meet

| Term | Means |
|---|---|
| **Manifest** | Who is on the trip — the roster, with party groupings |
| **Party** | A booking group travelling together (a family, a couple) |
| **Rooming** | Assigning travellers to rooms across stay windows |
| **Seating** | Assigning travellers to vehicle seats |
| **Pickup stop** | A boarding point, with per-traveller board status |
| **Float** | Cash issued to a manager to spend on the trip |
| **Expense** | Money the manager spent, claimed against the float |
| **Collection** | Money taken *from* a traveller against a balance |
| **Checklist** | Gated tasks that must be done at a phase of the trip |
| **Form** | A questionnaire dispatched to travellers or managers |
| **Close-out** | Ending the trip's books. Locks writes with `423`. |
| **Share token** | A link letting a traveller see a scoped view |
| **Snapshot** | The offline cache of a trip the manager's device holds |
| **Outbox** | Queued writes on a device waiting to reach the engine |

## The three personas, again

Because everything routes through this. Personas are not roles in a
dropdown — they are different credentials with different surfaces and
different assumptions.

| Persona | Assumption that shapes everything |
|---|---|
| `manager` | **Offline is normal.** A mountain road with no signal, and the trip is still happening. |
| `agencyAdmin` | Online desk work, full capability parity with a manager, plus agency-wide views. |
| `share` | Unauthenticated stranger holding a link. Leaks nothing, not even that a link once existed. |

## Time and money, briefly

Two rules that cause real bugs if missed, covered fully in
`kaafil-money-and-dates`:

- **"Now" is `meta.serverTime`.** A field device's clock is not
  trustworthy.
- **Money is an integer count of paise** in a `*Minor` field. Never a
  float.

## Where to go next

`kaafil-auth` for credentials — it is the prerequisite for everything else.
Then `kaafil-react-setup` for the frontend, or `kaafil-js-server` and
`kaafil-backend-ingest` for the backend.
