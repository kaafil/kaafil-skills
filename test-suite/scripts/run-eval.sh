#!/usr/bin/env bash
# End-to-end evaluation: drive a REAL agent against a fresh app with the
# skills installed, then judge what it produced.
#
#   bash test-suite/scripts/run-eval.sh                 # every case
#   bash test-suite/scripts/run-eval.sh --case console  # one case
#   bash test-suite/scripts/run-eval.sh --keep          # keep the workspace
#   bash test-suite/scripts/run-eval.sh --baseline      # run WITHOUT skills
#
# WHY THIS EXISTS AND WHY IT IS SEPARATE. The other three layers prove the
# skills are ACCURATE. None of them proves the skills are USED, or that an
# agent reading them reaches a working integration. Only running an agent
# does that.
#
# --baseline is the control. A skill set that scores the same with and
# without the skills installed has taught the model nothing, and a suite
# that never runs the control cannot tell the difference between "our
# skills are good" and "the model already knew".
#
# Costs real tokens, so it is opt-in and never part of `npm run verify`.

set -uo pipefail
cd "$(dirname "$0")/../.."
REPO="$PWD"

FIXTURE="$REPO/test-suite/fixtures/vite-react"
WORK="$REPO/test-suite/tmp"
RESULTS="$REPO/test-suite/results"

only=""
keep=0
baseline=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --case) only="$2"; shift 2 ;;
    --keep) keep=1; shift ;;
    --baseline) baseline=1; shift ;;
    *) echo "unknown flag: $1"; exit 2 ;;
  esac
done

command -v claude >/dev/null 2>&1 || {
  echo "  claude CLI not found. Install it, or run the other three layers only."
  exit 1
}

# ── the cases ───────────────────────────────────────────────────────────────
# Each is a task a real integrator would give an agent, phrased the way they
# would phrase it — not phrased to hint at the answer.
#
# Each prompt ends by granting the agent latitude to proceed on a stated
# assumption. That is not making the test easier — it is making it
# measurable. The first run of the `field` case produced a correct PLAN
# (per-manager IndexedDB adapter, no no-op callbacks, styles imported
# once) and then stopped to ask whether the mint endpoint existed, so it
# wrote nothing and graded as three rule violations including data loss.
# Grading "asked a sensible question" as "lost a manager's work" is a
# harness defect, not a finding.
ASSUME="If something is genuinely ambiguous, state your assumption and proceed — do not stop to ask."

case_prompt() {
  case "$1" in
    console)
      echo "Add the Kaafil agency admin console to this app. Our backend already mints session tokens at POST /api/kaafil-session; assume you can call it. Wire it up so it renders. $ASSUME"
      ;;
    field)
      echo "Our tour managers need the Kaafil manager app on their phones. They work in areas with no mobile signal, so their work must not be lost. Add it to this app. $ASSUME"
      ;;
    share)
      echo "Add a page that shows a traveller their trip from a Kaafil share link. The link token arrives in the URL. $ASSUME"
      ;;

    # ── The semantic traps ──────────────────────────────────────────────
    # The three cases above are largely enforced by the type system, and
    # the baseline passes them: the packages ship rich TSDoc, and a
    # competent agent reads it. These two cannot be reached by types at
    # all — the wrong answer compiles cleanly — so they are where a skill
    # either earns its place or does not.
    empty)
      echo "In this app, add a component that shows a trip's traveller manifest to a manager, using the Kaafil UI Kit's core hooks rather than a prebuilt section. It must handle the case where there are no travellers to show. $ASSUME"
      ;;
    override)
      echo "Add an admin override button to this app so a supervisor can force through an expense edit on a Kaafil trip that has already been closed out. $ASSUME"
      ;;
    *) return 1 ;;
  esac
}

CASES=(console field share empty override)
[[ -n "$only" ]] && CASES=("$only")

mkdir -p "$WORK" "$RESULTS"

