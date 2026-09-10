---
name: kaafil-react-theming
description: Restyling the Kaafil UIKit to match a host brand — the --kf-* token system and its three tiers, the @layer contract, light/dark and density, per-instance overrides via the style prop, and the brand props. Use for "make it match our brand", "change the colours", "dark mode".
license: "MIT"
compatibility: "kaafil-react-uikit ^0.1.0-beta.1"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil react theming tokens css brand colours dark mode density style override layer"
---

> **Ground truth:** the shipped `kaafil-react-uikit/styles` stylesheet —
> 2,822 `--kf-*` custom properties, two `@layer`s, and the
> `[data-kf-theme]` / `[data-kf-density]` / `[data-kf-family]` selectors.
> **Docs:** https://developer.kaafil.in/docs/ui-kit/customization/theming
> · **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## The contract

Class names and custom properties are a **published API**. They are
unhashed, BEM-shaped, and `.kf-`/`--kf-`-prefixed precisely so you can
target them. Restyling by overriding tokens is supported and expected — it
is not reaching into internals.

## Three tiers of token

```
--kf-color-accent-600          tier 1  raw palette
--kf-accent                    tier 2  semantic role
--kf-admin-money-accent        tier 3  one component's use of that role
```

**Override at the highest tier that does the job.** Setting
`--kf-accent` recolours everything that means "accent". Setting
`--kf-admin-money-accent` recolours one panel. Reaching for tier 3 when
tier 2 would do means every new component you adopt needs another
override.

## The `@layer` contract

Everything the kit ships is inside `@layer kaafil-ui`. Your overrides
belong in `@layer kaafil-ui-overrides`:

```css
@layer kaafil-ui-overrides {
  :root {
    --kf-accent: #0f766e;
    --kf-accent-hover: #115e59;
    --kf-accent-contrast: #ffffff;
    --kf-accent-soft: #ccfbf1;
  }
}
```

Because `kaafil-ui-overrides` is declared after `kaafil-ui`, your rules
win **without** specificity escalation. No `!important`, no
`html body .kf-thing` chains.

Declare the layer order yourself if your app has its own layers:

```css
@layer kaafil-ui, kaafil-ui-overrides, app;
```

## Light, dark and density

Both are provider props, and the kit stamps `data-kf-theme` /
`data-kf-density` for its CSS to key off.

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';

<KaafilUIKitProvider
  accessToken={accessToken}
  refreshToken={refreshToken}
  agencyRef={agencyRef}
  theme="system"
  density="compact"
>
  {null}
</KaafilUIKitProvider>;
```

`theme` is `'light' | 'dark' | 'system'`. `density` is
`'compact' | 'default' | 'comfortable'`.

Dark mode is a **complete second palette**, not a filter. When you
override a colour, override its dark counterpart too or your brand colour
will be the one thing that does not adapt:

```css
@layer kaafil-ui-overrides {
  :root { --kf-accent: #0f766e; }
  [data-kf-theme='dark'] { --kf-accent: #2dd4bf; }
}
```

Density is a **token**, not a per-family fork. Do not fork a component to
make it tighter; set the density.

## Per-instance overrides — the `style` prop

Every component takes `style`, typed as `KaafilTokenOverrides`. It accepts
`--kf-*` custom properties, so you can restyle one mounted instance
without a stylesheet at all:

```tsx
import { KaafilAgencyWorkspace } from 'kaafil-react-uikit/admin';

<KaafilAgencyWorkspace style={{ '--kf-accent': '#7c3aed' }} />;
```

Use this for genuinely local variation — one panel in a different accent
because it sits on a coloured background. For a whole-app brand, use the
stylesheet: a `style` prop repeated across twenty mounts is a stylesheet
written badly.

## Brand assets

Logo and app name are props, not CSS:

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';

<KaafilUIKitProvider
  accessToken={accessToken}
  refreshToken={refreshToken}
  agencyRef={agencyRef}
  brand={{ appName: 'Northbound Ops' }}
>
  {null}
</KaafilUIKitProvider>;
```

`brand.headStrategy` defaults to `'none'`, and that is a **hard no-op** —
the kit mutates nothing in `document.head` even if you pass a favicon,
because it is mounted inside *your* page and the tab is yours.
`'own-page'` is runtime-rejected for the manager and agencyAdmin personas
for the same reason.

## Hard isolation

`isolation="shadow"` renders the kit into a shadow root, so no host
stylesheet can reach in and nothing the kit ships can leak out. Use it
when embedding into a page whose CSS you do not control — a legacy CRM
with aggressive global resets is the classic case.

The cost: your `@layer kaafil-ui-overrides` rules do not cross the shadow
boundary either. Theme through the `style` prop and provider props
instead.

## Finding the token you need

There are 2,822. Do not guess a name — inspect the element in devtools and
read the custom property it resolves. The naming is predictable
(`--kf-<family>-<component>-<role>`), but "predictable" is not "guessable"
at that scale.

## NEVER

- **Never use `!important`.** If a rule is not winning, it is in the wrong
  layer.
- **Never target a hashed class.** There are none — if you think you found
  one, you are looking at your own build output.
- **Never hardcode a hex where a token exists.** Dark mode is what breaks.
- **Never fork a component for density or colour.** Both are tokens.
- **Never override a tier-3 token** when the tier-2 role above it would
  do.
- **Never expect `headStrategy: 'none'` to "just set the favicon".** It
  does nothing, deliberately.
