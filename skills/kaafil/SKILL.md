---
name: kaafil
description: Entry point for integrating Kaafil — the engine behind group-travel operations — into any React app or Node backend. Detects the project, works out which of the three personas you are building for, and routes to the right skills. Use for "add Kaafil", "integrate Kaafil", "add the manager app", "add the agency console", "show a traveller their trip", "push a trip into Kaafil".
license: "MIT"
compatibility: "Node.js >=18; kaafil-js ^0.5.0; kaafil-react-uikit ^0.9.0; React >=18.2 <20"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil dispatcher entry react sdk trips travel manager agency traveller share"
---

> **Ground truth:** the installed `kaafil-js` and `kaafil-react-uikit` type
> declarations, plus the symbol catalogs this repo generates from them.
> **Docs:** https://developer.kaafil.in · **Docs MCP:**
> `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`
> Verify every symbol against the installed package before relying on it.

## Use this skill when

The user wants to add Kaafil to a project, or change an existing Kaafil
integration. Trigger phrases:

- `/kaafil`, "add kaafil", "integrate kaafil"
- "add the manager app", "add the agency console", "add the ops console"
- "show a traveller their trip", "add a share link page"
- "push a trip into kaafil", "ingest trips", "sync our CRM with kaafil"
- "the manager's changes vanish offline", "why is this section missing"

**This is the only entry point.** Do NOT invoke `kaafil-react-*`,
`kaafil-js-*` or `kaafil-backend-*` skills directly — this dispatcher
establishes which persona and which half of the stack you are in first, and
routing wrong produces code that cannot work.

## What Kaafil is, in one paragraph

Kaafil runs the operational logic behind a travel business — the on-ground
execution of a trip that has **already been sold**. It is not a booking
engine and not a CRM. Your CRM pushes a confirmed trip in; Kaafil builds
the *journey* that runs it (manifest, rooming, itinerary, pickups,
vehicles, expenses, collections, documents, close-out) and hands three
audiences a surface onto it. It ships under **your** brand — a traveller
never sees the name Kaafil.

## The three personas — get this right before anything else

Everything downstream depends on which one you are building. There are
exactly three, and they are not roles-in-a-dropdown; they are different
credentials, different surfaces, different assumptions.

| Persona | Who | Assumption | Surface |
|---|---|---|---|
| `manager` | Field staff running the trip | Offline-first, phone, poor signal | `KaafilManagerApp` |
| `agencyAdmin` | Desk staff at the agency | Online, desktop, full capability parity with manager | `KaafilAgencyWorkspace` |
| `share` | The traveller | Unauthenticated, link-scoped, read-mostly | `KaafilShareView` |

**The credential's SHAPE decides the persona.** There is no `persona` prop
and no `mode` prop anywhere in the UIKit. See `kaafil-auth`.

## Steps

### 1. Detect the project

Read, do not ask:

```bash
# Frontend or backend? Which framework?
cat package.json 2>/dev/null | head -40
ls next.config.* vite.config.* react-router.config.* 2>/dev/null
```

- `next` present → Next.js. Load `kaafil-react-frameworks` for the App
  Router / `'use client'` rules.
- `vite` + `react` → Vite SPA. The simplest case.
- `react-router` with a `react-router.config.ts` → React Router framework
  mode; same SSR caveats as Next.
- `react` but none of the above → CRA or a custom bundler. Treat as Vite.
- No `react` at all, `express`/`fastify`/`hono` present → this is the
  **backend** half. Go to `kaafil-js-server` and `kaafil-backend-ingest`.

A project can be both. A CRM integration usually needs the backend half
(ingest trips, mint session tokens) *and* the frontend half (mount a
surface). Ask which the user wants first rather than doing both silently.

### 2. Establish the persona

Ask only if the request does not already say. "Add the agency console" is
`agencyAdmin`; "our tour managers need the app on their phones" is
`manager`; "let travellers see their itinerary" is `share`.

### 3. Confirm credentials exist

Every persona except `share` needs tokens your **backend** mints. The API
key that mints them is tenant-wide and must never reach a browser.

