#!/usr/bin/env node
/**
 * Install the Kaafil skills into whichever AI coding agent you use.
 *
 *   npx kaafil-skills add                  # detect the project, pick a target
 *   npx kaafil-skills add --ide claude     # write straight to .claude/skills/
 *   npx kaafil-skills add --ide all        # every supported agent
 *   npx kaafil-skills add --scope frontend # only the React skills (+ shared)
 *   npx kaafil-skills list                 # show what would be installed
 *
 * WHY A SCOPE RATHER THAN EVERYTHING. A backend service integrating Kaafil
 * has no use for nine React skills, and every skill an agent loads competes
 * for its attention. Detection picks a scope from the project; `--scope`
 * overrides it.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(HERE, '..', 'skills');
const CWD = process.cwd();

/**
 * Where each agent reads project-local skills from.
 *
 * These are directories of skill folders, which is the shape every agent
 * in this list supports. Agents that instead want one concatenated
 * instructions file are deliberately absent rather than half-supported —
 * flattening 21 skills into one file produces something no agent can route
 * through, and it would silently be worse than not installing at all.
 */
const IDES = {
  claude: '.claude/skills',
  cursor: '.cursor/skills',
  codex: '.codex/skills',
  cline: '.clinerules/skills',
  kiro: '.kiro/skills',
  windsurf: '.windsurf/skills',
  replit: '.agents/skills',
  gemini: '.gemini/skills',
};

/** Skills every project needs, whichever half of the stack it is. */
const SHARED = ['kaafil', 'kaafil-concepts', 'kaafil-auth', 'kaafil-errors', 'kaafil-money-and-dates', 'kaafil-idempotency'];

const FRONTEND = [
  'kaafil-react-setup',
  'kaafil-react-surfaces',
  'kaafil-react-components',
  'kaafil-react-hooks',
  'kaafil-react-theming',
  'kaafil-react-frameworks',
  'kaafil-react-offline',
  'kaafil-react-i18n',
  'kaafil-react-troubleshooting',
  'kaafil-js-browser',
  'kaafil-js-offline-sync',
  'kaafil-js-pagination',
];

const BACKEND = ['kaafil-js-server', 'kaafil-backend-ingest', 'kaafil-webhooks', 'kaafil-js-pagination'];

const SCOPES = {
  all: [...new Set([...SHARED, ...FRONTEND, ...BACKEND])],
  frontend: [...new Set([...SHARED, ...FRONTEND])],
  backend: [...new Set([...SHARED, ...BACKEND])],
  shared: SHARED,
};

const c = {
  bold: (s) => `[1m${s}[0m`,
  dim: (s) => `[90m${s}[0m`,
  green: (s) => `[32m${s}[0m`,
  red: (s) => `[31m${s}[0m`,
};

function readPackageJson() {
  const file = join(CWD, 'package.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Guess the scope from what is actually in the project.
 *
 * A project can genuinely be both — a Next.js app that also mints sessions
 * in a route handler — so "both" resolves to `all` rather than forcing a
 * choice the project has not made.
 */
function detectScope() {
  const pkg = readPackageJson();
  if (!pkg) return { scope: 'all', why: 'no package.json found' };

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasReact = Boolean(deps.react);
  const hasServer = ['express', 'fastify', 'hono', 'koa', '@nestjs/core'].some((d) => deps[d]);
  const isNext = Boolean(deps.next);

  if (isNext) return { scope: 'all', why: 'Next.js — both halves are usually in one repo' };
  if (hasReact && hasServer) return { scope: 'all', why: 'React and a server framework' };
  if (hasReact) return { scope: 'frontend', why: 'React without a server framework' };
  if (hasServer) return { scope: 'backend', why: 'a server framework without React' };
  return { scope: 'all', why: 'could not tell — installing everything' };
}

function detectIde() {
  const found = Object.entries(IDES).filter(([, dir]) => existsSync(join(CWD, dirname(dir))));
  return found.map(([name]) => name);
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
}

function install(ide, skills) {
  const target = IDES[ide];
  if (!target) {
    console.error(c.red(`  unknown agent "${ide}". Known: ${Object.keys(IDES).join(', ')}`));
    process.exitCode = 1;
    return 0;
  }

  const dest = join(CWD, target);
  mkdirSync(dest, { recursive: true });

  let written = 0;
  for (const skill of skills) {
    const from = join(SKILLS_DIR, skill);
    if (!existsSync(from)) {
      console.error(c.red(`  missing skill on disk: ${skill}`));
      continue;
    }
    cpSync(from, join(dest, skill), { recursive: true });
    written += 1;
  }

  console.log(`  ${c.green('✓')} ${written} skill(s) → ${c.bold(target)}`);
  return written;
}

function main() {
  const command = process.argv[2] ?? 'add';
  const available = readdirSync(SKILLS_DIR).filter((d) => !d.startsWith('.'));

  if (command === 'list') {
    console.log(`\n  ${c.bold(`${available.length} skills`)}\n`);
    for (const [scope, skills] of Object.entries(SCOPES)) {
      console.log(`  ${c.bold(scope)} ${c.dim(`(${skills.length})`)}`);
      console.log(`    ${skills.join(', ')}\n`);
    }
    return;
  }

  if (command !== 'add') {
    console.error(`\n  Unknown command "${command}". Use: add | list\n`);
    process.exitCode = 1;
    return;
  }

  const requestedScope = arg('scope');
  const detected = detectScope();
  const scope = requestedScope ?? detected.scope;

  if (!SCOPES[scope]) {
    console.error(c.red(`\n  Unknown scope "${scope}". Use: ${Object.keys(SCOPES).join(' | ')}\n`));
    process.exitCode = 1;
    return;
  }

  const skills = SCOPES[scope];

  console.log(`\n  ${c.bold('kaafil-skills')}`);
  console.log(
    `  scope ${c.bold(scope)}${requestedScope ? '' : c.dim(` — detected: ${detected.why}`)}\n`,
  );

  const requestedIde = arg('ide');
  let targets;
  if (requestedIde === 'all') {
    targets = Object.keys(IDES);
  } else if (requestedIde) {
    targets = [requestedIde];
  } else {
    const found = detectIde();
    // Defaulting to Claude Code when nothing is detectable beats asking a
    // question that a non-interactive shell (CI, a Dockerfile) cannot answer.
    targets = found.length > 0 ? found : ['claude'];
    console.log(
      found.length > 0
        ? c.dim(`  detected agent(s): ${found.join(', ')}\n`)
        : c.dim('  no agent directory found — defaulting to Claude Code\n'),
    );
  }

  for (const ide of targets) install(ide, skills);

  console.log(`\n  Then, in your agent:  ${c.bold('/kaafil')}\n`);
  console.log(
    c.dim('  For the full docs as a live MCP server:\n') +
      c.dim('    claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp\n'),
  );
}

main();
