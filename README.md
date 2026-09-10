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

### The end-to-end eval, and what it actually showed

`npm run test:eval` drives a real agent against a fresh Vite app across five
cases — mount the console, the offline-first field app, a traveller share
page, an empty-state component, and a request to build something that
should be refused — then typechecks the result and greps it for
NEVER-rule violations.

```bash
npm run test:eval                    # all five, with skills installed
bash test-suite/scripts/run-eval.sh --baseline   # the control: no skills
```

**Both arms currently score 5/5.** That is worth stating plainly rather
than hiding: on these five tasks, a strong model with the packages
installed did not need the skills to get them right. The reason is that
`kaafil-js` and `kaafil-react-uikit` ship unusually rich TSDoc — the
storage adapter's own docs say to scope it per person and that it fails at
open rather than at write — and a capable agent reads the installed types.

So the honest claim is narrower than "these skills make integrations
work":

- They are **verified accurate**, which is not free — the harness caught
  eight real errors while they were being written, including `.data` on a
  response type that has none and a `shareTokens.mint` that is really
  `.create`.
- They **route**, and they point every agent at the docs MCP, which
  matters most for the long tail these five cases do not cover.
- The `--baseline` arm exists precisely so this stays measurable. If a
  future model regresses, or a smaller one is used, the gap will show up
  here instead of in someone's production integration.

Keep the control in the loop when adding cases. A suite that only ever
runs the treatment arm cannot tell "our skills are good" from "the model
already knew".

## Contributing

Add a skill as `skills/<name>/SKILL.md` with `name` matching the directory,
a `description` an agent can route on, a **Ground truth** line, and a
**NEVER** block for the rules that invert the default. Register it in
`bin/install.js` — `npm run verify` fails if you forget.

Then run all three layers. A skill that names a symbol which does not exist
is worse than no skill at all.

## Licence

MIT
