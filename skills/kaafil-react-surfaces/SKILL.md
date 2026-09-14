---
name: kaafil-react-surfaces
description: The three Kaafil surfaces — KaafilManagerApp, KaafilAgencyWorkspace and KaafilShareView — what each one is, their real required props, and how to pick the one matching your credential. Use for "which component do I mount".
license: "MIT"
compatibility: "React >=18.2 <20; kaafil-react-uikit ^0.9.0"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil react surface component mount manager agency workspace share view persona"
---

> **Ground truth:** the installed `KaafilManagerAppProps`,
> `KaafilAgencyWorkspaceProps` and `KaafilShareViewProps`.
> **Docs:** https://developer.kaafil.in/docs/ui-kit/getting-started/first-surface
> · **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## A surface is the whole product for one persona

One component, the entire entitled experience. Mounting one is the fastest
path to real data on screen, and for most integrations it is also the
finished answer — you do not have to assemble anything.

There is exactly one per family.

| Credential you hold | Mount | Import from |
|---|---|---|
| manager tokens | `KaafilManagerApp` | `kaafil-react-uikit/manager` |
| agency-admin tokens | `KaafilAgencyWorkspace` | `kaafil-react-uikit/admin` |
| a share token | `KaafilShareView` | `kaafil-react-uikit/traveller` |

Mounting the desk surface with a manager token does not produce "a desk
console for a manager" — it produces a tree whose reads that credential
cannot satisfy.

## Desk — `KaafilAgencyWorkspace`

No required props at all.

```tsx
import { KaafilAgencyWorkspace } from 'kaafil-react-uikit/admin';

<KaafilAgencyWorkspace
  initialPane="trips"
  onSelectTrip={(ref) => analytics.track('trip_opened', { ref })}
/>;
```

Seven panes — Trips, Travellers, Managers, Checklists, Forms, Journey,
Settings — each with its own directory-to-detail push, plus the whole trip
workspace behind a trip row.

Useful optional props: `initialPane` / `selectedPane` / `onPaneChange` to
drive the pane from your own router, `onSignOut`, and the
`onOpen*`/`onClose*` pairs if you want detail views to become your own
routes rather than in-place pushes.

## Field — `KaafilManagerApp`

**Four required callbacks.** Each forwards straight to a mounted child's own
required prop *that the surface has no internal handler for*. The surface never
stubs a child's required callback behind a no-op, because that would silently
swallow an action a manager took.

```tsx
import { KaafilManagerApp } from 'kaafil-react-uikit/manager';

<KaafilManagerApp
  // Required — real destinations the surface does not own.
  onCollectFromGroup={(groupId) => router.push(`/collections/new?group=${groupId}`)}
  onVendorSelect={(id) => router.push(`/vendors/${id}`)}
  // Required — COMPLETION hooks. The write has ALREADY happened.
  onLogExpense={() => toast('Expense logged')}
  onCollectPayment={() => toast('Payment recorded')}
  // Optional — the surface navigates itself; this only mirrors it.
  onNavigateModule={(key) => analytics.track('module', { key })}
/>;
```

**`onLogExpense` and `onCollectPayment` do not open anything.** They read like
they gate spending and they do not: the FAB opens the UIKit's own sheet, which
writes through `useExpenses()` / `useCollections()`, and the callback fires
*after* that write succeeds. Routing to a "new expense" form from one of these
gives a manager two forms for one expense.

**`onNavigateModule` is optional.** The surface maps each module key onto a real
tab and performs the navigation itself, so this is an analytics/URL-sync mirror,
not the mechanism. Omitting it costs nothing visible. (Before
`kaafil-react-uikit@0.9.0` it was required; a `() => {}` there was harmless.)

### There is no `assignedTrips` prop

The trip list comes from the manager's own credential-scoped read. A host
cannot pass a different list, because a manager seeing a trip they are not
assigned to is not a UI decision.

If you are reaching for a prop to filter or supply trips, the answer is
the credential, not the component.

Optional props worth knowing: `initialTripRef` and `initialTripTabKey` for
deep links, `activeTab`, and the `onOpen*`/`onClose*` pairs for the sync
centre, notifications, float ledger and traveller sheets.

## Public — `KaafilShareView`

```tsx
import { KaafilShareView } from 'kaafil-react-uikit/traveller';

<KaafilShareView token={token} />;
```

`token` is the only required prop. Note the name — it is `token` here,
while the *provider* prop is `shareToken`.

One component, and that is a decision rather than a shortfall: a share
link is a single published document whose sections the **server** decides.
The surface reads the snapshot and renders what came back.

### Missing sections are not a bug

Sections the traveller is not entitled to are **absent**, not empty —
there is no placeholder, no disabled tab, no hint that they exist. If a
traveller reports a missing money section, the share token's configuration
is the cause. Do not add a prop to force it; see
`kaafil-react-troubleshooting`.

### A dead link renders `Not found.` and nothing else

No heading, no divider, no layout. That blankness is deliberate leak
prevention: anything more would confirm to a stranger that the link was
once real. **Do not improve it.**

## Going below the surface

You do not have to take the whole surface. The families export their
composite sections too — `TripManifestSection`, `TripRoomingSection`,
`ManagerCloseoutSection`, `TravellerDirectoryFlow` and so on — so you can
place one panel inside your own layout.

That is tier 1 of the customization ladder; see
`kaafil-react-components`. Start at the surface and drop down only where
you need to.

## NEVER

- **Never mount a surface outside `KaafilUIKitProvider`.**
- **Never mount two surfaces** from different families in one tree.
- **Never pass a no-op for one of `KaafilManagerApp`'s four required
  callbacks** to "get it compiling". Each represents an action a manager
  actually took; discarding it loses their work silently. Wire it, even if
  only to a placeholder route. (`onNavigateModule` is the exception and is
  optional — the surface handles that navigation itself.)
- **Never route to a form from `onLogExpense` / `onCollectPayment`.** The
  write already happened when they fire.
- **Never try to widen what a surface shows** by prop. Scope comes from
  the credential.
