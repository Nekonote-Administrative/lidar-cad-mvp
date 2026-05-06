---
name: commit-and-pr
description: 現在のブランチに溜まった変更をまとめて Git コミットし、 GitHub にプッシュして Pull Request を作成する end-to-end skill。 ユーザーが「コミットして」「commit して」「PR 作って」「プルリク作って」「github に上げて」「変更を保存して」「現在の状態を確定」「pr 出して」「ブランチを push して」「変更を反映して」等と発話した瞬間に必ず発動する。 機械的に `git commit && git push && gh pr create` を打つのではなく、 (1) シークレット混入防止、 (2) main 直 push 回避、 (3) 既存コミット履歴に揃えたメッセージ生成、 (4) pre-commit hook 失敗時の正しいリカバリ (amend ではなく新コミット)、 (5) ユーザー向けの業務語彙レポート、 を毎回必ず実施する。 単に「いまの差分を見せて」「git status は?」のような読取要求では発動しない。
---

# Commit & PR

「変更を確定して PR を出して」 を **取り違えやすい落とし穴を避けながら** end-to-end で進めるための skill。

## なぜ必要か

「コミットして PR 作って」 は一見単純だが、 短いコマンド列の各所に**過去に踏んだ落とし穴**が並んでいる:

- `.env.production` や `service-account*.json` を `git add .` で巻き込み、 シークレットを公開リポジトリに push してしまう
- `feat/*` ブランチではなく `main` で作業していたのに気付かず直 commit + push してしまう
- pre-commit hook (lint / type check) が失敗したのを `--no-verify` で回避し、 壊れたコードを main に流す
- pre-commit hook が落ちて commit が成立していないのに、 「直前のコミットに対して」 `git commit --amend` を打って **過去の正常コミットを破壊**する
- 既存コミット履歴は Conventional Commits 風 (`feat: bootstrap Next.js 16 app with minimal landing`) なのに、 突然それと違うスタイル (英語 sentence-case 等) で書き始めて履歴を揺らす
- PR 本文に変更全体ではなく**直近 1 コミット分**しかまとめず、 reviewer がブランチ全体の意図を読み取れない
- 説明が冗長で本質が埋もれる: 数字だけ (`52 files changed, +1234 -567`) や生コマンド (`gh pr create --fill --base main --head feat/foo`) ばかりを返してしまい、 何が変わったかが分からない

これらは個別には小さなミスだが、 一度やると 「リポジトリにシークレットが残った」「履歴が壊れた」「main が壊れた」 など**取り返しがつかない**。 本 skill は毎回必ず通す **チェックリスト**として機能する。

## 必須ステップ

順番に実行する。 飛ばさない。

### Step 0: worktree path の解決 (毎回最初に)

このセッションが隔離 worktree で動いているかを `.claude/sessions/<session_id>/wt.json` で判定し、 以降の **全ての git / build 操作の対象パス** を `$WT` に固定する。 これを最初に決めないと、 cwd の git (= main 側) を誤って触ってしまう。

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"

# session_id は SessionStart hook 注入の context (`[claude-session] session_id=...`) から拾う
SESSION_ID="<context から取得>"
WT_JSON="$REPO_ROOT/.claude/sessions/$SESSION_ID/wt.json"
if [ -f "$WT_JSON" ] && command -v jq >/dev/null 2>&1; then
  WT="$(jq -r '.worktree_path // empty' "$WT_JSON")"
  [ -d "$WT" ] || WT=""
else
  WT=""
fi

