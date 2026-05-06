#!/usr/bin/env bash
# git-session-bootstrap.sh
# SessionStart hook: silently sync git state and inject context for AI.
# - Detects current branch and repo state
# - Fetches origin (best-effort, silent)
# - Fast-forwards local main if safe
# - Warns once if GitHub auto-delete-on-merge is OFF
# - Reads session_id and injects it for the AI to pass into git-task-start
# - Cleans up orphan worktree markers (worktree path no longer exists on disk)
# - Surfaces active worktree marker for this session (resume case)
# - Emits additionalContext JSON via jq

set -u

# Read SessionStart payload (we need session_id from it)
INPUT="$(cat 2>/dev/null || true)"

# Bail if not in a git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$REPO_ROOT" ] && exit 0
cd "$REPO_ROOT" || exit 0

SESSION_ID=""
if [ -n "$INPUT" ] && command -v jq >/dev/null 2>&1; then
  SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)"
fi

# Anomaly detection (do NOT auto-fix)
STATE="clean"
if [ -f .git/MERGE_HEAD ]; then
  STATE="merge_in_progress"
elif [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
  STATE="rebase_in_progress"
fi

CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
[ -z "$CURRENT_BRANCH" ] && CURRENT_BRANCH="DETACHED"

ON_MAIN="false"
case "$CURRENT_BRANCH" in
  main|master) ON_MAIN="true";;
esac

DIRTY="no"
if [ -n "$(git status --porcelain 2>/dev/null | head -1)" ]; then
  DIRTY="yes"
fi

# Best-effort silent fetch
git fetch origin --no-tags --prune --quiet 2>/dev/null || true

# Determine main branch name
MAIN_BRANCH="main"
if ! git rev-parse --verify "refs/remotes/origin/main" >/dev/null 2>&1; then
  if git rev-parse --verify "refs/remotes/origin/master" >/dev/null 2>&1; then
    MAIN_BRANCH="master"
  fi
fi

# Local main vs origin/main
LOCAL_MAIN_BEHIND=0
if git rev-parse --verify "$MAIN_BRANCH" >/dev/null 2>&1 \
  && git rev-parse --verify "origin/$MAIN_BRANCH" >/dev/null 2>&1; then
  LOCAL_MAIN_BEHIND="$(git rev-list --count "$MAIN_BRANCH..origin/$MAIN_BRANCH" 2>/dev/null || echo 0)"
fi

# Auto fast-forward local main if safe (clean state, no merge in progress)
if [ "$LOCAL_MAIN_BEHIND" -gt 0 ] && [ "$STATE" = "clean" ]; then
  if [ "$ON_MAIN" = "true" ] && [ "$DIRTY" = "no" ]; then
    if git pull --ff-only --quiet 2>/dev/null; then
      LOCAL_MAIN_BEHIND=0
    fi
  elif [ "$ON_MAIN" = "false" ]; then
    # Update local main without checking out
    if git fetch origin "${MAIN_BRANCH}:${MAIN_BRANCH}" --quiet 2>/dev/null; then
      LOCAL_MAIN_BEHIND=0
    fi
  fi
fi

# Current branch ahead/behind upstream
AHEAD=0
BEHIND_REMOTE=0
if [ "$CURRENT_BRANCH" != "DETACHED" ] && git rev-parse "@{u}" >/dev/null 2>&1; then
  AHEAD="$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)"
  BEHIND_REMOTE="$(git rev-list --count 'HEAD..@{u}' 2>/dev/null || echo 0)"
fi

# Branch behind origin/main (useful when on feature branch)
BEHIND_MAIN=0
if [ "$ON_MAIN" = "false" ] && [ "$CURRENT_BRANCH" != "DETACHED" ] \
  && git rev-parse --verify "origin/$MAIN_BRANCH" >/dev/null 2>&1; then
  BEHIND_MAIN="$(git rev-list --count "HEAD..origin/$MAIN_BRANCH" 2>/dev/null || echo 0)"
