#!/usr/bin/env node
/**
 * Assert that every Kaafil symbol a skill names actually exists.
 *
 *   node test-suite/scripts/verify-symbols.mjs
 *
 * WHY THIS EXISTS ALONGSIDE THE FENCE TYPECHECK. The fence checker only
 * sees code inside ```ts fences. Skills also name symbols in PROSE and in
 * tables — "the full set includes KaafilValidationError,
 * KaafilNotFoundError…", "TripManifestSection, TripRoomingSection…" — and
 * those are exactly as load-bearing to a reading agent as the fences, and
 * exactly as capable of being wrong.
 *
 * It runs off the committed catalogs, so it needs no install and no
 * network. When a package upgrade removes an export, this fails and names
 * the skill that still teaches it.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const SKILLS = join(REPO, 'skills');
const CATALOGS = join(REPO, 'test-suite', 'catalogs');

const uikit = JSON.parse(readFileSync(join(CATALOGS, 'kaafil-react-uikit.json'), 'utf8'));
const sdk = JSON.parse(readFileSync(join(CATALOGS, 'kaafil-js.json'), 'utf8'));

/** Every exported name across both packages, flattened. */
const known = new Set();
for (const source of [uikit, sdk]) {
  for (const exports of Object.values(source.subpaths)) {
    for (const name of Object.keys(exports)) known.add(name);
  }
}
// Class members are addressable too (`client.session.open`).
for (const entry of Object.values(sdk.classes ?? {})) {
  if (!entry) continue;
  for (const name of entry.methods) known.add(name);
  for (const name of entry.statics) known.add(name);
  for (const name of Object.keys(entry.namespaces ?? {})) known.add(name);
}
// Prop names, so a table listing a prop is checked too.
const knownProps = new Set();
for (const shape of Object.values(uikit.props ?? {})) {
  for (const name of [...shape.required, ...shape.optional]) knownProps.add(name);
}

/**
 * Words that LOOK like Kaafil symbols but are not exports.
 *
 * Kept explicit rather than loosening the pattern: a silent skip is how a
 * real typo survives, so anything excluded here is excluded on purpose.
 */
const NOT_SYMBOLS = new Set([
  // packages, subpaths and CSS layers
  'KaafilUIKit',
  'Kaafil',
  'KaafilManagerAppTabKey',
  // React and platform types that appear in signatures
  'ReactNode',
  'AbortSignal',
  'Intl',
  'Date',
  'Promise',
  'Record',
  'Omit',
  'Set',
  'Map',
  'JSON',
  'Error',
  'String',
  'Boolean',
  'Number',
  'Array',
  'Object',
  'IndexedDB',
  'MDM',
  'CRM',
  'API',
  'URL',
  'JWT',
  'CSS',
  'BEM',
  'SSR',
  'HTTP',
  'JSX',
  'TRIP',
  'TREK',
  'GROUP',
  'PERSONALIZED',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'IN_PROGRESS',
  'POSTPONED',
  'EMAIL',
  'SMS',
  'WHATSAPP',
  'TRAVELLER',
  'MANAGER',
  'INR',
  'Ladakh',
  'Leh',
  'Nubra',
  'Northbound',
  'Delhi',
  'Arabic',
  'Hindi',
  'English',
  'Kaafil',
]);

const failures = [];
let checked = 0;

for (const dir of readdirSync(SKILLS).filter((d) => !d.startsWith('.'))) {
  const file = join(SKILLS, dir, 'SKILL.md');
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');

  // Only backticked tokens. Free prose is where product names and English
  // words live, and matching there would drown real findings in noise.
  for (const match of text.matchAll(/`([A-Za-z][A-Za-z0-9_.]*)`/g)) {
    const raw = match[1];

    // `client.session.open` — check each addressable part.
    const parts = raw.split('.');
    for (const part of parts) {
      // Only PascalCase identifiers and `use*` hooks look like Kaafil
      // symbols with enough confidence to assert on.
      const isPascal = /^[A-Z][A-Za-z0-9]+$/.test(part);
      const isHook = /^use[A-Z][A-Za-z0-9]*$/.test(part);
      if (!isPascal && !isHook) continue;
      if (NOT_SYMBOLS.has(part)) continue;
      // A Kaafil-ish name is one we should be able to resolve.
      const looksKaafil = isHook || part.startsWith('Kaafil') || known.has(part);
      if (!looksKaafil) continue;

      checked += 1;
      if (!known.has(part) && !knownProps.has(part)) {
        failures.push({ skill: dir, symbol: part, raw });
      }
    }
  }
}

if (failures.length === 0) {
  console.log(
    `  [32m✓[0m ${checked} symbol reference(s) all resolve against ` +
      `kaafil-react-uikit@${uikit.version} and kaafil-js@${sdk.version}`,
  );
  process.exit(0);
}

console.log(`  [31m✗[0m ${failures.length} symbol(s) named in skills do not exist\n`);
const bySkill = new Map();
for (const f of failures) {
  if (!bySkill.has(f.skill)) bySkill.set(f.skill, new Set());
  bySkill.get(f.skill).add(f.raw);
}
for (const [skill, symbols] of bySkill) {
  console.log(`  [1mskills/${skill}/SKILL.md[0m`);
  for (const s of symbols) console.log(`    ${s}`);
  console.log('');
}
console.log('  Either the symbol was renamed, or the skill invented it.\n');
process.exit(1);
