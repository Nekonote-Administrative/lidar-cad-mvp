@AGENTS.md

# LiDAR×AI 自動作図 MVP — CLAUDE.md

風営法 1 号 / 深夜酒類提供飲食店向けの図面作成を AI 補助で自動化する Web SaaS。 Next.js 14 App Router + Supabase + Vercel 構成。 ikko 単独開発。

設計ドキュメント (ADR / Phase plan) は **Google Drive 同期領域** (`~/マイドライブ/TaskShare/02_Note/20260506-01-LiDAR-CAD-店舗系許認可/`) に置く。 コードは GitHub `Nekonote-Administrative/lidar-cad-mvp` 集約。 各 skill の詳細手順 / 失敗モード / 実装例は `.claude/skills/<name>/SKILL.md` に格納。 着手前に毎回 SKILL.md を Read する (「もう知ってる」 で省略しない)。

---

## 🔴 skill 起動マッピング

> **モード分岐**: 下表の `retrospective-codify` と `empirical-prompt-tuning` は **engineer モードのみ** 有効 (詳細は本ファイル末尾)。 ハーネス本体ファイル (`.claude/skills/`、 `.claude/hooks/`、 `.claude/settings.json`、 `CLAUDE.md`) の Edit/Write も業務モードでは PreToolUse hook (`.claude/hooks/harness-edit-guard.sh`) で deny される。

| トリガー | 必須 skill / 動作 |
|---|---|
| 新タスク開始 (main + 編集指示 / main 編集 hook deny / worktree 外編集 hook deny / 「新規ブランチで」 発話) | `git-task-start` (silent: ブランチ + 隔離 worktree 作成 + session marker 書込) |
| ひと段落 + `src/**` に変更あり | `frontend-verify` (typecheck → lint → format:check → test → build → UI 目視確認) |
| ひと段落 (commit-and-pr の前、 **engineer モードでは毎セッション必ず例外なし**) | `retrospective-codify` (今回のセッションから skill 化すべき学びを抽出。 学びが無いセッションでも「採用候補なし」 と確定するために必ず起動) |
| `retrospective-codify` が skill 手順書 / CLAUDE.md / ast-grep ルールを採用 (= 編集) した | `empirical-prompt-tuning` (commit-and-pr の前、 engineer モードでは **必ず連鎖**。 採用 skill / ルールをバイアス無し subagent で実走評価して反復改善) |
| ひと段落 + 差分あり (常に最後) | `commit-and-pr` (末尾で「本番反映してよいですか?」 と問う) |
| 「本番反映してよいですか?」 への承認 / 「マージして」 等の指示 | `pr-merge-and-cleanup` (`gh pr merge` を直接打たない。 Vercel が main マージで自動本番反映) |
| `docs/adr/` が 15 件以上 (SessionStart hook が context に注入) | `adr-compact` (silent 自動起動。 ユーザー確認 / 通知なし。 旧 ADR を `docs/adr/archive-YYYYMMDD/` へ `git mv` + 集約 ADR を 5 件作成。 退避フォルダ + git 履歴で二段安全網) |

### クロージングフロー (ひと段落で自動完走)

SessionStart で `.claude/hooks/mode-context.sh` が `[harness-mode]` を context 注入する。 AI はその注入文脈に従い、 以下のいずれかを実行する。

**engineer モード** (= `HARNESS_MODE=engineer`):

```
ひと段落
  → frontend-verify (src/ 編集時のみ)
  → retrospective-codify (毎回必ず、 例外なし。 「学び無し」 でも起動して「なし」 と確定)
  → empirical-prompt-tuning (上記が skill / CLAUDE.md / ast-grep ルールを採用した時のみ、 必ず連鎖)
  → commit-and-pr → 「本番反映してよいですか?」
[ユーザー「はい」]
  → pr-merge-and-cleanup (auto-merge → main pull → 旧ブランチ削除 → Vercel が本番反映)
```

**業務モード** (= ハーネス本体保護モード、 デフォルト):

```
ひと段落
  → frontend-verify (src/ 編集時のみ)
  → commit-and-pr → 「本番反映してよいですか?」
[ユーザー「はい」]
  → pr-merge-and-cleanup (auto-merge → main pull → 旧ブランチ削除 → Vercel が本番反映)
```

**ゲート機構** (`.claude/hooks/closing-flow-guard.sh`): `commit-and-pr` skill 起動の **直前** に裏で検査が走る。 業務モードでは早期 exit して gate しない。 engineer モードでは (1) `retrospective-codify` がこのセッションで起動されていない場合は **必ずブロック** し起動指示を返す。 (2) このセッションで skill 手順書 / CLAUDE.md / ast-grep ルールを編集していて、 かつ `empirical-prompt-tuning` が起動されていない場合も **必ずブロック** し起動指示を返す。 起動状況は `.claude/sessions/<session_id>/skills-invoked.txt` に PostToolUse hook (`.claude/hooks/track-skill-invoke.sh`) が逐次記録する。

main 直 push / commit 残置 / ブランチ残置でセッション終了は禁止。