fi

# Prune git's worktree metadata for any worktree directories that were physically
# removed (e.g., pr-merge-and-cleanup did `rm -rf` after a remove --force failure).
git worktree prune --quiet 2>/dev/null || true

# Sweep ALL session markers: drop any whose worktree_path no longer exists on disk.
# This is idempotent and safe: we only delete markers that point to a missing
# worktree directory (= a session that crashed without cleanup, or a worktree
# that was removed by pr-merge-and-cleanup but the marker survived).
SESSIONS_DIR="$REPO_ROOT/.claude/sessions"
if [ -d "$SESSIONS_DIR" ] && command -v jq >/dev/null 2>&1; then
  for sd in "$SESSIONS_DIR"/*/; do
    [ -d "$sd" ] || continue
    wt_json="${sd}wt.json"
    [ -f "$wt_json" ] || continue
    wt_path="$(jq -r '.worktree_path // empty' "$wt_json" 2>/dev/null)"
    if [ -z "$wt_path" ] || [ ! -d "$wt_path" ]; then
      rm -f "$wt_json" 2>/dev/null
      rmdir "$sd" 2>/dev/null
    fi
  done
fi

# If the current session has an active worktree marker, surface its path.
ACTIVE_WT=""
if [ -n "$SESSION_ID" ] && command -v jq >/dev/null 2>&1; then
  WT_JSON="$SESSIONS_DIR/$SESSION_ID/wt.json"
  if [ -f "$WT_JSON" ]; then
    ACTIVE_WT="$(jq -r '.worktree_path // empty' "$WT_JSON" 2>/dev/null)"
    if [ -n "$ACTIVE_WT" ] && [ ! -d "$ACTIVE_WT" ]; then
      ACTIVE_WT=""
    fi
  fi
fi

# One-time GitHub auto-delete setting check
SENTINEL="$REPO_ROOT/.claude/.git-harness-checked"
WARN=""
if [ ! -f "$SENTINEL" ] && command -v gh >/dev/null 2>&1; then
  DELETE_ON_MERGE="$(gh repo view --json deleteBranchOnMerge -q .deleteBranchOnMerge 2>/dev/null || echo unknown)"
  if [ "$DELETE_ON_MERGE" = "false" ]; then
    WARN="GitHub の auto-delete 設定 (Repo Settings → General → Pull Requests → Automatically delete head branches) が OFF です。 ユーザーに 1 回だけ ON にするよう案内してください。"
  fi
  mkdir -p "$REPO_ROOT/.claude" 2>/dev/null
  touch "$SENTINEL" 2>/dev/null
fi

# Build context string with literal newline if WARN exists
CONTEXT="[git-harness] branch=$CURRENT_BRANCH on_main=$ON_MAIN main_branch=$MAIN_BRANCH local_main_behind=$LOCAL_MAIN_BEHIND branch_ahead=$AHEAD branch_behind_remote=$BEHIND_REMOTE branch_behind_main=$BEHIND_MAIN state=$STATE dirty=$DIRTY"
if [ -n "$SESSION_ID" ]; then
  CONTEXT="$CONTEXT
[claude-session] session_id=$SESSION_ID"
fi
if [ -n "$ACTIVE_WT" ]; then
  CONTEXT="$CONTEXT
[claude-session] active_worktree=$ACTIVE_WT
[claude-session] このセッションは隔離 worktree で作業中です。 編集 / build / git 操作は必ず active_worktree のパス配下で実行してください (Edit/Write/MultiEdit はその外を弾きます)。"
fi
if [ -n "$WARN" ]; then
  CONTEXT="$CONTEXT
[git-harness-warn] $WARN"
fi

# Emit JSON via jq for safe escaping
if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$CONTEXT" \
    '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
else
  # Fallback: minimal escaping
  ESCAPED="${CONTEXT//\"/\\\"}"
  ESCAPED="${ESCAPED//$'\n'/\\n}"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$ESCAPED"
fi

exit 0
