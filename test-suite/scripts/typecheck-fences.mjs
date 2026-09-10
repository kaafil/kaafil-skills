#!/usr/bin/env node
/**
 * Typecheck every TypeScript code fence in every SKILL.md against the
 * ACTUALLY PUBLISHED Kaafil packages.
 *
 *   node test-suite/scripts/typecheck-fences.mjs
 *   node test-suite/scripts/typecheck-fences.mjs --only kaafil-auth
 *   node test-suite/scripts/typecheck-fences.mjs --keep    # leave __fences__ for inspection
 *
 * WHY. A skill exists so an agent trusts it over its own guess. The single
 * worst failure mode is therefore a fence that looks right and does not
 * compile — a hallucinated prop, a renamed export, a method that is really
 * a namespaced call. Prose review does not catch those; the compiler does,
 * every time, in under a second.
 *
 * The sandbox at test-suite/typecheck/web installs EXACT published versions
 * and sets `skipLibCheck: false`, so a fence importing a type the shipped
 * `.d.ts` does not export fails here rather than in a user's editor.
 *
 * A fence opts out with `ts ignore` / `tsx ignore` on the opening line,
 * for snippets that are deliberately partial (a bare `<Provider ...>` with
 * no closing tag, an env-var listing). Opting out is a real cost — nothing
 * checks that fence again — so it needs a reason in the surrounding prose.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const SKILLS = join(REPO, 'skills');
const SANDBOX = join(REPO, 'test-suite', 'typecheck', 'web');
const FENCE_DIR = join(SANDBOX, '__fences__');

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const keep = argv.includes('--keep');

if (!existsSync(join(SANDBOX, 'node_modules', 'kaafil-react-uikit'))) {
  console.error(
    '\n  Sandbox dependencies are not installed.\n' +
      '  Run:  npm run sandbox:install\n',
  );
  process.exit(1);
}

/**
 * Pull fenced blocks out of one SKILL.md.
 *
 * Only fences whose opening backticks start at column 0 are collected —
 * an indented fence sits inside a list item or blockquote and is
 * illustrative context, not code we promise compiles.
 */
function fencesOf(markdown) {
  const out = [];
  const re = /^```([a-zA-Z]+)([^\n]*)\n([\s\S]*?)\n^```/gm;
  let match;
  let index = 0;
  while ((match = re.exec(markdown)) !== null) {
    const [, lang, rest, body] = match;
    if (!['ts', 'tsx', 'typescript'].includes(lang)) continue;
    index += 1;
    if (/\bignore\b/.test(rest)) continue;
    const line = markdown.slice(0, match.index).split('\n').length;
    out.push({ index, ext: lang === 'tsx' ? 'tsx' : 'ts', body, line });
  }
  return out;
}

/**
 * Wrap a fence so it compiles as a standalone module.
 *
 * Two adjustments, both because a fence is documentation rather than a
 * file. A bare JSX expression is a statement in an example but not valid
 * at module top level in a .ts file, so tsx fences are wrapped in a
 * component. And every fence needs `export {}` so TypeScript treats it as
 * a module and identically-named consts across fences do not collide.
 */
function wrap({ ext, body }) {
  const isJsxExpression =
    ext === 'tsx' && /^\s*</m.test(body) && !/\b(function|const|class|export)\s/.test(body);

  if (isJsxExpression) {
    const imports = body
      .split('\n')
      .filter((l) => /^\s*import\s/.test(l))
      .join('\n');
    const rest = body
      .split('\n')
      .filter((l) => !/^\s*import\s/.test(l))
      .join('\n')
      // Documentation writes `<Provider>…</Provider>;` as a statement. Inside
      // the `return (…)` below that trailing semicolon is a syntax error, so
      // it is stripped rather than being reported as a defect in the fence.
      .replace(/;\s*$/, '');
    return `${imports}\nexport function __Fence(props: Record<string, any>) {\n  const { children, ...__rest } = props as any;\n  void __rest;\n  return (\n${rest}\n  );\n}\n`;
  }
  return `${body}\nexport {};\n`;
}

// ── collect ─────────────────────────────────────────────────────────────────
rmSync(FENCE_DIR, { recursive: true, force: true });
mkdirSync(FENCE_DIR, { recursive: true });

const written = new Map(); // fence filename -> {skill, line}
let skipped = 0;

const skillDirs = readdirSync(SKILLS).filter((d) => !d.startsWith('.'));
for (const skill of skillDirs) {
  if (only && skill !== only) continue;
  const md = join(SKILLS, skill, 'SKILL.md');
  if (!existsSync(md)) continue;
  const text = readFileSync(md, 'utf8');
  const all = (text.match(/^```(ts|tsx|typescript)/gm) || []).length;
  const fences = fencesOf(text);
  skipped += all - fences.length;

  for (const fence of fences) {
    const name = `${skill}__${fence.index}.${fence.ext}`;
    writeFileSync(join(FENCE_DIR, name), wrap(fence));
    written.set(name, { skill, line: fence.line });
  }
}

if (written.size === 0) {
  console.log('  no TypeScript fences to check');
  process.exit(0);
}

console.log(`  ${written.size} fence(s) from ${skillDirs.length} skill(s); ${skipped} opted out\n`);

// ── typecheck ───────────────────────────────────────────────────────────────
const tsc = spawnSync('node_modules/.bin/tsc', ['--noEmit', '-p', 'tsconfig.json'], {
  cwd: SANDBOX,
  encoding: 'utf8',
});

const output = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`.trim();

if (tsc.status === 0) {
  console.log(`  [32m✓[0m every fence typechecks against the published packages`);
  if (!keep) rmSync(FENCE_DIR, { recursive: true, force: true });
  process.exit(0);
}

// Map each diagnostic back to the skill and the line IN THE SKILL, so a
// failure names the file a human has to edit rather than a temp file.
const bySkill = new Map();
for (const raw of output.split('\n')) {
  const m = raw.match(/^__fences__[/\\]([^(]+)\((\d+),(\d+)\):\s*(.*)$/);
  if (!m) continue;
  const [, file, , , message] = m;
  const meta = written.get(file);
  const key = meta ? meta.skill : file;
  if (!bySkill.has(key)) bySkill.set(key, []);
  bySkill.get(key).push({ message, near: meta?.line });
}

console.log('  [31m✗[0m fences failed to typecheck\n');
for (const [skill, errors] of bySkill) {
  console.log(`  [1mskills/${skill}/SKILL.md[0m`);
  for (const e of errors) {
    console.log(`    ${e.near ? `~line ${e.near}: ` : ''}${e.message}`);
  }
  console.log('');
}

if (bySkill.size === 0 && output) console.log(output);

console.log(`  Fence files kept at ${FENCE_DIR.replace(`${REPO}/`, '')} for inspection.`);
process.exit(1);
