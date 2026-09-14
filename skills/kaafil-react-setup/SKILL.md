---
name: kaafil-react-setup
description: Installing kaafil-react-uikit and getting the first render — the package and its peers, the seven subpath exports, the opt-in stylesheet, and KaafilUIKitProvider with the credential union and buildShareUrl. Start here for any React integration.
license: "MIT"
compatibility: "React >=18.2 <20; kaafil-react-uikit ^0.9.0; kaafil-js ^0.5.0"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil react uikit install setup provider styles css subpath peer credential buildShareUrl offline"
---

> **Ground truth:** the installed `kaafil-react-uikit` package exports and
> `KaafilUIKitProviderProps`.
> **Docs:** https://developer.kaafil.in/docs/ui-kit/getting-started/installation
> · **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`
> Verify symbols against the installed package before relying on them.

## Install

```bash
npm install kaafil-react-uikit kaafil-js
```

`kaafil-js` is a **peer**, not a transitive dependency — install it
explicitly. React and React DOM are peers too (`>=18.2 <20`).

## Seven subpaths, and no bare import

```ts ignore
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';       // hooks + provider
import { KaafilManagerApp } from 'kaafil-react-uikit/manager';       // field family
import { KaafilAgencyWorkspace } from 'kaafil-react-uikit/admin';    // desk family
import { KaafilShareView } from 'kaafil-react-uikit/traveller';      // public family
import { withCachedCredential } from 'kaafil-react-uikit/offline';   // host-side offline
import 'kaafil-react-uikit/styles';                                  // the stylesheet
// 'kaafil-react-uikit/testing' — mock builders and fixtures
```

There is **no `/primitives`** subpath, despite older docs listing one. The
families share no atom layer, on purpose.

**There is no `.` export.** `import { … } from 'kaafil-react-uikit'` fails
to resolve. That is deliberate: the three families are separately
importable so a desk-only app never bundles the field family.

## The stylesheet is opt-in

```ts ignore
import 'kaafil-react-uikit/styles';
```

Import it **exactly once**, in your app entry. Nothing is auto-injected,
and no component imports its own CSS.

This is a real decision, not an oversight: the host controls CSS layer
order. Everything the kit ships lives in `@layer kaafil-ui`, and your own
overrides go in `@layer kaafil-ui-overrides`, so your rules win without
specificity wars.

**If nothing is styled, this import is missing.** It is the single most
common setup mistake.

## The provider

One provider, wrapping whatever subtree uses the kit.

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';
import { KaafilAgencyWorkspace } from 'kaafil-react-uikit/admin';

export function AgencyConsole() {
  return (
    <KaafilUIKitProvider
      environment="test"
      accessToken={accessToken}
      refreshToken={refreshToken}
      agencyRef={agencyRef}
      onSessionExpired={() => router.push('/login')}
    >
      <KaafilAgencyWorkspace onSelectTrip={(ref) => analytics.track('trip_opened', { ref })} />
    </KaafilUIKitProvider>
  );
}
```

### The credential decides the persona

There is **no `persona` prop and no `mode` prop**. The *shape* of the
credential you pass decides which persona the session opens as, and the
type system enforces that you pass exactly one shape.

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';

// Manager OR agency admin — whichever the token was minted for.
<KaafilUIKitProvider accessToken={accessToken} refreshToken={refreshToken} agencyRef={agencyRef}>
  {null}
</KaafilUIKitProvider>;
```

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';

// A traveller, from a share link.
<KaafilUIKitProvider shareToken={token}>{null}</KaafilUIKitProvider>;
```

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';

// Deferred — resolve the credential yourself, lazily.
<KaafilUIKitProvider credentialResolver={async () => mintTokens()}>{null}</KaafilUIKitProvider>;
```

Passing `shareToken` alongside `accessToken` is a **compile error**, not a
runtime precedence question. `usePersona()` is the one legitimate way to
ask which persona you ended up with — never decode the JWT.

### The provider props worth knowing

Every one is optional except the credential.

| Prop | Use |
|---|---|
| `environment` | `'live' \| 'test'` |
| `onSessionExpired` | Rotation failed for good — send them to *your* login |
| `theme` | `'light' \| 'dark' \| 'system'` |
| `density` | `'compact' \| 'default' \| 'comfortable'` |
| `locale` | BCP-47 tag; see `kaafil-react-i18n` |
| `brand` | Logo, app name, favicon — see `kaafil-react-theming` |
| `isolation` | `'scoped'` (default) or `'shadow'` for hard style isolation |
| `onEvent` | Telemetry callback |
| `storage` | Storage adapter — required for offline; see `kaafil-react-offline` |
| `buildShareUrl` | `(token) => string`. **Set it if you use share links** — see below |

### `buildShareUrl` — set it, or operators get a bare UUID

Kaafil returns a share **token**, never a URL: the traveller page is on *your*
domain and the engine has no idea what it is. Without this prop the desk's
share dialog shows an operator something like
`c43df6bd-ec4a-4ea3-aedf-acb3837d3358` where they expected a sendable link.

```tsx ignore
<KaafilUIKitProvider
  buildShareUrl={(token) => `${window.location.origin}/share/${token}`}
  {...credential}
/>
```

The dialog does say so when it is missing — it calls the value a code rather
than a link, and the console carries a development-only warning naming the
prop — but that is a safety net, not the design. Set it during setup.

`brand.headStrategy` defaults to `'none'`, which is a **hard no-op**: the
kit will not touch `document.head` even if you pass a favicon. `'own-page'`
is runtime-rejected for the two staff personas, because they mount inside
your app rather than owning the tab.

## What the provider is doing

It composes nine shells, in this order:

```
ErrorShell → ThemeShell → I18nShell → AppShell → SessionShell
  → OfflineShell → ConfigShell → BrandShell → TelemetryShell → your children
```

You do not normally mount these yourself. Knowing the order helps when you
are debugging *why* something resolved the way it did — session is
established before offline, and config after both.

## NEVER

- **Never import from `kaafil-react-uikit` with no subpath.** It does not
  resolve.
- **Never import a component's CSS.** Components do not ship their own;
  the one stylesheet covers everything.
- **Never pass two credential shapes.**
- **Never add a `persona` or `mode` prop.** They do not exist at any layer.
- **Never nest two providers** for the same subtree.
- **Never put a token in `localStorage` and read it back into the
  provider on load without checking expiry** — prefer
  `credentialResolver`, which is built for exactly that.

## Next

`kaafil-react-surfaces` for what to mount. `kaafil-react-frameworks` if
you are on Next.js or anything with SSR.
