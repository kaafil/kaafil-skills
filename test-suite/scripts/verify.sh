#!/usr/bin/env bash
# Static integrity harness for kaafil-skills.
#
# Deterministic checks only — no network, no LLM, no installed packages
# needed. This is the gate that runs on every push; the fence typecheck
# and the symbol assertion cover correctness against the real API, and
# the eval covers whether the skills actually work.
#
# What this catches is the class of defect that makes a skill set rot:
# a skill that points at a sibling that was renamed, a frontmatter name
# that no longer matches its directory, an installer that forgot a new
# skill, or internal spec citations leaking into consumer-facing text.

set -uo pipefail
cd "$(dirname "$0")/../.."
REPO="$PWD"

pass=0
fail=0
failures=()

ok()      { printf "  \033[32m✓\033[0m %s\n" "$1"; pass=$((pass+1)); }
bad()     { printf "  \033[31m✗\033[0m %s\n" "$1"; fail=$((fail+1)); failures+=("$1"); }
section() { printf "\n\033[1m── %s ──\033[0m\n" "$1"; }

SKILL_DIRS=$(find skills -mindepth 1 -maxdepth 1 -type d | sort)

# ── 1. Frontmatter ──────────────────────────────────────────────────────────
section "Frontmatter"
for dir in $SKILL_DIRS; do
  name=$(basename "$dir")
  md="$dir/SKILL.md"

  if [[ ! -f "$md" ]]; then
    bad "$name: no SKILL.md"
    continue
  fi

  result=$(node -e '
    const fs = require("fs");
    const [file, dirName] = process.argv.slice(1);
    const text = fs.readFileSync(file, "utf8");
    const m = text.match(/^---\n([\s\S]*?)\n---/);
    if (!m) { console.log("no frontmatter block"); process.exit(1); }
    const body = m[1];
    const get = (k) => (body.match(new RegExp("^" + k + ":\\s*(.+)$", "m")) || [])[1];

    const missing = ["name", "description", "license", "compatibility"].filter((k) => !get(k));
    if (!/^\s+version:\s*"[^"]+"/m.test(body)) missing.push("metadata.version");
    if (!/^\s+author:\s*"[^"]+"/m.test(body)) missing.push("metadata.author");
    if (missing.length) { console.log("missing: " + missing.join(", ")); process.exit(1); }

    const declared = get("name").trim();
    if (declared !== dirName) {
      console.log(`name "${declared}" != directory "${dirName}"`);
      process.exit(1);
    }

    // The description is what an agent reads to decide whether to load the
    // skill at all. A stub is worse than useless: it wins the match and
    // then teaches nothing.
    const description = get("description").trim();
    if (description.length < 40) { console.log("description too short to route on"); process.exit(1); }
  ' "$md" "$name" 2>&1)

  if [[ -z "$result" ]]; then ok "$name"; else bad "$name: $result"; fi
done

# ── 2. Cross-references resolve ─────────────────────────────────────────────
section "Cross-references between skills"
missing_refs=$(node -e '
  const fs = require("fs");
  const path = require("path");
  const names = new Set(fs.readdirSync("skills").filter((d) => !d.startsWith(".")));
  const problems = [];
  for (const dir of names) {
    const file = path.join("skills", dir, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    // Backticked kaafil-* tokens that look like a skill reference.
    for (const m of text.matchAll(/`(kaafil(?:-[a-z0-9]+)+)`/g)) {
      const ref = m[1];
      // `kaafil-*` is also the prefix for the packages themselves and for
      // the two published CSS layer names, none of which are skills.
      const NOT_SKILLS = new Set([
        "kaafil-js",
        "kaafil-react-uikit",
        "kaafil-skills",
        "kaafil-ui",
        "kaafil-ui-overrides",
      ]);
      if (NOT_SKILLS.has(ref)) continue;
      if (ref.startsWith("kaafil-js/") || ref.startsWith("kaafil-react-uikit/")) continue;
      if (!names.has(ref)) problems.push(`${dir} -> ${ref}`);
    }
  }
  console.log([...new Set(problems)].join("\n"));
')
if [[ -z "$missing_refs" ]]; then
  ok "every referenced skill exists"
else
  while IFS= read -r line; do bad "dangling reference: $line"; done <<< "$missing_refs"
fi

# ── 3. No internal spec citations ───────────────────────────────────────────
section "No internal spec leakage"
# Skills are consumer-facing. A citation like `04-customization-ladder.md §5.1`
# points at a private repo the reader cannot open, and reads as an
# instruction to go find it.
leaks=$(grep -rnE '[0-9]{2}-[a-z-]+\.md( §|#)|§[0-9]' skills --include=SKILL.md || true)
if [[ -z "$leaks" ]]; then
  ok "no internal spec references in skill text"
else
  while IFS= read -r line; do bad "spec citation: ${line:0:120}"; done <<< "$leaks"
fi

# ── 4. Package names and versions are consistent ────────────────────────────
section "Package naming"
wrong_pkg=$(grep -rnoE '@kaafil/[a-z-]+' skills --include=SKILL.md || true)
if [[ -z "$wrong_pkg" ]]; then
  ok "no scoped @kaafil/* package names (the real packages are unscoped)"
else
  while IFS= read -r line; do bad "scoped package name: ${line:0:100}"; done <<< "$wrong_pkg"
fi

# Anchored to a real import STATEMENT. An unanchored match also flags the
# prose in kaafil-react-setup that exists to warn readers off exactly this,
# which would make the check punish the documentation for documenting.
bare_import=$(grep -rnE "^\s*import .* from 'kaafil-react-uikit';" skills --include=SKILL.md || true)
if [[ -z "$bare_import" ]]; then
  ok "no bare kaafil-react-uikit imports (there is no '.' export)"
else
  while IFS= read -r line; do bad "bare import: ${line:0:100}"; done <<< "$bare_import"
fi

# ── 5. Every skill states its ground truth and points at the docs MCP ───────
section "Ground truth + docs MCP"
for dir in $SKILL_DIRS; do
  name=$(basename "$dir")
  md="$dir/SKILL.md"
  [[ -f "$md" ]] || continue
  if ! grep -q "Ground truth:" "$md"; then
    bad "$name: no 'Ground truth:' line"
  elif ! grep -q "developer.kaafil.in/api/mcp" "$md"; then
    bad "$name: does not point at the docs MCP"
  else
    ok "$name"
  fi
done

# ── 6. Shell and JSON fences are syntactically valid ────────────────────────
section "bash + json fences"
fence_report=$(node -e '
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const out = [];
  for (const dir of fs.readdirSync("skills").filter((d) => !d.startsWith("."))) {
    const file = path.join("skills", dir, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    let i = 0;
    for (const m of text.matchAll(/^```(bash|sh|shell|json)[^\n]*\n([\s\S]*?)\n^```/gm)) {
      i += 1;
      const [, lang, body] = m;
      if (lang === "json") {
        try { JSON.parse(body); } catch (e) { out.push(`${dir}#${i} json: ${e.message}`); }
      } else {
        const tmp = path.join(os.tmpdir(), `kaafil-fence-${dir}-${i}.sh`);
        fs.writeFileSync(tmp, body);
        out.push(`SHELLCHECK\t${dir}#${i}\t${tmp}`);
      }
    }
  }
  console.log(out.join("\n"));
')
shell_bad=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  if [[ "$line" == SHELLCHECK* ]]; then
    label=$(printf '%s' "$line" | cut -f2)
    tmp=$(printf '%s' "$line" | cut -f3)
    if ! bash -n "$tmp" 2>/dev/null; then bad "$label: bash syntax error"; shell_bad=1; fi
    rm -f "$tmp"
  else
    bad "$line"; shell_bad=1
  fi
done <<< "$fence_report"
[[ $shell_bad -eq 0 ]] && ok "all bash and json fences parse"

# ── 7. install.js ↔ skills/ parity ──────────────────────────────────────────
section "install.js ↔ skills/ parity"
if [[ -f bin/install.js ]]; then
  diff_out=$(node -e '
    const fs = require("fs");
    const src = fs.readFileSync("bin/install.js", "utf8");
    const listed = new Set([...src.matchAll(/["'"'"']((?:kaafil)(?:-[a-z0-9]+)*)["'"'"']/g)].map((m) => m[1]));
    const disk = fs.readdirSync("skills").filter((d) => !d.startsWith("."));
    const missing = disk.filter((d) => !listed.has(d));
    if (missing.length) console.log("not registered in install.js: " + missing.join(", "));
  ')
  if [[ -z "$diff_out" ]]; then ok "install.js registers every skill"; else bad "$diff_out"; fi
else
  bad "bin/install.js is missing"
fi

# ── summary ─────────────────────────────────────────────────────────────────
printf "\n"
if [[ $fail -eq 0 ]]; then
  printf "  \033[32m%d passed, 0 failed\033[0m\n\n" "$pass"
  exit 0
fi
printf "  \033[31m%d failed\033[0m, %d passed\n\n" "$fail" "$pass"
for f in "${failures[@]}"; do printf "    %s\n" "$f"; done
printf "\n"
exit 1
