# kaafil-skills

**Teach your AI coding agent to integrate Kaafil correctly.** Works with
Claude Code, Cursor, Codex, Cline, Kiro, Windsurf, Gemini CLI and Replit
Agent.

[Kaafil](https://developer.kaafil.in) runs the operations of a trip that has
already been sold — manifest, rooming, itinerary, pickups, expenses,
collections, close-out — and ships three surfaces onto it: a field app for
managers, a desk console for agency staff, and a link for travellers.

## Install

```bash
npx kaafil-skills add
```

The installer reads your `package.json`, works out whether you are on the
frontend, the backend or both, and writes the matching skills into your
agent's directory.

```bash
npx kaafil-skills add --ide claude       # write to .claude/skills/
npx kaafil-skills add --ide all          # every supported agent
npx kaafil-skills add --scope backend    # override detection
npx kaafil-skills list                   # see what each scope contains
```

As a Claude Code plugin instead:

```
/plugin marketplace add kaafil/kaafil-skills
```

Then, in your agent:

```
/kaafil add the agency console to my app
```

## Why this exists

Kaafil is unusually hostile to a guessing agent. A lot of its API is the
**opposite** of the obvious default, and a model will confidently get every
one of these wrong:

- there is no `persona` prop and no `mode` prop — the credential's *shape*
  decides, enforced by a discriminated union
- CSS is opt-in (`import 'kaafil-react-uikit/styles'`), never injected
- the UI Kit ships no router; navigation is `on*` callbacks
- creating a trip is `trips.upsert`, not `createTrip`
- `KaafilResponse<T>` is `T & { meta }` — an intersection, so there is no
  `.data`
- share links are `shareTokens.create`, not `.mint`
- there is no free `openManagerSession` import; it is `client.session.open`
- money is an integer count of paise in a `*Minor` field
- "now" is `meta.serverTime`, never the device clock
- no hook mints or accepts an idempotency key
- a `423` close-out lock has no override at any layer
- `KaafilManagerApp` has no `assignedTrips` prop

Documentation answers "what is this?". A skill answers "you are in a Vite
app, here is the provider, and here are the six things not to do."

## What is in it

21 skills. `/kaafil` is the only entry point — it detects the project and
routes to the rest.

| Group | Skills |
|---|---|
| **Entry** | `kaafil` |
| **Cross-cutting** | `kaafil-concepts`, `kaafil-auth`, `kaafil-errors`, `kaafil-money-and-dates`, `kaafil-idempotency` |
| **React UI Kit** | `kaafil-react-setup`, `-surfaces`, `-components`, `-hooks`, `-theming`, `-frameworks`, `-offline`, `-i18n`, `-troubleshooting` |
| **SDK** | `kaafil-js-server`, `kaafil-js-browser`, `kaafil-js-offline-sync`, `kaafil-js-pagination` |
| **Backend** | `kaafil-backend-ingest`, `kaafil-webhooks` |

## The docs MCP

The skills are finite; the documentation is not. All 349 pages — guides, UI
Kit, and 220 generated API operations — are queryable directly:

```bash
claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp
```

Three tools: `list_sections` to orient, `search_docs` to ask in plain words,
`get_doc` to read a page in full. Every skill points at it, so an agent that
hits the edge of a skill asks rather than guesses.

## How these stay correct

A skill is only worth having if an agent can trust it over its own guess.
Three deterministic layers enforce that, all in CI:

```bash
npm run verify          # frontmatter, cross-references, no internal leakage
npm run verify:catalog  # every symbol named in prose exists in the real packages
npm run verify:fences   # every code sample compiles against the PUBLISHED packages
```

`verify:fences` installs the exact published `kaafil-js` and
`kaafil-react-uikit`, extracts every TypeScript sample from every skill, and
compiles them with `skipLibCheck: false`. `verify:catalog` checks the symbols
named in prose and tables, which the compiler never sees.

Both run off `test-suite/catalogs/*.json`, generated from the packages' own
type declarations:

```bash
npm run sandbox:install && npm run catalog
```

The catalogs are committed, so a package upgrade shows up as a reviewable
diff rather than a mysterious downstream failure.

This is not theoretical. The harness caught five errors in the first skill
written against it, including `.data` on a response type that has no `.data`
and a `shareTokens.mint` that is really `.create`.

There is also an end-to-end evaluation that drives a real agent against a
fresh app and builds the result — `npm run test:eval`. It needs an API key,
so it is opt-in.

## Contributing

Add a skill as `skills/<name>/SKILL.md` with `name` matching the directory,
a `description` an agent can route on, a **Ground truth** line, and a
**NEVER** block for the rules that invert the default. Register it in
`bin/install.js` — `npm run verify` fails if you forget.

Then run all three layers. A skill that names a symbol which does not exist
is worse than no skill at all.

## Licence

MIT
