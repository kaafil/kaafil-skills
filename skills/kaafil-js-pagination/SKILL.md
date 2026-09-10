---
name: kaafil-js-pagination
description: Reading long lists from Kaafil — cursor pages versus delta reads with ?since=, why most trip lists are not paginated at all, the KaafilPaginator, and the usePaginatedList hook. Use for "page through", "load more", "too many results".
license: "MIT"
compatibility: "kaafil-js ^0.1.0-beta.7; kaafil-react-uikit ^0.1.0-beta.1"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil pagination cursor page delta since paginator list loadmore"
---

> **Ground truth:** the installed `KaafilPaginator`, `PagedResponseMeta`,
> `CursorPageMeta`, and the `*Page` method variants on list resources.
> **Docs:** https://developer.kaafil.in/docs/guides/pagination ·
> **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## Three list shapes, not one

Most APIs paginate everything. Kaafil does not, and knowing which shape
you are in saves you building the wrong loop.

| Shape | Where | How you read it |
|---|---|---|
| **Whole-trip aggregate** | Most trip lists | One call. No pagination at all. |
| **Cursor pages** | Agency-wide directories | `listPage` + an opaque cursor |
| **Delta reads** | Sync lanes | `?since=` a cursor, get what changed |

### Whole-trip aggregates are not paginated

A trip's manifest, rooming board, itinerary and pickup stops come back
whole. That is deliberate: a trip has tens or low hundreds of travellers,
a manager needs all of them offline, and paginating would make the
offline snapshot incoherent.

**Do not build a "load more" for these.** There is no next page.

### Cursor pages

Agency-wide directories genuinely can be large — every traveller the
agency has ever carried — so those paginate. The pattern is a `list`
method for the simple case and a `listPage` variant for explicit control.

The cursor is **opaque**. Do not parse it, do not construct one, do not
persist it as a bookmark across deployments.

## The paginator

For the common "keep loading as the user scrolls" case, the SDK ships a
paginator so you do not hand-roll cursor bookkeeping:

```ts ignore
const paginator = /* a resource's paginator */;

paginator.items;      // everything fetched so far, across pages
paginator.hasNext;    // true until a first fetch proves otherwise
paginator.isLoading;
paginator.lastError;  // typed error from the last failed fetch
paginator.meta;       // the last page's envelope meta, or undefined
```

Two behaviours worth knowing because they surprise people:

- **`hasNext` is `true` before the first fetch.** It reflects the last
  page's `meta.page.hasNext`, and there is no last page yet. Do not read
  it as "there is definitely more".
- **`setFilters` clears `lastError`** and restarts the sequence. Changing
  filters is a new query, not a continuation.

## In React

```ts ignore
import { usePaginatedList } from 'kaafil-react-uikit/core';
```

Same semantics, wired to render. The kit's directory components already
use it — `TravellerDirectoryFlow` and friends handle scrolling, loading
and empty states, so reach for the hook only for custom UI.

## Delta reads — a different thing entirely

`?since=<cursor>` reads are **not** pagination. They answer "what changed
since I last looked", including deletions as tombstones. They exist for
sync, not for scrolling.

Do not use a delta cursor to page through a list: you would get changes,
not the list. See `kaafil-js-offline-sync`.

## `meta.page`

On a paginated response, `meta.page` is guaranteed
(`PagedResponseMeta`). On a non-paginated one it is absent. That is your
runtime signal for which shape you are holding.

## NEVER

- **Never paginate a whole-trip aggregate.** There is no next page.
- **Never parse or construct a cursor.** Opaque means opaque.
- **Never persist a cursor long-term** as a resumable bookmark.
- **Never use a delta cursor for scrolling.**
- **Never treat `hasNext === true` before the first fetch as evidence of
  more data.**
- **Never loop `listPage` without a stop condition** on `hasNext` — an
  exhausted paginator throws `KaafilPaginationExhaustedError`, and
  overlapping calls throw `KaafilPaginationInFlightError`.