# Marker が無い (旧式セッション) → cwd の repo を従来通り使う
[ -z "$WT" ] && WT="$REPO_ROOT"
```

以降のステップでは `git` 操作はすべて `git -C "$WT" ...`、 build / push 系は `( cd "$WT/<subdir>" && ... )` のサブシェルで実行する。 cwd の git は触らない。

### Step 1: 並列で現状把握

最初に **3 つを必ず並列で**取得する (順次にしない — レイテンシ無駄):

```bash
git -C "$WT" status            # 未追跡 / 変更ファイル一覧 (※ -uall は禁止 — 大規模リポで OOM)
git -C "$WT" diff              # staged + unstaged の差分
git -C "$WT" diff --staged     # 既に stage 済みの差分 (Step 4 でメッセージ生成に必要)
git -C "$WT" log --oneline -10 # 既存コミットの message スタイル参照
git -C "$WT" branch --show-current  # 現在ブランチ
```

得た情報から次を判定:

| 観点 | 判定 |
|---|---|
| **変更ファイル数** | 0 → 既に最新まで commit 済み → Step 6 へ skip (push + PR のみ) |
| **現在ブランチ** | `main` / `master` → Step 2 で **必ずユーザー確認** |
| **コミット履歴のメッセージ言語** | 英語が主流なら英語 sentence-case で生成、 日本語混じりなら同様に追従 |
| **シークレット候補** | `.env*` / `*credentials*` / `service-account*.json` / `*.pem` / `*.key` が変更/新規にあるか |

### Step 2: ブランチ安全性チェック

| 状態 | 振る舞い |
|---|---|
| feature ブランチ (`feat/*` `fix/*` `chore/*` 等) で変更あり | そのまま続行 |
| `main` / `master` で**未コミットの変更あり** | **ユーザーに確認**: 「今 `main` にいます。 新しいブランチを切ってからコミットしますか? それとも main に直接コミットしますか?」 — ユーザー指示があるまで作業しない |
| `main` / `master` で**既にコミットあり (push されてない)** | 同上。 「main にコミットが積まれています。 これを feature ブランチに移してから push しますか?」と確認 |
| detached HEAD | 進めない。 「今ブランチに紐付かない状態 (detached HEAD) です。 どのブランチで作業を続けますか?」と問う |

main 直 push は技術判断ではなく**業務リスク** (production 配信 / 共有環境への影響) なので、 ユーザーに必ず確認する。

### Step 3: シークレット混入防止

`.env*` / `*credentials*` / `service-account*.json` / `*.pem` / `*.key` / `id_rsa*` 等が staged または untracked に含まれていたら:

1. **stage しない** (`git add` の対象から外す)
2. ユーザーに **業務語彙で**警告: 「設定ファイル (◯◯) には認証情報が含まれている可能性があります。 これは公開リポジトリには上げません。 念のためご確認ください。」
3. ユーザーが「これは安全だから含めて」と**明示的に**指示した場合のみ含める

`.gitignore` に既に登録されているはずだが、 過去に追跡開始してしまったケースもあるので **必ず実物の差分を見て**判定する。

### Step 4: ステージングとコミットメッセージ生成

#### 4a. ステージング

`git add -A` / `git add .` は **使わない** (Step 3 のシークレット除外を**ファイル単位で**確実にやるため)。 必要なファイルだけ列挙して `git -C "$WT" add path1 path2 ...` で stage する (パスは worktree 内の相対パス)。

#### 4b. コミットメッセージ作成

直前で取得した `git log --oneline -10` のスタイルに**揃える**。 本リポの現状は Conventional Commits 風 (`feat: bootstrap Next.js 16 app with minimal landing`、 `chore: init repo with gitignore and stub README`)。 ただし `git log` の実態に合わせて毎回判断 — 既存履歴が変わったら追従する。

メッセージ規則:
- **1 行目 (件名)**: 50-72 字。 動詞の現在形で始める (`Add` / `Update` / `Fix` / `Remove` / `Refactor`)
- **本文**: 必要なら 1 行空けて 2-5 行。 「何を」 ではなく **「なぜ」** を中心に
- **末尾**: 必ず以下を含める (Claude Code 規約):

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

#### 4c. コミット実行

ヒアドキュメントで `-m` に渡す (改行 / 引用符の崩れ防止):

```bash
git -C "$WT" commit -m "$(cat <<'EOF'
Add commit-and-pr skill for end-to-end PR creation

Captures the recurring "save my work and open a PR" workflow into a
checklist that prevents secret leaks, main-branch direct pushes, and
amend-on-failed-hook history corruption.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Step 5: pre-commit hook 失敗時の正しいリカバリ

pre-commit hook (lint / type check / test) が落ちて commit が**成立しなかった**ときは:

1. **絶対に `git commit --amend` を打たない** — amend は **直前の正常コミット**を書き換える。 失敗 hook の影響で「壊れたコミット」がまだ存在しないので、 amend すると過去の他人の/自分の正常コミットを破壊する
2. hook が報告したエラーを読み、 **根本原因を直す** (lint エラーを実際に修正、 typo を直す、 型を合わせる)
3. 修正したファイルを再 stage し、 **新しい commit を作る** (`git -C "$WT" commit -m ...`)
4. `--no-verify` での回避は禁止。 hook はユーザーが明示的に「この hook は今回スキップで」と言わない限り通す

ユーザー報告 (業務語彙):
> 自動チェック (lint) でエラーが出ました。 「◯◯ という関数の型が合っていない」と言っています。 直してから再コミットしますか?

### Step 6: push と upstream 設定

```bash
# upstream 未設定なら -u で設定しつつ push
git -C "$WT" push -u origin <現在のブランチ名>
```

既に upstream 設定済みなら `git -C "$WT" push` のみで OK。 `git push --force` は**絶対に勝手に打たない** (rebase 後など履歴が分岐したケースは**ユーザーに確認**してから `--force-with-lease` を使う)。

認証エラー (`Permission denied` / `403`) が出た場合:
- `gh auth status` で状態確認
- 期限切れなら `gh auth login` を案内
- 「**自分で別経路を試さず**ユーザーに承認を求める」 ([CLAUDE.md グローバル戦略](~/.claude/CLAUDE.md) — 許可が下りないときの振る舞い)

### Step 7: PR 作成

`gh pr create` を **HEREDOC で本文を渡して**実行する。

#### 7a. base ブランチ判定

- 現在ブランチが `main` / `master` 以外 → base は `main` (デフォルトの流れ)
- 既に同じ head ブランチで PR が**存在する**場合 → 新規作成しない。 既存 PR の URL を返して終わり (`gh pr view --json url -q .url`)

存在チェック:

```bash
gh pr list --head "$(git -C "$WT" branch --show-current)" --json url -q '.[0].url'
```

`gh pr` は cwd の git 設定 (remote 等) を読むので、 cwd と worktree が同じ remote を共有しているなら cwd で実行して問題ない。 念のため `( cd "$WT" && gh pr ... )` で worktree から実行するとさらに安全。

#### 7b. タイトルと本文

タイトル: **70 字以内**、 件名スタイル (commit message の 1 行目に近い)。 詳細は body に書く。

本文テンプレ:

```markdown
## Summary
- <変更の要旨を 1〜3 行>
- <なぜ必要か / どの ADR や issue に紐付くか>
- <ユーザー影響 (UI / API / データ構造への影響があれば)>

## Test plan
- [ ] <手動 / 自動で検証する項目>
- [ ] <影響範囲 (例: 既存ルート / Server Action / middleware が動くか / build が通るか)>
- [ ] <ロールバック方針 (必要なら)>
```

実行例 (`gh pr create` は worktree 配下から実行 — base ブランチ判定が確実になる):

```bash
( cd "$WT" && gh pr create --title "Add commit-and-pr skill" --body "$(cat <<'EOF'
## Summary
- Capture the "commit + push + PR" workflow into a skill that runs the
  same checklist every time (secret guard, branch guard, message style,
  hook-failure recovery)
- Reduces repeated mistakes that have actually happened in past sessions

## Test plan
- [ ] Skill triggers on "コミットして PR 作って" / "プルリク作成"
- [ ] Skill does NOT trigger on read-only requests like "git status を見せて"
- [ ] On main branch, skill asks before committing
- [ ] Skill flags `.env*` / service-account*.json staging attempts

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" )
```

末尾の `🤖 Generated with ...` は Claude Code 規約で必須。 サブシェル `( ... )` は worktree から `gh pr create` を実行するためのもので、 必ず `)` で閉じる。

#### 7c. PR URL を取得

`gh pr create` が標準出力に URL を返すので、 それを **そのまま** Step 8 のレポートに使う。

#### 7d. PR conflict 自動検知 + 解消

PR 作成 (新規 / 既存への push) **直後** に必ず実行する。 PR が main / master に対して conflict / behind / outdated 状態だと、 ユーザーが merge button を押せない / レビューできないため、 AI 側で先回りして解消する。

##### 7d.1 検知

```bash
PR_URL=$(gh pr list --head "$(git -C "$WT" branch --show-current)" --json url -q '.[0].url')
PR_NUM=$(echo "$PR_URL" | sed 's#.*/##')
gh pr view "$PR_NUM" --json mergeStateStatus,mergeable,baseRefName -q '. | {state: .mergeStateStatus, mergeable: .mergeable, base: .baseRefName}'
```

`mergeStateStatus` の値と意味:

| 値 | 意味 | 振る舞い |
|---|---|---|
| `CLEAN` | 競合なし、 即マージ可能 | そのまま終了 (Step 8 へ) |
| `BEHIND` | base に新コミットあり、 fast-forward 可能 | **AI 側で fetch + rebase + push --force-with-lease** |
| `BLOCKED` | review 必須 / required check 失敗 等の policy block | code 競合ではないので**そのまま** (ユーザーに「reviewer 待ち / CI 待ち」 と伝える) |
| `DIRTY` | 真の merge 競合 | **AI 側で fetch → rebase 試行 → 競合ファイル単位で安全自動解消 → 解消できなければ rebase --abort + ユーザー相談** |
| `UNKNOWN` / `null` | GitHub が計算中 | 数秒待って再取得 (max 3 回 retry) |

##### 7d.2 自動解消フロー (BEHIND / DIRTY)

```bash
git -C "$WT" fetch origin
git -C "$WT" rebase "origin/$(gh pr view $PR_NUM --json baseRefName -q .baseRefName)"
```

- **rebase が conflict なしで完了**: `git -C "$WT" push --force-with-lease` (他人の push を踏まないので安全)
- **rebase 中に conflict 発生**:
  1. `git -C "$WT" status -s` で conflict ファイル一覧
  2. ファイル単位で安全自動解消可否を判定:
     - **両方追加 (`AA`)** で **同じ section に同じ内容** → 片方残せば良い (e.g. import 文の重複)
     - **片方の変更のみ** で他方が無変更 (`UU` で片方の hunk が空) → そっちを採用
     - **binary file (xlsx 等)** で「自分が更新した方が新しい」が明確 → `git -C "$WT" checkout --theirs <file>`
     - 上記以外 (両側で実質的に異なる編集) → 自動解消しない
  3. 自動解消不可な conflict が 1 つでもあれば: `git -C "$WT" rebase --abort` → Step 8 を「conflict 解消依頼」 モードで出す
  4. 全部安全自動解消できたら: `git -C "$WT" add -A` → `git -C "$WT" rebase --continue` → `git -C "$WT" push --force-with-lease`

##### 7d.3 自動解消で禁止すること

- 両側で実質変更があるファイルを片方の側に倒す (= ユーザーの commit を捨てる / 反対側の意図を捨てる)
- `git checkout --theirs <file>` / `--ours <file>` の盲目使用 (全 hunk を片方に倒すので危険)
- `git push --force` (`--force-with-lease` 必須)
- `main` ブランチへの直 push / force push

##### 7d.4 報告フォーマット

| 状況 | ユーザーに何を伝えるか |
|---|---|
| `CLEAN` | 「conflict なし、 そのまま merge できます」 |
| `BEHIND` 自動解消済 | 「main に新しい変更が入っていたので取り込みました。 conflict なくマージできます」 |
| `DIRTY` 自動解消済 | 「自動で取り込んで競合を解消しました。 マージできます」 |
| `DIRTY` 自動解消不可 | 「main の変更とぶつかっていて自動で直せない箇所がありました。 (具体的にどのファイルのどこが) — どちらを残すか教えてください」 |
| `BLOCKED` (review / CI) | 「conflict はありませんが、 reviewer 確認 / 自動チェック待ちの状態です」 |

### Step 8: ユーザー向けレポート (業務語彙)

ユーザーは非技術者。 [プロジェクト CLAUDE.md の語彙ルール](../../../CLAUDE.md) に従い、 **以下を出さない**:

- 生コマンド (`git push -u origin feat/foo`)
- ファイルパス羅列 (`src/app/dashboard/layout.tsx`, `src/lib/supabase/server.ts`)
- diff 統計の生数値 (`52 files changed, +1234 -567`) ← **個数の概算は OK** だが、 +/- の細かい数字は不要
- ブランチ名 / コミット hash
- 用語: `staged` / `upstream` / `rebase` / `head` / `base` / `force-with-lease`

代わりに使える業務語彙: 「変更を保存しました」 「github に反映しました」 「レビュー用のページ (PR) を作りました」 「設定ファイルは含めませんでした」 「自動チェックは全部通りました」

レポート例:

```
変更を保存して GitHub にレビュー用のページ (PR) を作りました。

