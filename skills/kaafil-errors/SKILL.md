---
name: kaafil-errors
description: How Kaafil refuses — the error envelope, branching on error.code rather than the HTTP status, the typed error subclasses, which failures are safe to retry, and the 423 close-out lock that has no override. Read when anything fails.
license: "MIT"
compatibility: "kaafil-js ^0.5.0"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil error errors failure retry 401 403 409 422 423 locked conflict troubleshooting"
---

> **Ground truth:** the installed `kaafil-js` error classes (`KaafilError`
> and its subclasses, `isKaafilError`, `isRetryable`, `ERROR_CODE_TABLE`).
> **Docs:** https://developer.kaafil.in/docs/guides/errors · **Docs MCP:**
> `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`
> Verify symbols against the installed package before relying on them.

## Branch on `error.code`, never on the status alone

One HTTP status covers several genuinely different situations. A `409` can
mean "you raced another writer" or "that name is taken"; those need
different handling and the status cannot tell them apart. `error.code` can.

```ts
import { isKaafilError, isRetryable } from 'kaafil-js';

try {
  await doSomething();
} catch (error) {
  if (!isKaafilError(error)) throw error; // not ours — do not swallow it

  error.code;      // the catalog code — branch on THIS
  error.status;    // the HTTP status, for logs
  error.kind;      // a coarse class, useful for a default branch
  error.requestId; // quote this in a support escalation
  error.details;   // per-code structured context, when there is any
}
```

Every field above is `| undefined` — a transport failure never reached the
engine, so it has no code and no request id. Do not assume `error.code` is
present.

## Typed subclasses, when you want one branch

`isKaafilError` narrows to the base class. For a single specific failure,
`instanceof` a subclass reads better than a code comparison:

```ts
import { KaafilLockedError, KaafilRateLimitedError, KaafilVersionConflictError } from 'kaafil-js';

type Outcome = 'ok' | 'stale' | 'slow-down' | 'closed';

export async function attempt(): Promise<Outcome> {
  try {
    await doSomething();
    return 'ok';
  } catch (error) {
    // Someone else wrote first. Re-read, re-apply, then retry the write.
    if (error instanceof KaafilVersionConflictError) return 'stale';
    // Back off — and prefer `isRetryable` over hand-rolling the ladder.
    if (error instanceof KaafilRateLimitedError) return 'slow-down';
    // The trip is closed out. There is no override; see below.
    if (error instanceof KaafilLockedError) return 'closed';
    throw error;
  }
}
```

The full set includes `KaafilValidationError`, `KaafilNotFoundError`,
`KaafilUnauthenticatedError`, `KaafilEntitlementError`,
`KaafilReadOnlyRoleError`, `KaafilCapabilityUnavailableError`,
`KaafilNetworkError`, `KaafilTimeoutError`, `KaafilAbortError`, and the
share-lane errors `KaafilShareTokenExpiredError`,
`KaafilShareTokenRevokedError`, `KaafilShareLinkExpiredError`.

## What is safe to retry

Do not write your own retry predicate. The SDK ships one, and it already
knows which codes are idempotent-safe:

```ts
import { isRetryable } from 'kaafil-js';

function shouldRetry(error: unknown): boolean {
  return isRetryable(error);
}
```

The SDK also retries internally up to `maxAttempts`. A retry you add on top
is a second ladder — usually you want to handle the failure, not re-run it.

**When you do retry a write, reuse the same idempotency key.** Retrying
with a fresh key is how you get a duplicate expense. See
`kaafil-idempotency`.

## The four refusal axes

These mean four genuinely different things, and conflating them produces
misleading UI.

| Axis | Meaning | What the user should be told |
|---|---|---|
| **Unauthenticated** (`401`) | No valid session | "Sign in again" |
| **Entitlement** (`403`) | Valid credential, not allowed this operation | "You don't have access" — do not offer a retry |
| **Capability unavailable** | The agency has not enabled this module | Nothing. Hide the feature; do not advertise it. |
| **Locked** (`423`) | The trip is closed out | "This trip is closed" — final |

The distinction between *entitlement* and *capability* matters: entitlement
is about the person, capability is about the agency's configuration. A
manager denied by entitlement may ask their admin. A capability that is off
should not have been visible at all.

## `423` — the close-out lock has no override

When a trip is closed out, writes against it are refused with `423`. This
is final.

**Do not build an override.** There is no admin-override endpoint, no
force flag, no elevated credential that bypasses it — not for agency
admins, not for the API key. A close-out is an accounting boundary, and a
UI affordance that implies it can be reopened by the right person is
misleading at best.

What you *should* do on a `423`: tell the user the trip is closed, and
stop. If the trip genuinely needs reopening, that is an explicit unlock
operation with its own authorisation, not an error-handler branch.

## Validation failures

`KaafilValidationError` carries `details` describing which field was
rejected and why. Surface it — a generic "something went wrong" for a
validation failure wastes the one piece of information the engine went out
of its way to give you.

## In the UIKit

Components handle their own error states; you do not need to wrap them in
try/catch. What you *do* get is `onSessionExpired` on the provider, for the
one failure the host must own:

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';

<KaafilUIKitProvider
  accessToken={accessToken}
  refreshToken={refreshToken}
  agencyRef={agencyRef}
  onSessionExpired={(credentialKind) => {
    // Rotation already failed. Send them back to YOUR login.
    router.push(`/login?as=${credentialKind}`);
  }}
>
  {null}
</KaafilUIKitProvider>;
```

A read that fails does **not** produce an error state you can detect by
checking `status`. See `kaafil-react-troubleshooting` — this catches
people out.
