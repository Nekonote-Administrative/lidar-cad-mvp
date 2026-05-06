#!/usr/bin/env bash
# git-main-edit-guard.sh
# PreToolUse hook for Edit/Write/MultiEdit:
# - If this session has an active worktree marker, force edits inside that worktree
#   (deny edits anywhere else within the project repo).
# - Otherwise, block edits when current branch is main/master.
# AI is expected to silently invoke `git-task-start` skill and retry.

set -u

INPUT="$(cat 2>/dev/null || true)"
if [ -z "$INPUT" ]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  # Without jq we can't parse input safely; allow rather than blocking inadvertently
  exit 0
fi

FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)"
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)"

# macOS HFS+/APFS returns paths as NFD via `pwd -P`, while inputs from the AI
# typically arrive as NFC. Bash string comparisons are byte-wise, so we must
# normalize every path to NFC before comparing.
to_nfc() {
  if command -v iconv >/dev/null 2>&1; then
    local out
    out="$(printf '%s' "$1" | iconv -f utf-8-mac -t utf-8 2>/dev/null)"
    if [ -n "$out" ]; then
      printf '%s' "$out"
      return
    fi
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import unicodedata,sys; sys.stdout.write(unicodedata.normalize('NFC', sys.argv[1]))" "$1" 2>/dev/null && return
  fi
  printf '%s' "$1"
}

# Project root from CWD (canonical path for symlink-safe comparison)
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$PROJECT_ROOT" ]; then
  exit 0
fi
PROJECT_ROOT_REAL="$(to_nfc "$(cd "$PROJECT_ROOT" && pwd -P)")"

# Resolve file_path to absolute
case "$FILE_PATH" in
  /*) ABS_FILE="$FILE_PATH" ;;
  *)  ABS_FILE="$PROJECT_ROOT/$FILE_PATH" ;;
esac

# Helper: emit a deny decision and exit
emit_deny() {
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

# Resolve the real (canonical) path even if the file does not exist yet.
# We canonicalize the deepest existing ancestor and re-append the tail.
canonicalize_target() {
  local p="$1"
  local d t tail=""
  d="$(dirname "$p")"
  t="$(basename "$p")"
  if [ -d "$d" ]; then
    printf '%s/%s' "$(cd "$d" && pwd -P)" "$t"
    return
  fi
  while [ ! -d "$d" ] && [ "$d" != "/" ] && [ -n "$d" ]; do
    tail="$(basename "$d")/${tail}"
    d="$(dirname "$d")"
  done
  if [ -d "$d" ]; then
    printf '%s/%s%s' "$(cd "$d" && pwd -P)" "$tail" "$t"
  else
    printf '%s' "$p"
  fi
}

ABS_FILE_REAL="$(to_nfc "$(canonicalize_target "$ABS_FILE")")"

# ============================================================================
# Session-scoped worktree enforcement (precedes the legacy main-edit guard)
# ============================================================================
ACTIVE_WT=""
if [ -n "$SESSION_ID" ]; then
  WT_JSON="$PROJECT_ROOT/.claude/sessions/$SESSION_ID/wt.json"
  if [ -f "$WT_JSON" ]; then
    ACTIVE_WT="$(jq -r '.worktree_path // empty' "$WT_JSON" 2>/dev/null)"
    if [ -n "$ACTIVE_WT" ] && [ ! -d "$ACTIVE_WT" ]; then
      ACTIVE_WT=""
    fi
  fi
fi

if [ -n "$ACTIVE_WT" ]; then
  ACTIVE_WT_REAL="$(to_nfc "$(cd "$ACTIVE_WT" && pwd -P)")"

  case "$ABS_FILE_REAL" in
    "$PROJECT_ROOT_REAL"/*|"$PROJECT_ROOT_REAL")
      # Inside the project tree — must be inside the active worktree
      case "$ABS_FILE_REAL" in
        "$ACTIVE_WT_REAL"/*|"$ACTIVE_WT_REAL")
          exit 0
          ;;
        *)
          REL=""
          case "$ABS_FILE_REAL" in
            "$PROJECT_ROOT_REAL"/*) REL="${ABS_FILE_REAL#$PROJECT_ROOT_REAL/}" ;;
          esac
          SUGGEST=""
          if [ -n "$REL" ]; then
            case "$REL" in
              .claude/worktrees/*) SUGGEST="" ;;
              *) SUGGEST="$ACTIVE_WT_REAL/$REL" ;;
            esac
          fi
          if [ -n "$SUGGEST" ]; then
            emit_deny "[git-harness] このセッションの作業場所は隔離 worktree です:
  $ACTIVE_WT_REAL
プロジェクト本体を直接編集するのは禁止されています。
対応: 同じ編集を次のパスで再実行してください:
  $SUGGEST"
          else
            emit_deny "[git-harness] このセッションの作業場所は隔離 worktree です:
  $ACTIVE_WT_REAL
別 worktree / プロジェクト本体への書き込みは禁止されています。
対応: $ACTIVE_WT_REAL 配下のパスに書き換えて再実行してください。"
          fi
          ;;
      esac
      ;;
    *)
      # Outside the project entirely (e.g., /tmp, $HOME). Unrelated, allow.
      exit 0
      ;;
  esac
fi

# ============================================================================
# Fallback: legacy main-edit guard for sessions without an active worktree
# ============================================================================
TARGET_DIR="$(dirname "$ABS_FILE")"
if [ ! -d "$TARGET_DIR" ]; then
  TARGET_DIR="$PROJECT_ROOT"
fi
FILE_REPO_ROOT="$(cd "$TARGET_DIR" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$FILE_REPO_ROOT" ]; then
  exit 0
fi
FILE_REPO_REAL="$(to_nfc "$(cd "$FILE_REPO_ROOT" && pwd -P)")"

if [ "$FILE_REPO_REAL" != "$PROJECT_ROOT_REAL" ]; then
  exit 0
fi

CURRENT_BRANCH="$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || true)"

case "$CURRENT_BRANCH" in
  main|master)
    emit_deny "[git-harness] main / master ブランチでの直接編集は禁止されています。
対応: git-task-start skill を起動して新しい feature ブランチ + 隔離 worktree を作り、 同じ編集を再実行してください。"
    ;;
esac

exit 0