---

## 🔴 git ハイジーン

- **セッション間隔離 (worktree)**: 各 Claude Code セッションは `git-task-start` で **自分専用の隔離 worktree** (`.claude/worktrees/<branch>/`) を持つ。 セッション ↔ worktree マッピングは `.claude/sessions/<session_id>/wt.json` に記録。 これにより複数セッション同時利用でブランチが裏で切り替わる事故を防ぐ
- **cwd は変えない / 変えられない**: Claude Code の cwd は不変。 worktree 内での編集は `$WT/...` 絶対パス、 build / git 操作は `( cd "$WT/..." && ... )` / `git -C "$WT" ...` を使う
- **main 直接編集禁止 + worktree 外編集禁止**: PreToolUse hook (`.claude/hooks/git-main-edit-guard.sh`) が両方を deny。 deny されたら silent に `git-task-start` で新ブランチ + worktree 作成
- **PR マージ**: `pr-merge-and-cleanup` 経由のみ。 マージ後は worktree + session marker も自動掃除 (cwd 内側ケースは遅延キュー経由で次回 SessionStart hook が削除)
- **ブランチ削除**: `git worktree list` で他セッション利用チェック後に silent 削除
- **SessionStart hook** (`.claude/hooks/git-session-bootstrap.sh`) が origin fetch + main 最新性 + session_id + active worktree を context に注入し、 安全なら自動 fast-forward + orphan marker 掃除 + `git worktree prune` + 削除キュー (`.worktrees-to-delete`) 処理
- **cwd を含む dir を消す hook/skill は遅延キュー + 親 PWD ガード二重保護**: subprocess は親 cwd を変更できない。 自プロセス cwd を含む dir を物理削除すると後続 Bash の cwd recovery / MCP server env path 展開 (`Missing environment variables: _R%/`) / 同 dir 別セッション起動が連鎖崩壊する。 削除側は (1) cwd 内側なら main repo 配下の削除キュー (`$MAIN_REPO/.claude/sessions/.worktrees-to-delete`) に append、 cwd 外側なら即時削除、 (2) キュー消化側 (= 次回 SessionStart hook) は active session marker と親プロセス PWD env (`cd` 前に捕捉) の両方で対象を保護する。 marker ベース保護だけだと session_id 交替で抜けるので PWD ベースが必須
- **GitHub 前提**: Settings → Pull Requests → 「Automatically delete head branches」 ON

### ハーネス本体保護系の PreToolUse hook 設計指針

ハーネス本体ファイル (`.claude/skills/`、 `.claude/hooks/`、 `.claude/settings.json`、 `CLAUDE.md`) を保護する PreToolUse hook を書く時、 cwd 由来の REPO_ROOT で REL を計算する方式 (= `.claude/skills/*` の先頭マッチ) を **使ってはいけない**。 worktree 内のパス (= `.claude/worktrees/<branch>/.claude/skills/...`) は cwd の REPO_ROOT からの REL では `.claude/worktrees/...` で始まり、 先頭マッチに引っかからずに deny されないバグになる。

推奨実装: **文字列マッチ方式**: file_path 全体に対し `*/.claude/skills/*`、 `*/.claude/hooks/*`、 `*/.claude/settings.json`、 `*/CLAUDE.md` 等の部分マッチで判定。 file system 非依存で worktree 内 / 直下 / 相対パスを統一して扱える。 既存の `harness-edit-guard.sh` がこの方式。

---

## 🔴 デプロイ運用 (GitHub → Vercel 自動連携)

本プロジェクトの本番反映パスは **GitHub → Vercel 自動連携** に固定:

- main への push (= PR マージ) で Vercel が production deploy
- PR 作成で Vercel が preview deploy (PR ごとに固有 URL)
- ローカルから `vercel deploy --prod` を直接打つことはしない (経路二重化を防ぐ)
- vercel CLI は **読取系のみ許可** (`vercel ls`, `vercel inspect`, `vercel env ls`)
- 環境変数 (`NEXT_PUBLIC_SUPABASE_URL` 等) は (1) ローカル `.env.local`、 (2) GitHub Secrets、 (3) Vercel Environment Variables の **3 か所同期** が必要。 AI は `.env.local` を編集しない (値の管理はユーザー責務)

### Supabase 運用

- Supabase は **production 1 プロジェクトのみ** で MVP 期間運用 (Phase 6 以降に staging 分離検討)
- スキーマ変更は `supabase migration` で SQL ファイル化し、 GitHub Actions で reviewable に保つ
- `supabase db reset` / `supabase db push --linked` は AI が直接打たない (production を破壊しうる)
- Supabase Auth の URL Configuration は手動設定 (Phase 1 完了時に Vercel 本番 URL を Site URL / Redirect URLs に登録済の前提)

---

## 🔴 ハーネスモード切替 (engineer / 業務 の 2 モード)

`HARNESS_MODE` env var を真理の源として、 ハーネスは **engineer モード**と**業務モード**の 2 系統で動作する。

