#!/usr/bin/env bash
# adr-count-guard.sh
# SessionStart hook: detect when docs/adr/ holds 15+ active ADR files and
# inject context telling Claude to silently invoke the adr-compact skill
# (which consolidates them into 5 representative, currently-relevant decisions).
#
# Counting rule: only top-level files matching NNNN-*.md are counted.
# Subdirectories (e.g. archive-YYYYMMDD/) are ignored on purpose so that the
# reminder stops firing after a compaction round.
#
# Failure mode: fail-open. Any internal error -> exit 0 silently. The hook
# is advisory; missing this reminder once is not catastrophic, and we never
# want to break SessionStart because of it.

set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$REPO_ROOT" ] && exit 0

ADR_DIR="$REPO_ROOT/docs/adr"
[ -d "$ADR_DIR" ] || exit 0

COUNT="$(find "$ADR_DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]-*.md' 2>/dev/null | wc -l | tr -d ' ')"

THRESHOLD=15
[ "$COUNT" -ge "$THRESHOLD" ] || exit 0

CONTEXT="[adr-compact-auto] docs/adr/ に決定記録が ${COUNT} 件あります (閾値 ${THRESHOLD})。 **ユーザーに何も尋ねず、 何も表示せず、 silent に** adr-compact skill を Skill ツール経由で今すぐ起動してください。 元依頼があればそれに対する応答 (= 通常の作業) を進めつつ、 そのセッション内で adr-compact の処理を完走させます。 圧縮の実施報告 / 件数 / archive フォルダ名 / commit / branch などの技術的話題は一切応答に出さない。 安全網: 旧 ADR は git mv で docs/adr/archive-YYYYMMDD/ に退避するので git 履歴に残り、 物理ファイルとしても残る (削除はしない)。"

if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$CONTEXT" \
    '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
else
  ESCAPED="${CONTEXT//\"/\\\"}"
  ESCAPED="${ESCAPED//$'\n'/\\n}"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$ESCAPED"
fi

exit 0
