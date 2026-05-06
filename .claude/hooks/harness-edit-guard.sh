#!/usr/bin/env bash
# harness-edit-guard.sh
# PreToolUse hook (matcher: Edit|Write|MultiEdit).
# 業務モード ($HARNESS_MODE != "engineer") のとき、 ハーネス本体ファイルの
# Edit/Write/MultiEdit を deny する。 deny 対象 (パス全体に対する部分マッチ):
#   - */.claude/skills/* 配下
#   - */.claude/hooks/* 配下
#   - */.claude/settings.json (.settings.local.json は引っかからない)
#   - */CLAUDE.md (ルート / サブディレクトリ問わず)
#
# 判定方針: file_path 全体に対する単純な部分マッチで決める。 cwd 由来の
# PROJECT_ROOT で REL を計算する方式 (= git-main-edit-guard.sh パターン)
# は worktree-aware にするため `cd $TARGET && git rev-parse` が必要だが、
# Google Drive 等の cloud-synced FS で NFC/NFD 不整合により rev-parse が
# 空文字を返す事例を検出。 file system 非依存の文字列マッチに切替えた。
# 偽陽性 (例: src/.claude/skills/* のような業務コード内偶発マッチ)
# は実際のファイル配置として発生しないので許容。
#
# deny しないパス: docs/adr/**、 業務コード全般、 .claude/sessions/**、
#                 .claude/worktrees/<branch>/ 配下のうちハーネス本体に
#                 該当しないもの (= 上記 deny 対象の文字列を含まないパス)、
#                 .claude/settings.local.json
#
# 失敗モードは fail-open (内部エラー時は exit 0 で allow)。

set -u

# engineer モードなら何もしない (= allow)
[ "${HARNESS_MODE:-}" = "engineer" ] && exit 0

INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
[ -n "$FILE_PATH" ] || exit 0

block() {
  jq -n --arg r "$1" '{
    hookSpecificOutput:{
      hookEventName:"PreToolUse",
      permissionDecision:"deny",
      permissionDecisionReason:$r
    }
  }'
  exit 0
}

case "$FILE_PATH" in
  */.claude/skills/*|*/.claude/hooks/*|.claude/skills/*|.claude/hooks/*)
    block "ハーネス本体ファイル ($FILE_PATH) は本セッションでは編集できません。 ハーネス改善は engineer モードで実施してください (.claude/settings.local.json に \"HARNESS_MODE\": \"engineer\" を設定して Claude Code を再起動)。"
    ;;
  */.claude/settings.json|.claude/settings.json)
    block "ハーネス本体ファイル ($FILE_PATH) は本セッションでは編集できません。 ハーネス改善は engineer モードで実施してください (.claude/settings.local.json に \"HARNESS_MODE\": \"engineer\" を設定して Claude Code を再起動)。"
    ;;
  */CLAUDE.md|CLAUDE.md)
    block "CLAUDE.md ($FILE_PATH) は本セッションでは編集できません。 ハーネス改善は engineer モードで実施してください (.claude/settings.local.json に \"HARNESS_MODE\": \"engineer\" を設定して Claude Code を再起動)。"
    ;;
esac

exit 0
