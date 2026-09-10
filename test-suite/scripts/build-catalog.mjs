#!/usr/bin/env node
/**
 * Generate the SYMBOL CATALOG — the fact base every skill is written against.
 *
 *   node test-suite/scripts/build-catalog.mjs           # write catalogs
 *   node test-suite/scripts/build-catalog.mjs --check    # fail if stale
 *
 * WHY THIS EXISTS AND WHY IT RUNS FIRST. A skill's whole value is that an
 * agent trusts it more than its own guess. That trust is only earned if
 * every symbol a skill names is real. Prose written from memory drifts
 * silently: a prop gets renamed, an export moves subpath, and the skill
 * keeps confidently teaching the old name forever. So the catalog is
 * generated from the PUBLISHED packages' own type declarations, committed,
 * and asserted against in CI.
 *
 * It reads from `test-suite/typecheck/web/node_modules`, which installs
 * exact published versions — deliberately NOT the sibling checkouts. A
 * sibling has unreleased work in it, and a skill that documents an unshipped
 * export is worse than one that documents nothing.
 *
 * Committed output means CI needs no registry access and no sibling repos,
 * and a package upgrade shows up as a reviewable diff in the catalog rather
 * than as a mysterious downstream failure.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const SANDBOX = join(REPO, 'test-suite', 'typecheck', 'web');
const CATALOG_DIR = join(REPO, 'test-suite', 'catalogs');

const require = createRequire(join(SANDBOX, 'noop.js'));
let ts;
try {
  ts = require('typescript');
} catch {
  console.error(
    'typescript not resolvable from the sandbox.\n' +
      'Run:  npm --prefix test-suite/typecheck/web install',
  );
  process.exit(1);
}

/** The five subpaths the UIKit publishes that carry types. `/styles` is CSS. */
const UIKIT_SUBPATHS = ['core', 'manager', 'admin', 'traveller', 'testing'];

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function entryFor(pkg, subpath) {
  const base = join(SANDBOX, 'node_modules', pkg, 'dist');
  const file = subpath === null ? join(base, 'index.d.ts') : join(base, subpath, 'index.d.ts');
  if (!existsSync(file)) fail(`missing declaration file: ${file}`);
  return file;
}

/**
 * Every exported name from one entry point, with its kind.
 *
 * Uses the checker's own export list rather than a regex over the text: a
 * `.d.ts` re-exports through chunk files, so the exports a consumer actually
 * sees are not the ones written literally in that file.
 */
function exportsOf(program, checker, entryFile) {
  const source = program.getSourceFile(entryFile);
  if (!source) fail(`could not load ${entryFile} into the program`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) fail(`${entryFile} is not a module`);

  const out = {};
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    out[symbol.getName()] = kindOf(checker, symbol);
  }
  return out;
}

/**
 * What an export actually IS, which decides whether a fence may write
 * `import { X }` or must write `import type { X }`.
 *
 * The alias hop is load-bearing. A `.d.ts` barrel re-exports everything, so
 * every symbol reaching here carries `SymbolFlags.Alias` and NONE of the
 * interface/type flags — reading flags without resolving first reported all
 * 492 client exports as `value`, which would have taught an agent that
 * `import { OpenManagerSessionOptions }` is legal. It is an interface; that
 * import is erased at runtime and breaks under `isolatedModules`.
 */
function kindOf(checker, symbol) {
  const resolved =
    symbol.getFlags() & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const flags = resolved.getFlags();

  // Ordered by what a caller needs to know first. A class is both a value
  // and a type, and 'class' is the more useful answer.
  if (flags & ts.SymbolFlags.Class) return 'class';
  if (flags & ts.SymbolFlags.Enum) return 'enum';
  if (flags & ts.SymbolFlags.Function) return 'function';
  if (flags & ts.SymbolFlags.Interface) return 'interface';
  if (flags & ts.SymbolFlags.TypeAlias) return 'type';
  if (flags & ts.SymbolFlags.Variable) return 'const';
  return 'value';
}

/**
 * Prop names for one `*Props` interface, split required vs optional.
 *
 * This is the half that catches the most damaging hallucination — an agent
 * inventing a prop that reads plausibly (`persona`, `assignedTrips`) and
 * writing code that silently does nothing.
 */
function propsOf(checker, program, entryFile, typeName) {
  const source = program.getSourceFile(entryFile);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  const symbol = checker
    .getExportsOfModule(moduleSymbol)
    .find((s) => s.getName() === typeName);
  if (!symbol) return null;

  const declared = checker.getDeclaredTypeOfSymbol(
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol,
  );
  const required = [];
  const optional = [];
  for (const prop of checker.getPropertiesOfType(declared)) {
    (prop.getFlags() & ts.SymbolFlags.Optional ? optional : required).push(prop.getName());
  }
  if (required.length === 0 && optional.length === 0) return null;
  return { required: required.sort(), optional: optional.sort() };
}

/**
 * The public methods and properties of one exported class.
 *
 * The two SDK entry points are CLASSES (`Kaafil` server-side,
 * `KaafilClient` in the browser), not a bag of functions — so the export
 * list alone tells a skill author nothing about how you actually open a
 * manager session. Without this, the obvious guess is a free
 * `openManagerSession()` import, which does not exist.
 */
