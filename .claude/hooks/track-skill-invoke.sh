#!/usr/bin/env bash
# track-skill-invoke.sh
# PostToolUse hook (matcher: Skill).
# Records each Skill invocation to .claude/sessions/<session_id>/skills-invoked.txt
# Used by closing-flow-guard.sh to verify retrospective-codify / empirical-prompt-tuning
# have run before commit-and-pr.

set -u

INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

TOOL_NAME="$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)"
[ "$TOOL_NAME" = "Skill" ] || exit 0

SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)"
[ -n "$SESSION_ID" ] || exit 0

SKILL="$(echo "$INPUT" | jq -r '.tool_input.skill // empty' 2>/dev/null)"
[ -n "$SKILL" ] || exit 0

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$REPO_ROOT" ] && exit 0

DIR="$REPO_ROOT/.claude/sessions/$SESSION_ID"
mkdir -p "$DIR" 2>/dev/null
echo "$SKILL" >> "$DIR/skills-invoked.txt"

# When retrospective-codify just ran, snapshot the post-codify prompt-artifact
# state (path + sha256). closing-flow-guard.sh compares current state vs this
# snapshot to detect whether retrospective-codify adopted (= wrote / modified)
# any prompt artifact, in which case empirical-prompt-tuning must follow.
# This is a PostToolUse hook, so the snapshot is taken AFTER retrospective-codify
# completes. If retrospective-codify itself wrote new files, they are already
# captured in this snapshot — gate 2 then needs to detect any FURTHER changes
# made between this snapshot and the moment commit-and-pr is invoked. (Typical
# flow: retrospective-codify proposes → user accepts → Claude writes artifacts.
# If Claude writes the artifacts during the same Skill call, they are inside
# this snapshot. If Claude writes them after, gate 2 sees them as new vs
# snapshot.) The simpler design that worked in tests: snapshot here, and at
# gate-time fire only if there are entries in the current snapshot that were
# NOT present (or had different sha) in this baseline.
if [ "$SKILL" = "retrospective-codify" ]; then
  SNAPSHOT_FILE="$DIR/post-codify-prompt-artifacts.txt"
  : > "$SNAPSHOT_FILE"
  (cd "$REPO_ROOT" && {
    git diff --name-only HEAD 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  }) | sort -u | grep -E '(^|/)(SKILL|CLAUDE)\.md$|(^|/)rules/[^/]+\.ya?ml$' | while read -r f; do
    [ -f "$REPO_ROOT/$f" ] || continue
    sha="$(shasum -a 256 "$REPO_ROOT/$f" 2>/dev/null | awk '{print $1}')"
    [ -n "$sha" ] && printf '%s  %s\n' "$sha" "$f" >> "$SNAPSHOT_FILE"
  done
fi

exit 0
