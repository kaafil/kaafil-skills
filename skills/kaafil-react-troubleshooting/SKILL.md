---
name: kaafil-react-troubleshooting
description: Diagnosing a broken Kaafil React integration — nothing is styled, the list is empty, a share section is missing, writes vanish, a 403 on every read, hydration errors, the module has no exports. Symptom-first, with the real cause for each.
license: "MIT"
compatibility: "kaafil-react-uikit ^0.9.0; kaafil-js ^0.5.0"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil react troubleshooting debug broken empty missing styles 403 hydration error fix"
---

> **Ground truth:** the installed packages' types and the shipped
> stylesheet. **Docs MCP:**
> `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`
> — reach for it when a symptom is not listed here.

Symptom first. Each cause below is a real one, not a guess.

## Everything renders unstyled

**Cause:** the stylesheet was never imported. CSS is opt-in and nothing is
auto-injected.

```ts ignore
import 'kaafil-react-uikit/styles';
```

Once, in your app entry. If it *is* imported and still unstyled, check
that your bundler is not tree-shaking a side-effect-only import — mark the
package as having side effects, or import it from a module that is
definitely evaluated.

## `Cannot find module 'kaafil-react-uikit'`

**Cause:** there is no bare `.` export. Import from a subpath:
`/core`, `/manager`, `/admin`, `/traveller`, `/styles`, `/testing`.

## A list is empty and you expected rows

**Cause, most likely:** you are reading the snapshot lane and checking the
wrong thing.

A failed read still returns normally with `rows: []`. There is no error
status. The disambiguator is `syncedAt`:

- `syncedAt === undefined` → never synced on this device. **Unknown**, not
  empty.
- `syncedAt` set, `rows: []` → genuinely empty.

Rendering "No travellers" in the first case is a lie. Branch on
`syncedAt`. See `kaafil-react-offline`.

**Second possibility:** the capability is off for that agency, so the data
is absent rather than empty. Check `useCapabilities()`.

## A traveller says a section is missing from their link

**Not a UI bug.** The **server** decides which sections a share token
exposes, and sections the traveller is not entitled to are absent — no
placeholder, no disabled tab, no hint.

Fix it where it is decided: the share token's configuration when you
called `kaafil.shareTokens.create(...)`. There is no component prop that
forces a section to appear, and adding one would defeat the model.

## A share link shows only `Not found.`

**Working as intended** if the link is dead, revoked or expired. The
404-shaped response — no heading, no divider, no layout — exists so a
stranger cannot tell a dead link from one that never existed.

If the link *should* be live: check expiry, check it was not revoked, and
check you are in the right environment (a `test` token against `live` is
simply not found).

## A manager's writes vanish when the tab closes

**Cause:** no `storage` adapter on the provider, so the outbox is
in-memory only.

This is the highest-severity Kaafil bug because it passes every
development test and only shows up in the field. See
`kaafil-react-offline` for the wiring.

## `403` on every read

**Cause:** the surface does not match the credential. A manager token
mounted under `KaafilAgencyWorkspace` produces a tree whose reads that
credential cannot satisfy.

Check `usePersona()` and mount the matching surface. Do not try to widen
the credential.

## `401` immediately, or a session that never opens

Check, in order:

1. **Environment mismatch** — tokens minted with a `test` API key used
   against `environment="live"`. `ApiKeyEnvironmentMismatchError` on the
   server side names this directly.
2. **Missing `agencyRef`** — required alongside the token pair for both
   staff personas.
3. **A reused token** — the `refreshToken` is shown once at mint. If you
   logged it and re-sent an old one, it is spent.

## Hydration mismatch / `useX is not a function` on Next.js

**Cause:** a kit component rendered on the server. Everything interactive
is a client component.

Add `'use client'` to the module that imports the kit, and keep the
provider in a client boundary. See `kaafil-react-frameworks`.

## `window is not defined` during build

Same cause. Also check you are not calling
`createIndexedDbStorageAdapter` at module scope — it must run in an
effect, in the browser.

## Two people on one device see each other's queued writes

**Cause:** a shared `offlineScope` / storage scope. Scope per manager:

```ts ignore
await createIndexedDbStorageAdapter({ scope: managerId });
```

## `KaafilIndexedDbUnavailableError`

The device cannot open a durable store — private browsing, a locked-down
MDM profile, blocked site data. It fails at **open**, deliberately, so you
can tell the user up front rather than losing their work later.

Catch it and tell them this device cannot work offline. Do not fall back
silently to in-memory storage.

## A number in a ledger is off by a rupee

**Cause:** float arithmetic on money. Every amount is an **integer count
of paise** in a `*Minor` field. Sum in minor units; divide once, at
render. See `kaafil-money-and-dates`.

## A time-based rule fires at the wrong moment

**Cause:** `Date.now()` on a field device. Its clock is not trustworthy.
Use `useServerTime()`.

## A write was refused with `423`

The trip is closed out. This is final — there is no override endpoint, no
force flag, and no credential that bypasses it. Do not build an
admin-override control; see `kaafil-errors`.

## A component looks right but an action does nothing

**Cause:** a required `on*` callback stubbed with a no-op to satisfy the
type checker. `KaafilManagerApp`'s five required callbacks each forward to
a child's own required prop; a no-op silently swallows an action a manager
took. Wire them.

## Styles from the host app bleed into the kit

Use `isolation="shadow"` on the provider. Note that your
`@layer kaafil-ui-overrides` rules will not cross the shadow boundary
either — theme through the `style` prop instead. See
`kaafil-react-theming`.

## Still stuck

Ask the docs MCP before guessing:

```bash
claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp
```

`search_docs` with the symptom in plain words, then `get_doc` on what it
returns. A confident wrong fix costs more than a slow correct one.
