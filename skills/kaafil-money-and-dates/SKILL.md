---
name: kaafil-money-and-dates
description: Handling amounts and time in Kaafil — every amount is an integer count of paise in a *Minor field, and "now" is always meta.serverTime rather than the device clock. Read before rendering or computing any money value or timestamp.
license: "MIT"
compatibility: "kaafil-js ^0.5.0; kaafil-react-uikit ^0.9.0"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil money currency paise minor amount date time servertime timezone rounding formatting"
---

> **Ground truth:** the installed `kaafil-js` types — every `*Minor` field
> is `number`, and `meta.serverTime` is on every `ResponseMeta`.
> **Docs:** https://developer.kaafil.in/docs/guides/money-and-currency ·
> **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## Money is an integer, always

Every amount in Kaafil is an **integer count of the currency's minor
unit** — paise for INR — in a field whose name ends in `Minor`, with a
currency alongside.

```ts
// ₹1,250.00 is:
const amountMinor = 125000; // ✅ integer paise
```

There are no decimals, no floats and no pre-formatted strings anywhere in
the API. `amountMinor`, `balanceMinor`, `collectedMinor`, `dueMinor`,
`balanceDueMinor`, `adjustmentsMinor` — all integers.

### NEVER

- **Never use a float for money.** `1250.10 * 100` is `125009.99999…`.
  This is the single most common way to lose a rupee in a ledger.
- **Never divide before you have to.** Do arithmetic in minor units and
  convert only at the moment you render.
- **Never send a formatted string.** `"₹1,250"` is not an amount.
- **Never assume the currency.** Read it from the resource; an agency can
  operate in more than one.

### Converting for display

```ts
export function formatMinor(amountMinor: number, currency: string, locale = 'en-IN'): string {
  // Intl handles the minor-unit scale itself, so hand it the major value
  // computed with a single division at the very end.
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amountMinor / 100);
}
```

Two caveats on that `/ 100`: it is correct for INR and most currencies, but
not universally — a few have zero or three minor digits. If you support
those, derive the scale rather than hardcoding it. And do the division
**once**, at the render boundary, never in intermediate arithmetic.

### Summing

```ts
export function total(rows: ReadonlyArray<{ amountMinor: number }>): number {
  // Integers all the way. No rounding step, because none is needed.
  return rows.reduce((sum, row) => sum + row.amountMinor, 0);
}
```

## "Now" is `meta.serverTime`

Every response envelope carries `meta.serverTime`. That is the
authoritative clock.

```ts
const trip = await doSomething();
// `meta` rides along on every response — see kaafil-auth for why the
// response IS the resource rather than a wrapper around it.
```

### Why this matters more than it looks

A manager's phone has been in a bag on a bus for nine hours in a valley
with no signal. Its clock may be minutes or hours off, and it may have
jumped when it reacquired the network. Anything you compute from
`Date.now()` on that device — is this stop overdue? is this window open? —
can be wrong in a way that changes what a human does.

### NEVER

- **Never use `Date.now()` or `new Date()` to decide Kaafil state.** Not
  for "is this late", not for "is this window open", not for a countdown.
- **Never compare a server timestamp to a local one.** Compare two server
  timestamps.

Formatting an already-known instant for display is fine —
`new Date(trip.startDate).toLocaleDateString()` renders a value the server
gave you. The rule is about *deriving* state from the local clock, not
about rendering.

### In the UIKit

`useServerTime()` gives you the same authority inside components:

```tsx
import { useServerTime } from 'kaafil-react-uikit/core';

export function Clock() {
  const serverTime = useServerTime();
  return <span>{String(serverTime)}</span>;
}
```

Kit components already use it. You only need this hook when you are
computing something time-dependent yourself.

## Dates on the wire

Trip dates (`startDate`, `endDate`) are date strings. A trip also carries a
`timezone`, and that is the timezone the trip *operates* in — not the
viewer's, and not the server's.

When you render a departure time, render it in the trip's timezone. A
manager in Delhi looking at a Ladakh trip wants Ladakh's local time; a
desk admin looking at ten trips wants each one in its own. Converting
everything to the viewer's zone is a real bug, not a nicety.

## Testing time

The `test` environment has a controllable clock, so you can test "the day
before departure" without waiting. See the test resource on the server
client and https://developer.kaafil.in/docs/guides/modules/test.
