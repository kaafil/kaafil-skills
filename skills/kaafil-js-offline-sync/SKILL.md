---
name: kaafil-js-offline-sync
description: The kaafil-js offline machinery — the outbox, snapshot store, delta cursors, the sync push/pull lanes, conflict reconciliation and the blob lane. Use when building a field app without the React UIKit, or when debugging sync.
license: "MIT"
compatibility: "kaafil-js ^0.1.0-beta.7"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil offline sync outbox snapshot delta cursor conflict blob drain indexeddb"
---

> **Ground truth:** the installed `kaafil-js/client` exports —
> `createOfflineEngine`, `createOutbox`, `createSnapshotStore`,
> `createDeltaCursor`, `createPullCoordinator`, `createDrainer`,
> `createBlobLane`, `reconcileConflict`, and the `sync` resource.
> **Docs:** https://developer.kaafil.in/docs/guides/modules/sync ·
> **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## Read this first

**If you are on React, use the UIKit.** It wires everything below
correctly, and the wiring is subtle enough that getting it wrong loses a
manager's work silently. See `kaafil-react-offline`.

This skill is for building a field client without the kit, or for
understanding what the kit is doing when sync misbehaves.

## The model

```
  writes ──▶ OUTBOX ──drain──▶ engine        (your changes, queued)
  engine ──pull──▶ SNAPSHOT ──▶ your reads   (their changes, cached)
```

Two independent lanes. Writes never block on reads; reads never wait for
a drain. A device that has been offline for a day has a full outbox and a
stale snapshot, and both recover on their own.

## The outbox

Every write is enqueued, not sent. The queue:

- **persists** — via the storage adapter, so it survives a reload
- **retries with backoff** — and knows which failures are worth retrying
- **preserves order within a lane**
- **carries its own idempotency key** — so a retry cannot duplicate

`OutboxStatus` distinguishes **pending** (waiting for a network) from
**parked** (refused in a way retrying cannot fix — validation, a lock, an
entitlement). Surface these separately: telling a manager to "keep
waiting" for a parked write is telling them to wait forever.

Constants worth knowing: `MAX_BATCH_OPS`, `BATCH_THRESHOLD_OPS`, and
`shouldUseBatchTransport` — the client switches to the batched transport
once a drain is big enough.

## Storage

```ts
import { createIndexedDbStorageAdapter } from 'kaafil-js/client';

export async function makeStorage(managerId: string) {
  // Scope per PERSON. Two managers sharing a tablet must not share a queue.
  return createIndexedDbStorageAdapter({ scope: managerId });
}
```

It **fails at open, never at write** — a device with IndexedDB blocked
throws `KaafilIndexedDbUnavailableError` here, up front, instead of
silently dropping work an hour later. Catch it and tell the user this
device cannot work offline. Do not quietly fall back to memory.

`createInMemoryStorageAdapter` exists for tests. It is not a production
fallback.

## The snapshot store

Reads come from a local snapshot of the trip, refreshed by pulls.

The critical property: **a failed read is not distinguishable by status.**
There is no error flag on a snapshot read — you get rows and a
`syncedAt`. `syncedAt === undefined` means *never synced here*, which is
not the same as *empty*. Branch on it before rendering "nothing here".

## Delta cursors

`createDeltaCursor` tracks "what have I seen". A delta pull returns
changed rows plus **tombstones** for deletions — `isTombstone` and
`mergeDeltaRows` handle folding them in.

Deletions matter: without tombstones a device would keep showing a
traveller who was removed from the trip. If you merge deltas by hand,
handle them.

A cursor in flight throws `KaafilDeltaCursorInFlightError` rather than
allowing two overlapping pulls to interleave.

## The sync resource

```ts ignore
client.sync.push(...);      // drain the outbox
client.sync.pullTrip(...);  // refresh one trip's snapshot
client.sync.digest(...);    // cheap drift check — is my copy current?
client.sync.pushShare(...); // the share lane's own push
```

`digest` is the cheap one: a per-trip fingerprint you compare before
deciding to pull. On a metered mountain connection that difference
matters.

`SYNC_PULL_SECTIONS` and `CONSOLIDATED_PULL_THRESHOLD_LISTS` describe
what a full pull covers and when it consolidates.

## Conflicts

Two devices edited the same row. Both writes were valid; one landed.

`reconcileConflict` and the `ConflictResolver` type are the seam. A
conflict is **not** an error to swallow — it is a fact a human may need to
see. The UIKit surfaces them in its sync centre; a custom client needs
its own affordance.

`readCurrentVersion` supports versioned writes, which is how the engine
detects the conflict in the first place.

## The blob lane

Photos and documents do not go through the JSON outbox — they are large,
and a receipt photo must not block a checklist tick from draining.
`createBlobLane` runs them separately, with its own drain and status, plus
`compressImage` / `convertImageLossless` for shrinking a phone camera
image before it crosses a bad connection.

## Events

`createOfflineEvents` gives you the stream — `sync.drained`,
`sync.error`, `snapshot.updated`, `share.invalidated`. Drive UI from these
rather than polling.

## NEVER

- **Never build this by hand on React.** Use the UIKit.
- **Never share a storage scope between two people.**
- **Never treat a snapshot's empty rows as "no data"** without checking
  `syncedAt`.
- **Never drop tombstones** when merging deltas.
- **Never retry a write with a fresh idempotency key.**
- **Never run two pulls on one cursor concurrently.**
- **Never fall back to in-memory storage** when IndexedDB is unavailable.
  Tell the user instead.
