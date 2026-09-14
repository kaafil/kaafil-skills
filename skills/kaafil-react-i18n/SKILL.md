---
name: kaafil-react-i18n
description: Locale and text direction in kaafil-react-uikit — the locale prop, the bundled chrome catalogs, why the host supplies the locale rather than the kit sniffing it, and RTL. Use for "add a language", "translate the UI", "Arabic support".
license: "MIT"
compatibility: "kaafil-react-uikit ^0.9.0"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil react i18n locale language translation rtl direction hindi english"
---

> **Ground truth:** the installed `I18nShellProps` — a single optional
> `locale` string, BCP-47.
> **Docs:** https://developer.kaafil.in/docs/ui-kit/customization/i18n-and-rtl
> · **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## One prop

```tsx
import { KaafilUIKitProvider } from 'kaafil-react-uikit/core';

<KaafilUIKitProvider
  accessToken={accessToken}
  refreshToken={refreshToken}
  agencyRef={agencyRef}
  locale="hi"
>
  {null}
</KaafilUIKitProvider>;
```

BCP-47 tag. Shipped chrome catalogs are **English (`en`)** and
**Hindi (`hi`)**.

## The host supplies the locale — the kit never sniffs it

There is no `Accept-Language` inspection and no read of the traveller's
stored locale preference. That is deliberate: **you** are the one party
that already knows which language this user wants, from your own account
settings, your own URL, or your own locale switcher. A kit that guessed
would fight your answer.

So if the UI is in the wrong language, the cause is the `locale` prop —
not a detection bug.

## No loading state

The catalogs ship inside the package bundle. Switching locale is
synchronous: no fetch, no flash of untranslated text, no suspense
boundary to add. This is also why the kit works fully offline in Hindi on
a manager's phone.

## What is and is not translated

**Translated:** the kit's own chrome — labels, buttons, headings, empty
states, error copy, date and number formatting.

**Not translated:** your data. A trip named "Leh & Nubra — June
departure" renders as you ingested it. Traveller names, vendor names,
itinerary item titles and form questions are content, and Kaafil does not
machine-translate content.

If you need multilingual content, that is your ingest's job — send the
right text for the audience.

## Formatting follows the locale

Dates, numbers and currency format per the active locale.

Two things that do **not** change with locale, because they are data
rather than presentation:

- **Money stays an integer count of paise** on the wire. Only the
  rendered string is localised. See `kaafil-money-and-dates`.
- **A trip's times render in the trip's own timezone**, not the viewer's.
  A Hindi-speaking desk admin in Delhi looking at a Ladakh trip still
  wants Ladakh's local departure time.

## RTL

The stylesheet is written entirely in **logical properties** —
`margin-inline-start`, `padding-block`, `inset-inline-end`,
`border-inline-start`, `text-align: start`. There is no `left`/`right`
anywhere in it.

That means direction flips correctly from the document's `dir`, with no
mirrored stylesheet and no RTL build. Set `dir` on your `<html>` as you
would for any part of your app:

```ts ignore
document.documentElement.dir = 'rtl';
```

**Keep your own overrides logical too.** A single
`margin-left` in your `@layer kaafil-ui-overrides` block is the one thing
that will not flip, and it will look broken in exactly one direction.

## Adding a language

The two bundled catalogs cover the shipped personas. If you need another,
that is a change to the package rather than a host-side configuration —
open an issue rather than trying to inject a catalog at runtime; there is
no prop for it.

## NEVER

- **Never expect the kit to detect the locale.** Pass it.
- **Never use `margin-left` / `right` / `padding-right`** in your
  overrides. Logical properties only.
- **Never translate data client-side** to make the UI look consistent —
  ingest the right content.
- **Never render a trip's time in the viewer's timezone.**
- **Never wrap the provider in a suspense boundary for locale.** There is
  nothing to await.