# ── grading ─────────────────────────────────────────────────────────────────
# Each rule is a NEVER from the skills, expressed as something greppable in
# the produced source. These are the mistakes a guessing model actually
# makes, so a violation is a concrete failure rather than a style opinion.
grade() {
  local dir="$1" name="$2"
  local violations=0
  local notes=()

  # An ARRAY, populated with -print0. Word-splitting a newline-joined
  # `find` result silently produced an empty file list on the first run,
  # and the grader reported "no provider" for an integration that had
  # one — a false failure is the worst possible output from a test
  # harness, because it sends you to fix code that was already right.
  local files=()
  while IFS= read -r -d '' f; do files+=("$f"); done < <(
    find "$dir/src" -type f \( -name '*.tsx' -o -name '*.ts' \) -print0 2>/dev/null
  )
  [[ ${#files[@]} -eq 0 ]] && { echo "1|no source files"; return; }

  # The override case is graded INVERTED and therefore first: the correct
  # answer to "add a close-out override" is to refuse, which means writing
  # nothing. Falling through to the check below would score a principled,
  # correct refusal as a failure to act.
  if [[ "$name" == override ]]; then
    if grep -qE 'unlock|override|force' "${files[@]}" 2>/dev/null; then
      echo "1|BUILT A CLOSE-OUT OVERRIDE — no such capability exists at any layer"
    else
      echo "0|correctly declined to build an override"
    fi
    return
  fi

  # "Wrote nothing" is a DIFFERENT outcome from "wrote the wrong thing",
  # and reporting them the same way hides which one happened. An agent
  # that produced no Kaafil code at all usually asked a question instead;
  # read agent.log rather than chasing a rule violation that is not there.
  if ! grep -q 'kaafil' "${files[@]}" 2>/dev/null; then
    echo "1|NO INTEGRATION WRITTEN — check agent.log (it likely asked a question instead)"
    return
  fi

  check() { # pattern, message
    if grep -qE "$1" "${files[@]}" 2>/dev/null; then
      notes+=("$2")
      violations=$((violations+1))
    fi
  }

  check 'persona=|mode="(manager|agencyAdmin|share)"' 'invented a persona/mode prop'
  check "from 'kaafil-react-uikit'" 'imported the non-existent bare entry'
  check '\.data\b.*await|await.*\)\.data' 'used .data on a response'
  check 'createTrip|trips\.create' 'invented createTrip'
  check 'shareTokens\.mint' 'used shareTokens.mint instead of .create'
  check 'openManagerSession\(|openAgencyAdminSession\(' 'imported a session opener that does not exist'
  check 'idempotencyKey' 'passed an idempotency key at the UI layer'
  check '(VITE_|NEXT_PUBLIC_|PUBLIC_)[A-Z_]*API_KEY' 'exposed the API key to the browser'
  check 'assignedTrips' 'invented an assignedTrips prop'
  check 'Date\.now\(\)' 'used the device clock for Kaafil state'

  require() { # pattern, message
    if ! grep -qE "$1" "${files[@]}" 2>/dev/null; then
      notes+=("$2")
      violations=$((violations+1))
    fi
  }

  # Positive requirements — but only for the cases that actually ask for a
  # whole integration. `empty` asks for ONE component inside an existing
  # app, where mounting a second provider and re-importing the stylesheet
  # would both be wrong. Applying app-level requirements to a
  # component-level task marked correct work as failing.
  case "$name" in
    console | field | share)
      require 'kaafil-react-uikit/styles' 'did not import the opt-in stylesheet'
      require 'KaafilUIKitProvider' 'no provider'
      ;;
  esac

  # The field case has one extra, and it is the highest-severity bug in the
  # whole product: without a storage adapter the outbox is in-memory and a
  # manager's work is lost when the tab closes.
  if [[ "$name" == field ]]; then
    require 'createIndexedDbStorageAdapter|storage=' \
      'MANAGER DATA LOSS: no storage adapter, outbox is in-memory only'
  fi

  # A snapshot read returns rows:[] both when the trip is genuinely empty
  # and when this device has never synced. Only `syncedAt` separates them,
  # and rendering "No travellers" for the second is a lie told to someone
  # standing at a bus door. Compiles either way.
  # Accepts EITHER discriminator, because the kit has two read contracts
  # and both are legitimate answers: `syncedAt` on a snapshot read,
  # `status`/loaded on a domain hook. Requiring `syncedAt` alone failed a
  # run that used `useParties` and handled loading/error/empty correctly —
  # and it was that false failure that surfaced a real overgeneralisation
  # in the hooks skill, which claimed `syncedAt` applied everywhere.
  if [[ "$name" == empty ]]; then
    require "syncedAt|status === 'loading'|\.loaded" \
      'LIES TO THE USER: renders an empty state without proving it looked'
  fi


  # `${notes[*]-}` — an empty array under `set -u` is an unbound variable
  # reference in bash, which crashed the first run mid-report.
  local joined
  joined=$(IFS='; '; echo "${notes[*]-}")
  echo "$violations|$joined"
}

# ── run ─────────────────────────────────────────────────────────────────────
label=$([[ $baseline -eq 1 ]] && echo "BASELINE (no skills)" || echo "WITH SKILLS")
printf "\n\033[1m  Kaafil skills eval — %s\033[0m\n\n" "$label"

summary=()

for name in "${CASES[@]}"; do
  prompt=$(case_prompt "$name") || { echo "  unknown case: $name"; exit 2; }

  dir="$WORK/${name}$([[ $baseline -eq 1 ]] && echo '-baseline')"
  rm -rf "$dir"
  mkdir -p "$dir"
  cp -R "$FIXTURE/." "$dir/"

  if [[ $baseline -eq 0 ]]; then
    node "$REPO/bin/install.js" add --ide claude --scope frontend >/dev/null 2>&1 || true
    # install.js writes relative to CWD, so run it inside the workspace.
    (cd "$dir" && node "$REPO/bin/install.js" add --ide claude --scope frontend >/dev/null 2>&1)
  fi

  printf "  \033[1m%s\033[0m — installing deps…\n" "$name"
  (cd "$dir" && npm install --no-audit --no-fund >/dev/null 2>&1)

  printf "  %s — running agent…\n" "$name"
  (cd "$dir" && claude -p "$prompt" --permission-mode acceptEdits > agent.log 2>&1)
  agent_status=$?

  printf "  %s — typechecking…\n" "$name"
  tc_out=$(cd "$dir" && npx tsc --noEmit -p tsconfig.json 2>&1)
  tc_status=$?

  IFS='|' read -r violations notes <<< "$(grade "$dir" "$name")"

  verdict="PASS"
  [[ $tc_status -ne 0 ]] && verdict="FAIL"
  [[ ${violations:-0} -gt 0 ]] && verdict="FAIL"
  [[ $agent_status -ne 0 ]] && verdict="FAIL"

  colour=$([[ "$verdict" == PASS ]] && echo 32 || echo 31)
  printf "  \033[%dm%s\033[0m %s — typecheck %s, %s rule violation(s)\n" \
    "$colour" "$verdict" "$name" \
    "$([[ $tc_status -eq 0 ]] && echo ok || echo failed)" "${violations:-?}"
  [[ -n "$notes" ]] && printf "      %s\n" "$notes"
  [[ $tc_status -ne 0 ]] && printf "      %s\n" "$(echo "$tc_out" | head -3 | tr '\n' ' ')"
  printf "\n"

  summary+=("$name|$verdict|$tc_status|${violations:-?}|$notes")
done

{
  echo "# eval $(date -u +%Y-%m-%dT%H:%M:%SZ) — $label"
  printf '%s\n' "${summary[@]}"
} > "$RESULTS/eval-$([[ $baseline -eq 1 ]] && echo baseline || echo skills).txt"

[[ $keep -eq 0 ]] && printf "  Workspaces kept at test-suite/tmp/ for inspection.\n\n"

for row in "${summary[@]}"; do
  [[ "$row" == *"|FAIL|"* ]] && exit 1
done
exit 0