function membersOf(checker, program, entryFile, className) {
  const source = program.getSourceFile(entryFile);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  const symbol = checker.getExportsOfModule(moduleSymbol).find((s) => s.getName() === className);
  if (!symbol) return null;

  const resolved =
    symbol.getFlags() & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  // The INSTANCE type, not the constructor type — `getDeclaredTypeOfSymbol`
  // on a class gives the instance side, which is what callers touch.
  const instance = checker.getDeclaredTypeOfSymbol(resolved);

  const methods = [];
  const namespaces = {};
  for (const member of checker.getPropertiesOfType(instance)) {
    const name = member.getName();
    if (name.startsWith('_') || name.startsWith('#')) continue;
    const type = checker.getTypeOfSymbolAtLocation(member, member.valueDeclaration ?? source);

    if (type.getCallSignatures().length > 0) {
      methods.push(name);
      continue;
    }

    // One level down, because the entry classes are NAMESPACED and the
    // nesting is the whole API. You do not call `openManagerSession()`; you
    // call `client.session.open()`, `client.admin.open()`,
    // `client.share.open()`. An export list cannot show that, and no agent
    // would guess it.
    const inner = checker
      .getPropertiesOfType(type)
      .filter((p) => !p.getName().startsWith('_'))
      .map((p) => p.getName())
      .sort();
    namespaces[name] = inner;
  }
  if (methods.length === 0 && Object.keys(namespaces).length === 0) return null;

  // Statics live on the constructor type, not the instance, so they need
  // their own pass — `KaafilClient.newIdempotencyKey()` is one.
  const statics = checker
    .getPropertiesOfType(checker.getTypeOfSymbolAtLocation(resolved, source))
    .map((p) => p.getName())
    .filter((n) => !['prototype', 'apply', 'call', 'bind', 'length', 'name'].includes(n))
    .sort();

  return { methods: methods.sort(), statics, namespaces };
}

function buildProgram(entryFiles) {
  const program = ts.createProgram(entryFiles, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    noEmit: true,
    skipLibCheck: true, // catalog extraction only; the FENCE check is the strict one
  });
  return { program, checker: program.getTypeChecker() };
}

function version(pkg) {
  return JSON.parse(
    readFileSync(join(SANDBOX, 'node_modules', pkg, 'package.json'), 'utf8'),
  ).version;
}

// ── kaafil-react-uikit ──────────────────────────────────────────────────────
const uikitEntries = UIKIT_SUBPATHS.map((s) => entryFor('kaafil-react-uikit', s));
const uikit = buildProgram(uikitEntries);

const uikitCatalog = {
  package: 'kaafil-react-uikit',
  version: version('kaafil-react-uikit'),
  generatedBy: 'test-suite/scripts/build-catalog.mjs',
  subpaths: {},
  props: {},
};

for (const [i, subpath] of UIKIT_SUBPATHS.entries()) {
  uikitCatalog.subpaths[`kaafil-react-uikit/${subpath}`] = exportsOf(
    uikit.program,
    uikit.checker,
    uikitEntries[i],
  );
}

// Every `*Props` type the kit exports, so a fence setting a prop can be
// checked by name. Collected across subpaths because a surface's props live
// in its own family's entry point.
for (const [i, subpath] of UIKIT_SUBPATHS.entries()) {
  const entry = uikitEntries[i];
  for (const name of Object.keys(uikitCatalog.subpaths[`kaafil-react-uikit/${subpath}`])) {
    if (!name.endsWith('Props')) continue;
    const props = propsOf(uikit.checker, uikit.program, entry, name);
    if (props) uikitCatalog.props[name] = props;
  }
}

// ── kaafil-js ───────────────────────────────────────────────────────────────
const sdkEntries = [entryFor('kaafil-js', null), entryFor('kaafil-js', null)];
const sdkRoot = join(SANDBOX, 'node_modules', 'kaafil-js', 'dist', 'index.d.ts');
const sdkClient = join(SANDBOX, 'node_modules', 'kaafil-js', 'dist', 'client-entry.d.ts');
if (!existsSync(sdkClient)) fail(`missing declaration file: ${sdkClient}`);
const sdk = buildProgram([sdkRoot, sdkClient]);

const sdkCatalog = {
  package: 'kaafil-js',
  version: version('kaafil-js'),
  generatedBy: 'test-suite/scripts/build-catalog.mjs',
  subpaths: {
    'kaafil-js': exportsOf(sdk.program, sdk.checker, sdkRoot),
    'kaafil-js/client': exportsOf(sdk.program, sdk.checker, sdkClient),
  },
  // The two entry classes, spelled out. Everything a consumer does starts
  // on one of these instances.
  classes: {
    Kaafil: membersOf(sdk.checker, sdk.program, sdkRoot, 'Kaafil'),
    KaafilClient: membersOf(sdk.checker, sdk.program, sdkClient, 'KaafilClient'),
  },
};

// ── write or check ──────────────────────────────────────────────────────────
mkdirSync(CATALOG_DIR, { recursive: true });
const targets = [
  [join(CATALOG_DIR, 'kaafil-react-uikit.json'), uikitCatalog],
  [join(CATALOG_DIR, 'kaafil-js.json'), sdkCatalog],
];

const check = process.argv.includes('--check');
let stale = 0;

for (const [file, data] of targets) {
  const next = `${JSON.stringify(data, null, 2)}\n`;
  if (check) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== next) {
      console.error(`  ✗ stale: ${file.replace(`${REPO}/`, '')}`);
      stale += 1;
    } else {
      console.log(`  ✓ ${file.replace(`${REPO}/`, '')}`);
    }
  } else {
    writeFileSync(file, next);
    const counts = Object.entries(data.subpaths)
      .map(([k, v]) => `${k}=${Object.keys(v).length}`)
      .join(' ');
    console.log(`  wrote ${file.replace(`${REPO}/`, '')}  (${counts})`);
  }
}

if (check && stale > 0) {
  console.error(
    '\n  Catalogs are out of date with the installed packages.\n' +
      '  Run: npm run catalog\n',
  );
  process.exit(1);
}
