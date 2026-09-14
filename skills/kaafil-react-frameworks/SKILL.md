---
name: kaafil-react-frameworks
description: Framework-specific wiring for kaafil-react-uikit — Next.js App Router and Pages Router, Vite, React Router, and the SSR rules. Covers 'use client' boundaries, where the provider goes, env var prefixes, and why the kit ships no router.
license: "MIT"
compatibility: "React >=18.2 <20; Next.js >=14; Vite >=4; kaafil-react-uikit ^0.9.0"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil react nextjs vite react-router ssr use-client hydration router env"
---

> **Ground truth:** the installed `kaafil-react-uikit` — every interactive
> module carries `'use client'`. **Docs:**
> https://developer.kaafil.in/docs/ui-kit/getting-started/frameworks ·
> **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## The kit ships no router

Zero route definitions, zero router dependency. Screens take `tripRef`,
`token` and `initialTab` as plain props; navigation is `on*` callbacks.

This is why it drops into an app that already has routing without a
fight — and why "how do I configure the kit's routes" has no answer. You
wire the callbacks to whatever router you have.

```tsx
import { KaafilAgencyWorkspace } from 'kaafil-react-uikit/admin';

<KaafilAgencyWorkspace
  onSelectTrip={(ref) => router.push(`/trips/${ref}`)}
  onPaneChange={(pane) => router.replace(`/console/${pane}`)}
/>;
```

## Everything interactive is a client component

The kit holds a live session, subscribes to sync events and touches
IndexedDB. None of that runs on a server. Every interactive module already
carries `'use client'`.

What that means for you: **the module where you import and mount the kit
must be a client module.**

## Next.js — App Router

Put the provider in a client component and mount it from a server layout.

```tsx
'use client';

import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';
import type { ReactNode } from 'react';

export function KaafilProvider({ children }: { children: ReactNode }) {
  return (
    <KaafilUIKitProvider
      environment="test"
      accessToken={accessToken}
      refreshToken={refreshToken}
      agencyRef={agencyRef}
      onSessionExpired={() => router.push('/login')}
    >
      {children}
    </KaafilUIKitProvider>
  );
}
```

Then in `app/console/layout.tsx` (a server component), render
`<KaafilProvider>` around the subtree. The stylesheet import goes in the
root layout:

```ts ignore
// app/layout.tsx
import 'kaafil-react-uikit/styles';
```

### Getting the credential in

Mint on the server, pass down as props. The mint route is a route handler
using the **server** entry:

```ts ignore
// app/api/kaafil-session/route.ts  — server only
import { Kaafil } from 'kaafil-js';

const kaafil = new Kaafil({ apiKey: process.env.KAAFIL_API_KEY!, environment: 'test' });
```

`KAAFIL_API_KEY` has **no `NEXT_PUBLIC_` prefix**, and must never get one.
That prefix means "ship this to the browser".

For a lazy fetch instead of prop-drilling, use `credentialResolver`.

### Pages Router

Same rules, less ceremony — everything is already client-side. Provider in
`_app.tsx`, stylesheet imported there too.

## Vite / CRA

The simplest case: no SSR, no boundaries to think about.

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';
import { KaafilAgencyWorkspace } from 'kaafil-react-uikit/admin';
import 'kaafil-react-uikit/styles';

export function App() {
  return (
    <KaafilUIKitProvider
      accessToken={accessToken}
      refreshToken={refreshToken}
      agencyRef={agencyRef}
    >
      <KaafilAgencyWorkspace />
    </KaafilUIKitProvider>
  );
}
```

Env prefix is `VITE_` — and again, **not** for the API key. Vite exposes
every `VITE_*` variable to the browser bundle. The API key belongs to a
backend you deploy separately.

## React Router (framework mode)

If you have a `react-router.config.ts`, you have SSR and the Next.js rules
apply: keep the provider in a client boundary, do not render kit
components during the server pass.

As a library (plain `react-router-dom` in a Vite app), treat it as Vite.

## Astro

Mount the kit inside a React island with `client:only="react"`. The kit
cannot server-render, so `client:load` — which still SSRs the initial
markup — will produce a hydration mismatch.

## Where the provider goes

As **high as the kit is used, and no higher**. One provider around the
subtree that needs Kaafil.

Wrapping your entire application when only `/console` uses the kit means
every page opens a session and holds a sync connection. Do not do that.

## Env var summary

| Framework | Browser prefix | API key |
|---|---|---|
| Next.js | `NEXT_PUBLIC_` | `KAAFIL_API_KEY`, **unprefixed**, server only |
| Vite | `VITE_` | server only, never in the Vite app |
| CRA | `REACT_APP_` | server only |
| Astro | `PUBLIC_` | server only |

The pattern holds everywhere: the API key is never a frontend env var,
under any prefix. What the browser gets is a minted session token.

## NEVER

- **Never render a kit component during SSR.** Client boundary, always.
- **Never prefix the API key** with `NEXT_PUBLIC_` / `VITE_` / `PUBLIC_`.
- **Never call `createIndexedDbStorageAdapter` at module scope.** It needs
  a browser; call it in an effect.
- **Never look for the kit's router config.** There isn't one, by design.
- **Never mount the provider at the app root** if only one section uses
  the kit.