| モード | `HARNESS_MODE` | 用途 | 学び反映 | ハーネス本体編集 |
|---|---|---|---|---|
| engineer | `engineer` | ハーネス改善 / 設計判断の固定 | 有効 | 有効 |
| 業務 (デフォルト) | 未定義 / その他 | 通常の機能開発 | 無効 | 無効 |

**engineer モードへの切替**: `.claude/settings.local.json` (Git untracked) の `env` キーに `"HARNESS_MODE": "engineer"` を追加して Claude Code を再起動。 一度書けば永続。

```json
{
  "env": {
    "HARNESS_MODE": "engineer"
  }
}
```

**業務モード時の制約** (= デフォルト):
- `retrospective-codify` と `empirical-prompt-tuning` を自発的に呼ばない (ユーザー明示要求があっても、 「これは engineer モードでお願いします」 と返す)
- `closing-flow-guard.sh` の gate が skip される (= `commit-and-pr` 起動前の retrospective / empirical 必須チェックが無効)
- ハーネス本体ファイル (`.claude/skills/`, `.claude/hooks/`, `.claude/settings.json`, `CLAUDE.md`) の Edit/Write が `harness-edit-guard.sh` で deny される
- `docs/adr/` と業務コード (`src/`, `public/`, `docs/plans/`, `package.json`, `tsconfig.json` 等) の編集は通常通り可能

業務モードのデフォルト目的: 機能開発中の誤操作でハーネス自身が壊れることを防ぐ。 ハーネスを意図的に変更したいときだけ engineer モードに切り替える。

---

## 🔴 ADR 運用 (1 ファイル 1 決定 / Superseded 履歴管理)

設計判断は ADR (Architecture Decision Record) を 1 ファイル 1 決定で積み上げる形式で記録。 既存 ADR は `~/マイドライブ/TaskShare/02_Note/20260506-01-LiDAR-CAD-店舗系許認可/docs/adr/` に保管 (Phase 1 時点で 0001〜0008 が確定済み)。

> 詳細運用ルールは [`~/.claude/CLAUDE.md` グローバル戦略 - 要件確定時は要件定義書ではなく ADR を書く](~/.claude/CLAUDE.md) を参照。

要点:
- ファイル名: `NNNN-kebab-case-title.md` (NNNN は既存最大 + 1)
- Status: `Accepted` (デフォルト) / `Proposed` / `Deprecated` / `Superseded by ADR-XXXX`
- 決定変更時は **新 ADR 追加 + 旧 ADR の Status 書換** (Decision 欄を直接書き換えない)
- 15 件閾値で `adr-compact` が silent 自動起動

---

## 🔴 ユーザー応答ルール

ikko は本プロジェクトの単独開発者 (= 技術者本人)。 灯文舎ハーネス由来の「業務語彙オンリー」 ルールは適用しない:

- **必要な技術用語は使う**: ブランチ名 / コミット hash / build エラー詳細 / Vercel preview URL 等は出して OK
- **冗長性は避ける**: 数字羅列 (`52 files changed, +1234 -567`) や生コマンド列だけを返さない。 「何が変わったか + 影響範囲 + 次のアクション」 を簡潔に
- **失敗は隠さない**: build / typecheck / test 失敗は具体的なファイル + 行 + 原因 + 修正方針を 1〜2 文で返す
- **PR / Vercel preview の URL は必ず出す**: ikko が GitHub UI / Vercel Dashboard で確認する起点になるため

---

## 🔴 Phase 進行と関連リソース

- 親 README: `~/マイドライブ/TaskShare/02_Note/20260506-01-LiDAR-CAD-店舗系許認可/README.md`
- 全フェーズロードマップ: `~/マイドライブ/TaskShare/02_Note/20260506-01-LiDAR-CAD-店舗系許認可/docs/plans/00-roadmap.md`
- Phase 1 plan: `~/マイドライブ/TaskShare/02_Note/20260506-01-LiDAR-CAD-店舗系許認可/docs/plans/01-foundation.md`
- 既存 ADR (Phase 1 時点): 0001 (B2B / 店舗系許認可), 0002 (LiDAR + iOS 戦略), 0003 (MVP v1 機能スコープ), 0004 (並行カスタマーディスカバリー), 0005 (技術スタック), 0006 (Pricing), 0007 (法的責任 + ToS), 0008 (求積精度)

Phase 1 では Task 1, 2, 14 が完了済み。 Task 3 以降を本ハーネスの worktree + PR フローで進める。

---

## 関連

- [`AGENTS.md`](./AGENTS.md) — Next.js バージョン特有の注意 (training data 依存しない、 `node_modules/next/dist/docs/` を参照)
- [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — グローバル戦略 (許可拒否時の振る舞い / ADR 運用 / macOS shell 注意 / 並列 subagent 排他 / gcloud auth 副作用)
- [`.claude/skills/`](./.claude/skills/) — 各 skill の詳細手順
- [`.claude/hooks/`](./.claude/hooks/) — SessionStart / PreToolUse / PostToolUse hook 一式