- 変更内容: ログイン画面に email validation エラー表示を追加
- 影響したファイルの数: 約 4 件 (主に src/app/(auth)/ まわり)
- 認証情報を含むファイルは含めていません
- レビュー URL: https://github.com/Nekonote-Administrative/lidar-cad-mvp/pull/42
  ※ Vercel が PR ごとに preview を自動デプロイします (Checks タブで URL 確認可能)

**現在の変更を本番に反映してよいですか?** (「はい」 で main にマージ → Vercel が本番反映、 古い作業場所も片付けます)
```

数字 ("約 7 件") は概算で OK。 ユーザーが knowing する必要があるのは **「やったこと / リスク有無 / URL / 反映確認」**の 4 つ。

末尾の本番反映確認は **必ず付ける**。 これが `pr-merge-and-cleanup` skill の発動トリガー (「はい」 等の承認返答) を呼び込む入口。

## 発動条件のサンプル

### 発動する (✅)

- 「コミットして」 (差分があるとき)
- 「commit して PR 作って」
- 「プルリク作成」
- 「変更を確定して」
- 「github に上げて」
- 「現在の状態を保存」
- 「pr 出して」
- 「変更を反映して」
- 「ブランチを push して」

### 発動しない (❌)

- 「git status を見せて」 (読取のみ)
- 「いまの差分を確認したい」 (読取のみ)
- 「最新のコミット履歴を 10 件見せて」 (読取のみ)
- 「PR の状態を確認して」 (読取のみ; `gh pr view` で済む)
- 「Vercel の preview を確認」 (`vercel inspect` で済む読取系)
- 「Supabase のスキーマを反映」 (本 skill 範囲外、 別途 supabase migration)

## エッジケース

- **変更が一切ない**: commit step を skip し、 「保存すべき変更はありませんでした」 と報告 + そのまま push (未 push の commit がある場合) + PR (未作成の場合)
- **既に PR がある**: 新規作成せず、 既存 PR の URL を返す。 「同じブランチの PR が既にあります: <URL>」
- **conflict が出ている**: rebase / merge を**勝手に試みない**。 ユーザーに「`main` と差分がぶつかっています。 どちらを優先しますか?」と問う
- **ユーザーが scope を絞った場合** (例: 「`docs/adr/` の変更だけコミットして」): `git add` のときに該当パスのみ stage、 他のファイルは触らない
- **複数の論理的に独立な変更がある**: 1 PR に詰め込まず、 ユーザーに「このコミットは A と B の 2 つの独立変更を含みます。 分けて PR を作りますか?」と確認 (簡単化方針: ユーザーが「分けなくていい」と言ったら 1 PR で OK)
- **`gh` 認証切れ**: 自分で別経路を試さず、 `gh auth login` を案内してユーザー対応待ち

## 制約

- **deploy はやらない**: 本 skill は git/GitHub 操作のみ。 Vercel deploy は GitHub 連携で自動 (本 skill が PR を作ると Vercel が preview deploy、 main マージで本番 deploy)
- **既存コミットの書き換えはやらない**: amend / rebase / reset は本 skill が勝手に発動しない (ユーザー明示指示時のみ)
- **force push は勝手にやらない**: `--force` / `--force-with-lease` はユーザー明示指示時のみ
- **シークレット ファイルは絶対に stage しない**: ユーザーが「含めて」と明示しない限り `.env*` 等は除外

## 関連 skill / ルール

- [プロジェクト CLAUDE.md - ユーザー応答の語彙](../../../CLAUDE.md) — ユーザー向け語彙ルール (本 skill の Step 8 で必須)
- [プロジェクト CLAUDE.md - セッション git ハイジーン](../../../CLAUDE.md) — 本 skill の前段 (`git-task-start`) と後段 (`pr-merge-and-cleanup`) を必須化するルール
- [`~/.claude/CLAUDE.md` - 許可が下りないときの振る舞い](~/.claude/CLAUDE.md) — 認証エラー時に勝手に迂回しないルール
- `git-task-start` skill — 本 skill の **前段**。 main にいる時に編集系指示で発動し、 ブランチ準備を担当
- `pr-merge-and-cleanup` skill — 本 skill の **後段**。 Step 8 の「本番に反映してよいですか?」 への 「はい」 で発動
- `frontend-verify` skill — 本 skill の **前段** (Next.js src/ 編集セッションで CI 5 項目を先行通過)。 frontend-verify が本 skill を Step 7 で連鎖呼び出しする