If the user has no backend route for this yet, that is the first piece of
work, not an afterthought — route to `kaafil-auth` and `kaafil-js-server`.

### 4. Show the plan before writing

List exactly which files you will create, which you will modify, and which
you will not touch. Wait for approval. Never restructure the host app's
routing, state management or styling to accommodate the kit — it is
designed to mount inside what already exists.

### 5. Route

| The user is doing | Load |
|---|---|
| Anything at all, first | `kaafil-concepts`, `kaafil-auth` |
| Installing / provider / first render | `kaafil-react-setup` |
| Choosing what to mount | `kaafil-react-surfaces` |
| Going below the surface | `kaafil-react-components`, `kaafil-react-hooks` |
| Brand / colours / density / dark | `kaafil-react-theming` |
| Next.js, SSR, `'use client'` | `kaafil-react-frameworks` |
| Offline behaviour, outbox, conflicts | `kaafil-react-offline`, `kaafil-js-offline-sync` |
| Languages, RTL | `kaafil-react-i18n` |
| Something is broken | `kaafil-react-troubleshooting`, `kaafil-errors` |
| Backend: minting tokens, calling the API | `kaafil-js-server`, `kaafil-auth` |
| Backend: pushing trips in | `kaafil-backend-ingest` |
| Backend: reacting to changes | `kaafil-webhooks` |
| Browser SDK without the UIKit | `kaafil-js-browser` |
| Long lists | `kaafil-js-pagination` |
| Retries and duplicate writes | `kaafil-idempotency` |
| Amounts, dates, "now" | `kaafil-money-and-dates` |

## The docs MCP — use it when a skill does not cover something

These skills are deliberately finite. The full documentation — every guide,
every UI Kit page, and all 220 generated API operations — is queryable
directly:

```bash
claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp
```

It exposes three tools:

| Tool | Use it for |
|---|---|
| `list_sections` | Cold start. Lists the sections, and with `section` every page in one, so you pick by reading rather than guessing keywords. |
| `search_docs` | A question in plain words. Grouped by page, narrowable with `section`. |
| `get_doc` | The full markdown of one page, including generated API operations. |

Without MCP support in your agent, the same content is at
`https://developer.kaafil.in` and `https://developer.kaafil.in/llms.txt`.

**Reach for it rather than guessing.** A wrong answer about Kaafil is worse
than a slow one, because most of its rules invert the obvious default.

## Hard rules

These hold across every skill in this set. Each is a real constraint of the
product, and each is something an agent gets wrong by default.

1. **No `persona` prop, no `mode` prop.** Anywhere. The credential shape
   decides. Passing two credential shapes is a compile error, not a
   precedence question.
2. **CSS is opt-in.** `import 'kaafil-react-uikit/styles'` exactly once, in
   the host. Nothing is auto-injected, and no component imports its own CSS.
3. **The UIKit ships no router.** No route definitions, no router
   dependency. Screens take `tripRef` / `token` / `initialTab` as plain
   props; navigation is `on*` callbacks you wire to your own router.
4. **Creating a trip is `upsert`,** `kaafil.trips.upsert(...)`. There is no
   `createTrip`.
5. **Money is an integer count of paise** in a `*Minor` field, with a
   currency alongside. No floats, no decimal strings, no formatted values.
6. **"Now" is `meta.serverTime`,** never the device clock. A field phone's
   clock is not trustworthy and may be hours off.
7. **No hook mints or accepts an idempotency key.** The SDK owns that.
8. **A `423` close-out lock has no override,** at any layer, for any
   persona. Do not add an admin-override control; it does not exist.
9. **Share surfaces fail 404-shaped.** A dead or unentitled share link
   renders "Not found." and nothing else — no heading, no divider, no hint
   that anything was ever there. Do not "improve" this; it is a leak
   prevention measure.
10. **Never put an API key in browser-reachable code.** Not in
    `VITE_`/`NEXT_PUBLIC_` env, not in a client component.

## Error handling

If the user hits an error, branch on `error.code`, never on the HTTP status
alone — see `kaafil-errors`. If a symbol you expected does not exist in the
installed package, say so and check the docs MCP rather than substituting a
plausible-looking alternative.
