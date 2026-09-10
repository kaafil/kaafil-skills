---
name: kaafil-react-components
description: The kaafil-react-uikit component catalog and the customization ladder — the 28 manager components, 36 admin components, the shells and system screens, and how to choose between mounting a surface, a composite section, or building on hooks.
license: "MIT"
compatibility: "React >=18.2 <20; kaafil-react-uikit ^0.1.0-beta.1"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil react components catalog composite section shell ladder customization slots"
---

> **Ground truth:** the installed family barrels — 28 exported components
> on `/manager`, 36 on `/admin`, 3 on `/traveller`.
> **Docs:** https://developer.kaafil.in/docs/ui-kit/components ·
> **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## The customization ladder

Four rungs. **Start at the top and go down only as far as you must** —
every rung down is more of the product you own and maintain.

| Tier | What | You give up |
|---|---|---|
| 0 · Surface | The whole product for one persona | Nothing |
| 1 · Composite | One panel, placed in your layout | The surrounding chrome and navigation |
| 2 · Slots | A composite with pieces of yours swapped in | Only the pieces you replaced |
| 3 · Hooks | Your own UI on Kaafil data | Every state: loading, empty, error, offline, capability-dark, stale |

The jump from tier 2 to tier 3 is much larger than it looks. A composite
handles six states you would otherwise have to build and keep correct.

## Tier 0 — surfaces

`KaafilManagerApp`, `KaafilAgencyWorkspace`, `KaafilShareView`. One per
family. See `kaafil-react-surfaces`.

## Tier 1 — composites

Mount one panel inside your own page.

```tsx
import { TripManifestSection } from 'kaafil-react-uikit/admin';

export function ManifestPanel({ tripRef }: { tripRef: string }) {
  return <TripManifestSection tripRef={tripRef} />;
}
```

### Desk — `kaafil-react-uikit/admin`

**Trip panels** (all take `tripRef`): `TripManifestSection`,
`TripRoomingSection`, `TripItinerarySection`, `TripPickupsSection`,
`TripVehiclesSection`, `TripExpensesSection`, `TripPaymentsSection`,
`TripDocumentsSection`, `TripBookingsSection`, `TripChecklistSection`,
`TripFormsSection`, `TripFloatSection`, `TripSuppliersSection`, and
`TripWorkspace` which composes them.

**Agency-wide flows:** `TravellerDirectoryFlow`, `ManagerDirectoryFlow`,
`TripDirectoryFlow`, `FormsAuthoringFlow`, `FormsLibrary`, `FormBuilder`,
`ChecklistTemplateLibrary`, `ChecklistTemplateEditor`,
`TemplateAuthoringFlow`, `TriggerTemplateEditor`, `AgencySettingsScreen`,
`TravellerProfileSection`, `ManagerProfileSection`, `TravellerSearchBox`.

### Field — `kaafil-react-uikit/manager`

`ManagerNowSection`, `ManagerTripSection`, `ManagerMeSection`,
`ManagerManifestSection`, `ManagerRoomingSection`,
`ManagerItinerarySection`, `ManagerPickupsSection`,
`ManagerVehiclesSection`, `ManagerRosterSection`, `ManagerMoneySection`,
`ManagerFloatLedgerSection`, `ManagerDocumentsSection`,
`ManagerFormsSection`, `ManagerChecklistSection`,
`ManagerCloseoutSection`, `ManagerVendorsSection`,
`ManagerNotificationsSection`, `ManagerSyncCenterSection`,
`ManagerTravellerProfileSection`, `ManagerOverviewSection`,
`ManagerFab`.

### Public — `kaafil-react-uikit/traveller`

`KaafilShareView` only. That is deliberate: a share link is one published
document, not an assembly of panels.

## Shells and system screens

`AdminShell` and `ManagerShell` are the chrome — header, breadcrumbs,
navigation frame. Mount one yourself only when composing a custom surface
out of composites; the surfaces already include theirs.

System screens are exported so you can render them in your own error
boundaries and route guards: `NotFoundScreen`, `BootErrorScreen`,
`SessionExpiredScreen`, `LockedTripScreen`, `OfflineFallbackScreen`,
`PlanLockedScreen`.

## Tier 2 — slots

Surfaces and several composites take a `components` prop for swapping in
your own piece — a custom row renderer, a custom empty state — while the
composite keeps owning data, states and behaviour.

Prefer a slot over dropping to hooks. You keep the six states and replace
only the markup you actually care about.

## Every component takes `style`

It accepts `--kf-*` custom properties for per-instance theming. The type
itself is internal and not exported. See `kaafil-react-theming`.

## A component lives in exactly one family

Decided at authoring time by directory, never at runtime. There is no
`TripManifestSection` on `/manager` and no `ManagerManifestSection` on
`/admin` — the field and desk versions of a concept are genuinely
different components with different affordances, because a phone at a bus
door and a desk with a keyboard are different problems.

If you find yourself importing across families to get "the other version",
you are fighting the model.

## Capability-dark components

A component whose capability the agency has not enabled renders its own
dark treatment — usually nothing at all. You do not need to gate it
yourself, and gating with `useCapabilities` *and* letting the component
gate produces a double check that drifts.

Set `defaultCapabilityViews` on the provider if you want a house style for
the dark state.

## NEVER

- **Never import a component's CSS.** There is one stylesheet.
- **Never drop to hooks to change appearance.** That is what tokens and
  slots are for.
- **Never mix families in one tree.**
- **Never rebuild a composite that exists** because a prop is missing —
  check for a slot first, then ask the docs MCP.
- **Never assume a `Manager*` and a `Trip*` component are the same
  component with a flag.** They are not.
