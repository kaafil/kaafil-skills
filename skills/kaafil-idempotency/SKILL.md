---
name: kaafil-idempotency
description: Making Kaafil writes safe to retry — how Idempotency-Key works, when to generate one and when to reuse it, why a retry with a fresh key creates a duplicate, and why no UIKit hook accepts a key. Read before writing any retry logic.
license: "MIT"
compatibility: "kaafil-js ^0.5.0; kaafil-react-uikit ^0.9.0"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil idempotency retry duplicate exactly-once idempotencykey clientref replay"
---

> **Ground truth:** the installed `kaafil-js` types —
> `Kaafil.newIdempotencyKey()`, `KaafilClient.newIdempotencyKey()`, and the
> `idempotencyKey?: string` option on write operations.
> **Docs:** https://developer.kaafil.in/docs/guides/idempotency ·
> **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## The problem

A manager on a bus logs a ₹4,000 fuel expense. The request leaves the
phone, the engine applies it, and the response is lost when the signal
drops. The phone sees a timeout and retries.

Without an idempotency key, that is now two expenses and the float is
₹4,000 short. Retrying is not optional — a field app on a bad connection
retries constantly — so the write has to be safe to repeat.

## The rule

**One logical action gets one key. Every attempt at that action reuses
it.**

```ts
import { Kaafil } from 'kaafil-js';

const kaafil = new Kaafil({ apiKey: process.env.KAAFIL_API_KEY!, environment: 'test' });

// Generated ONCE, when the user commits to the action.
const idempotencyKey = Kaafil.newIdempotencyKey();

async function cancelOnce() {
  // Every retry of THIS action passes the SAME key.
  return kaafil.trips.cancel({ tripRef: 'TRIP-8841', idempotencyKey });
}
```

The engine remembers the key. A repeat within the window returns the
**original** result rather than applying the action again — so a retry is
free, and a genuine second action needs a genuine second key.

### NEVER

- **Never generate a key inside the retry loop.** A fresh key per attempt
  is exactly the duplicate you were trying to prevent. Generate it where
  the *intent* is formed, not where the request is sent.
- **Never reuse a key across different actions.** Two distinct expenses
  sharing a key means the second silently returns the first's result and
  never happens.
- **Never derive a key from mutable content.** A key built by hashing the
  form fields changes when the user corrects a typo — which is a different
  key for what is still one intended action.
- **Never persist a key forever and reuse it days later.** The replay
  window is finite; past it, the key is just a new key.

## Where the key comes from

Both entry classes expose the generator as a static:

```ts
import { Kaafil } from 'kaafil-js';

const key = Kaafil.newIdempotencyKey();
```

```ts
import { KaafilClient } from 'kaafil-js/client';

const key = KaafilClient.newIdempotencyKey();
```

Use these rather than a hand-rolled `uuid()` — the format is the SDK's
concern, and it may carry structure the engine relies on.

## `clientRef` — the longer window

Some resources also accept a `clientRef`: **your** identifier for the
thing being created. Where an idempotency key protects a single request
from being applied twice, a `clientRef` protects the *record* from being
created twice at all — including days later, from a different device,
after a queue was replayed.

Use `clientRef` when the thing has a natural identity in your system.
Use an idempotency key when it does not.

They compose: a `clientRef` for identity, an idempotency key for the
attempt.

## In the UIKit: you do not do this

**No hook mints an idempotency key, and no hook signature accepts one.**

This is deliberate, and it is not an omission to work around. Idempotency
is bound to the *outbox entry* — the queued write that survives the tab
closing, gets retried on reconnect, and may be drained hours later on a
different network. A key minted in a component would be lost the moment
the component unmounted, which is precisely when it matters most.

So:

- **Never** try to pass `idempotencyKey` to a UIKit hook. It will not
  typecheck, and the instinct to add it is a sign of reaching for the
  wrong layer.
- **Never** wrap a kit mutation in your own retry loop. The outbox already
  retries with the correct key and the correct backoff. Your loop competes
  with it.

See `kaafil-react-offline` for what the outbox does and how to observe it.

## What is and is not idempotent

Reads are always safe. Most writes accept a key. A few operations are
**deliberately not** idempotent — minting a session is one: each call
issues a genuinely new credential pair, and returning a cached one would
be wrong.

When you are unsure, check whether the operation's options type has an
`idempotencyKey` field. If it does not, the operation does not support it,
and you should not retry it blindly.
