#!/usr/bin/env bash
# closing-flow-guard.sh
# PreToolUse hook (matcher: Skill).
# Gates the commit-and-pr skill: blocks invocation unless the closing flow
# preconditions are met:
#   1. retrospective-codify must have been invoked in this session.
#   2. If any prompt-artifact files (SKILL.md / CLAUDE.md / ast-grep rule) were
#      modified in this session, empirical-prompt-tuning must also have been
#      invoked.
#
# Failure mode is fail-open: any internal error exits 0 without blocking.
# This prevents the user from being permanently locked out of commit-and-pr
# in case of a hook bug.

set -u

# 業務モードでは gate 全体を skip (retrospective-codify / empirical-prompt-tuning は業務モードで無効)
[ "${HARNESS_MODE:-}" != "engineer" ] && exit 0

INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

TOOL_NAME="$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)"
[ "$TOOL_NAME" = "Skill" ] || exit 0

SKILL="$(echo "$INPUT" | jq -r '.tool_input.skill // empty' 2>/dev/null)"
# Gate only at commit-and-pr (the formal end-of-session skill).
[ "$SKILL" = "commit-and-pr" ] || exit 0

SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)"
[ -n "$SESSION_ID" ] || exit 0

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$REPO_ROOT" ] && exit 0

DIR="$REPO_ROOT/.claude/sessions/$SESSION_ID"
INVOKED_LIST="$DIR/skills-invoked.txt"

block() {
  local reason="$1"
  jq -n --arg r "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# Gate 1: retrospective-codify must have been invoked in this session.
if ! grep -qx "retrospective-codify" "$INVOKED_LIST" 2>/dev/null; then
  block "ひと段落のクロージングフローです。 commit-and-pr の前に retrospective-codify を必ず起動してください (毎セッション必須、 例外なし)。 学びが無いセッションでも 'なし' と確定するために起動が必要です。 retrospective-codify が学び (採用候補) を 1 件以上抽出した場合は、 続けて empirical-prompt-tuning も起動してから commit-and-pr に戻ってきてください。"
fi

# Gate 2: if retrospective-codify ADOPTED (= wrote/modified) any prompt-artifact
# files, empirical-prompt-tuning must also have been invoked.
# Detection: compare current prompt-artifact state vs the snapshot taken right
# after retrospective-codify ran (track-skill-invoke.sh writes
# post-codify-prompt-artifacts.txt). Files that are NEW or have a DIFFERENT
# sha256 since the snapshot are treated as codify adoptions.
#
# Rationale: a prompt-artifact file modified BEFORE retrospective-codify ran
# (= part of the main task, not a codify adoption) is in the snapshot and
# matches the current state — gate 2 does NOT fire for it. Only artifacts the
# user explicitly accepted via retrospective-codify trigger empirical evaluation.
SNAPSHOT_FILE="$DIR/post-codify-prompt-artifacts.txt"
[ -f "$SNAPSHOT_FILE" ] || exit 0

# Compute current prompt-artifact map (sha + path).
CURRENT_MAP="$(
  (cd "$REPO_ROOT" && {
    git diff --name-only HEAD 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  }) | sort -u | grep -E '(^|/)(SKILL|CLAUDE)\.md$|(^|/)rules/[^/]+\.ya?ml$' | while read -r f; do
    [ -f "$REPO_ROOT/$f" ] || continue
    sha="$(shasum -a 256 "$REPO_ROOT/$f" 2>/dev/null | awk '{print $1}')"
    [ -n "$sha" ] && printf '%s  %s\n' "$sha" "$f"
  done
)"

# Files in CURRENT_MAP that aren't in SNAPSHOT_FILE = adopted/modified post-codify.
ADOPTED="$(comm -23 <(printf '%s\n' "$CURRENT_MAP" | sort -u) <(sort -u "$SNAPSHOT_FILE") | awk '{print $2}' | sed '/^$/d')"

if [ -n "$ADOPTED" ]; then
  if ! grep -qx "empirical-prompt-tuning" "$INVOKED_LIST" 2>/dev/null; then
    FILES_INLINE="$(echo "$ADOPTED" | tr '\n' ' ' | sed 's/  */ /g; s/ $//')"
    block "retrospective-codify 後に skill 手順書 / CLAUDE.md / ast-grep ルールが採用 (新規 or 変更) されました ($FILES_INLINE)。 commit-and-pr の前に empirical-prompt-tuning を必ず起動して、 採用したテキスト指示の精度をバイアス無し subagent で評価してから commit に戻ってきてください。"
  fi
fi

exit 0
