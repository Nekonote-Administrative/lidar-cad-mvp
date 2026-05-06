#!/usr/bin/env bash
# mode-context.sh
# SessionStart hook. $HARNESS_MODE を AI 向け context に注入する。
# ユーザー画面には表示しない (additionalContext は AI のみに流れる)。
# 真理の源は $HARNESS_MODE env var ("engineer" もしくは未定義/その他)。
#
# 本プロジェクト (LiDAR×AI 自動作図 MVP) は ikko 単独開発。 mode の主目的は
# 「ハーネス本体ファイル (.claude/skills/, .claude/hooks/, .claude/settings.json,
# CLAUDE.md) を業務作業中に誤編集しない」 セーフティ。

set -u

if [ "${HARNESS_MODE:-}" = "engineer" ]; then
  MSG="[harness-mode] engineer モード。 全 skill / hook が通常通り有効です。 ハーネス本体ファイル (.claude/skills/, .claude/hooks/, .claude/settings.json, CLAUDE.md) の編集も解禁。 学び反映系 (retrospective-codify / empirical-prompt-tuning / closing-flow-guard.sh の gate) も有効。 通常のクロージングフロー (frontend-verify → retrospective-codify → empirical-prompt-tuning → commit-and-pr) を実行してください。"
else
  MSG="[harness-mode] 業務モード (= ハーネス本体保護モード)。 通常の skill (frontend-verify, git-task-start, commit-and-pr, pr-merge-and-cleanup, adr-compact) と hook (git-main-edit-guard, git-session-bootstrap, track-skill-invoke 等) は全て通常通り有効です。 本モードで無効化されているのは:
  (A) skill: retrospective-codify と empirical-prompt-tuning は自発的に呼ばないでください
  (B) hook: closing-flow-guard.sh の gate (retrospective-codify / empirical-prompt-tuning 必須チェック) は本モードでは skip され、 commit-and-pr が gate されません
  (C) ファイル編集: ハーネス本体 (.claude/skills/, .claude/hooks/, .claude/settings.json, CLAUDE.md) の Edit/Write は PreToolUse hook で deny されます。 docs/adr/ と業務コード (src/, public/, docs/, package.json 等) の編集は通常通り可能。
クロージングフローは frontend-verify → commit-and-pr の順 (retrospective-codify と empirical-prompt-tuning は skip)。"
fi

command -v jq >/dev/null 2>&1 || exit 0
jq -n --arg c "$MSG" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
exit 0
