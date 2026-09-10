---
name: kaafil-react-offline
description: Making the manager family work without a network — wiring the storage adapter, what the outbox does, observing pending writes, snapshot reads and syncedAt, and conflicts. Use for "writes are lost", "works offline", "changes vanish", "two managers edited the same thing".
license: "MIT"
compatibility: "kaafil-react-uikit ^0.1.0-beta.1; kaafil-js ^0.1.0-beta.7"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil react offline outbox sync storage indexeddb conflict snapshot staleness pending"
---

> **Ground truth:** the installed `useOutboxStatus`, `useSnapshotList`,
> `useConflicts`, `useOfflineEngine` hooks and
> `createIndexedDbStorageAdapter` in `kaafil-js/client`.
> **Docs:** https://developer.kaafil.in/docs/ui-kit/architecture/offline-and-sync
> · **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## The premise

A manager is on a mountain road with no signal, and the trip is still
happening. They still mark travellers boarded, still log expenses, still
tick checklists. Offline is not a degraded mode to apologise for — for the
manager family it is the **normal** operating condition.

## Writes are lost if you skip the storage adapter

This is the single most common Kaafil bug, and it looks like a mystery:
everything works in development, then a manager's changes vanish when the
tab closes.

**Without a `storage` adapter, the outbox lives in memory only.** Queued
writes do not survive a reload.

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';
import { createIndexedDbStorageAdapter } from 'kaafil-js/client';
import { useEffect, useState } from 'react';
import type { KaafilStorageAdapter } from 'kaafil-js/client';

export function ManagerRoot({ managerId }: { managerId: string }) {
  const [storage, setStorage] = useState<KaafilStorageAdapter>();

  useEffect(() => {
    // Scope it per manager. Two people sharing a device must not share a
    // queue — that is how one manager's write lands under the other's name.
    let live = true;
    createIndexedDbStorageAdapter({ scope: managerId }).then((adapter) => {
      if (live) setStorage(adapter);
    });
    return () => {
      live = false;
    };
  }, [managerId]);

  if (!storage) return null;

  return (
    <KaafilUIKitProvider
      accessToken={accessToken}
      refreshToken={refreshToken}
      agencyRef={agencyRef}
      storage={storage}
      offlineScope={managerId}
    >
      {null}
    </KaafilUIKitProvider>
  );
}
```

`createIndexedDbStorageAdapter` is **async** and **fails at open, never at
write** — so a device with IndexedDB blocked (private browsing, a locked-
down MDM profile) throws `KaafilIndexedDbUnavailableError` up front where
you can tell the user, rather than silently dropping their work an hour
later. Catch it and say the device cannot work offline.

## The outbox

Every write goes into a queue, not straight onto the wire. The queue
persists, retries with backoff, preserves order within a lane, and carries
its own idempotency key so a retry cannot duplicate.

You do not drive it. **Do not wrap a kit mutation in your own retry
loop** — you would be competing with the ladder that already exists.

### Showing pending work

```tsx
import { useOutboxStatus } from 'kaafil-react-uikit/core';

export function SyncBadge() {
  const { pending, parked, isOnline } = useOutboxStatus();

  if (!isOnline) return <span>Offline — {pending} waiting to sync</span>;
  if (parked > 0) return <span>{parked} need attention</span>;
  if (pending > 0) return <span>Syncing {pending}…</span>;
  return <span>All synced</span>;
}
```

**`parked` is not `pending`.** A pending write is waiting for a network. A
parked write has been refused in a way retrying cannot fix — validation,
a lock, an entitlement — and needs a human. Showing them as one number
tells a manager to keep waiting for something that will never drain.

## Reads: the snapshot lane

On the manager family, a list read comes from the device's snapshot of the
trip, not from a live request.

```tsx
import { useSnapshotList } from 'kaafil-react-uikit/core';

export function Manifest({ tripRef }: { tripRef: string }) {
  const { rows, syncedAt } = useSnapshotList<{ id: string; name: string }>(tripRef, 'manifest');

  return (
    <div>
      {syncedAt === undefined ? <p>Never synced on this device</p> : <p>As of {syncedAt}</p>}
      <ul>
        {rows.map((row) => (
          <li key={row.id}>{row.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

### `syncedAt`, not a status flag — this catches everyone

A read that failed still returns normally with `rows: []`. There is no
error status to branch on.

So **an empty list is ambiguous**, and the disambiguator is `syncedAt`:

| `rows` | `syncedAt` | Means |
|---|---|---|
| `[]` | `undefined` | Never synced here. Not "no travellers" — *unknown*. |
| `[]` | a timestamp | Genuinely empty as of that time. |
| rows | a timestamp | Data, as of that time. |

Rendering "No travellers on this trip" when `syncedAt` is `undefined` is a
lie to a manager standing at a bus door. Always branch on `syncedAt`
before rendering an empty state.

`useStaleness(tripRef, listName)` tells you how old the data is when you
want to surface that.

## Conflicts

Two managers edited the same thing on two devices. Both writes are valid;
the engine took one.

```tsx
import { useConflicts } from 'kaafil-react-uikit/core';

export function ConflictCount({ tripRef }: { tripRef: string }) {
  const conflicts = useConflicts(tripRef);
  return <span>{JSON.stringify(conflicts)}</span>;
}
```

The kit surfaces conflicts through its own sync centre; you rarely need to
build a resolution UI. If you do, the provider takes a
`conflictResolver`.

## NEVER

- **Never ship the manager family without a storage adapter.** It works in
  development and loses data in the field.
- **Never share one storage scope between two people on a device.**
- **Never render an empty state without checking `syncedAt`.**
- **Never add your own retry around a kit mutation.**
- **Never treat `parked` as `pending`.**
- **Never assume a write reached the engine because the UI updated.** The
  UI reflects the outbox optimistically; that is the point.
