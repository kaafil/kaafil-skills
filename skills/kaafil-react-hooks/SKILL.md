---
name: kaafil-react-hooks
description: The kaafil-react-uikit/core hook layer — 56 headless hooks shared by all three families, session and persona, capabilities, snapshot reads, mutations, and the rules that keep one hook per domain. Use when building custom UI on Kaafil data.
license: "MIT"
compatibility: "React >=18.2 <20; kaafil-react-uikit ^0.1.0-beta.1"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil react hooks core headless usesession usepersona usecapabilities custom ui"
---

> **Ground truth:** the installed `kaafil-react-uikit/core` entry — 231
> exports including 56 `use*` hooks.
> **Docs:** https://developer.kaafil.in/docs/ui-kit/reference/hooks ·
> **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## One hook layer, three families

`/core` is the **only** place data access lives. There is one
`useRooming()`, not a `useManagerRooming()` and a `useAdminRooming()`.
Capability gating, snapshot reads, outbox writes, idempotency, backoff,
delta cursors, conflict reconciliation, error classification, money and
date correctness, pagination — each implemented exactly once.

That matters to you because it means: whatever family you are building
for, the hook is the same, and behaviour you learn in one place holds
everywhere.

```ts ignore
import { useSession, usePersona, useCapabilities } from 'kaafil-react-uikit/core';
```

`/core` contains **zero JSX**. It is hooks and a provider, nothing else.

## Reach for a hook only when a component will not do

The customization ladder runs surface → composite → hook. Hooks are the
bottom rung: total control, and you own every state — loading, empty,
error, offline, capability-dark, stale. The kit's components already
handle all of those.

Use hooks for genuinely custom UI — a dashboard widget, an export, a
figure in your own design language. Not to rebuild a panel that exists.

## Session and persona

```tsx
import { usePersona, useSession } from 'kaafil-react-uikit/core';

export function WhoAmI() {
  const session = useSession();
  const persona = usePersona();

  if (session.status !== 'authenticated') return <p>Opening session…</p>;

  return (
    <p>
      {persona} in {session.agencyRef ?? 'no agency'} ({session.environment})
    </p>
  );
}
```

`SessionState` is `{ status, persona, agencyRef, environment }`.
`status` is `'authenticated' | 'expired' | 'opening'`, and `agencyRef` is
`undefined` **only** for a share session — a share token carries no agency
scope of its own.

`usePersona()` is the one legitimate way to ask which persona you are.
Never decode the JWT.

## Capabilities

```tsx
import { useCapabilities } from 'kaafil-react-uikit/core';

export function RoomingLink() {
  const capabilities = useCapabilities(['rooming']);
  const rooming = capabilities.get('rooming');

  // Absent, not disabled: an agency that does not run rooming should not
  // see a greyed-out button advertising it.
  if (rooming === undefined) return null;

  return <a href="/rooming">Rooming</a>;
}
```

`useCapabilities(keys?)` returns a `ReadonlyMap<string, CapabilityTriple>`.

## Settings

```ts ignore
const value = useResolvedSetting<boolean>('agency.expenses.requireReceipt');
```

`useResolvedSetting<T>(key)` takes a three-segment dotted key and returns
`T | undefined`.

**It takes no default parameter, and you must not supply one at the call
site.** Writing `?? false` next to a flag is the bug this API shape
exists to prevent: `undefined` means *not yet resolved*, which is not the
same as *off*. Defaulting it makes a feature flicker off during load and,
worse, silently disables a feature the agency paid for whenever config is
slow. Branch on `undefined` explicitly and render nothing until you know.

## Reads

- `useSnapshotList(tripRef, listName)` / `useSnapshotEntity(...)` — the
  offline lane. Returns `{ rows, syncedAt, refreshLive }`. **Check
  `syncedAt` before rendering an empty state** — see
  `kaafil-react-offline`.
- `usePaginatedList(...)` — cursor pagination.
- Domain hooks — `useRooming`, `useItinerary`, `useExpenses`,
  `useManagerMe`, `useAgencyTrips`, `useAgencyTripManifest`, and so on.

## Writes

`useOfflineMutation(config)` is the write primitive. It enqueues into the
outbox rather than firing a request.

**No hook mints or accepts an idempotency key.** There is no
`idempotencyKey` in any hook signature. The key belongs to the outbox
entry, which outlives the component — see `kaafil-idempotency`.

## Time

```ts ignore
const serverTime = useServerTime();
```

The authoritative clock. Never `Date.now()` for Kaafil state — a field
device's clock is not trustworthy. See `kaafil-money-and-dates`.

## Escape hatch

`useKaafilClient()` hands you the underlying `KaafilClient`. Legitimate
for an operation no hook wraps yet.

It is still the **same** client and the same session — you are not
bypassing entitlement or opening a second connection. But you are
bypassing the outbox, so a write made this way is not offline-safe. On the
manager family, prefer `useOfflineMutation`.

## NEVER

- **Never call a hook outside `KaafilUIKitProvider`.**
- **Never write `?? false` or `?? true` next to `useResolvedSetting`.**
- **Never pass `idempotencyKey` to a hook.**
- **Never add React Query, SWR, Redux or any cache in front of these.**
  There is one sync engine; a second one guarantees divergence.
- **Never build per-family hook variants** — no manager-flavoured and
  admin-flavoured copy of one domain hook. One hook per domain, keyed by
  the credential.
- **Never render an empty state without checking `syncedAt`.**
