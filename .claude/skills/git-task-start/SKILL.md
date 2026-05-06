---
name: git-task-start
description: 新しい作業を始める前にローカル main を最新化し、 ユーザー指示文から英語 kebab-case のブランチ名を生成して、 そのブランチに紐づく **隔離 worktree (.claude/worktrees/<branch>/) を作成** し、 セッション ↔ worktree マッピングを `.claude/sessions/<session_id>/wt.json` に書き込む skill。 ユーザーが非エンジニアで git の存在を意識しない設計のため、 通知は出さず silent に動く。 発動条件は (1) main にいる状態で編集系指示 (Edit / Write / MultiEdit を呼び出すような変更要求) が来たとき、 (2) PreToolUse hook (`.claude/hooks/git-main-edit-guard.sh`) で main 編集 / 別 worktree 編集が deny された直後の自動リカバリ、 (3) 「新しい作業始めて」「新しいタスク」「新規ブランチで」 等の明示発話。 ✅ 「ステータス追加して」(main にいる時) ✅ 「新しい作業始めて」 ✅ main 編集が hook で弾かれた直後 ❌ 既に隔離 worktree で作業中の編集指示 (= 同セッションの marker が立っている) ❌ 「git status を見せて」 等の読取要求 ❌ commit-and-pr の入口として呼ばれる場合 (それは commit-and-pr 自体の責務)。
---

# git-task-start

新しいタスク開始時のブランチ + 隔離 worktree 準備を **silent に** 行う skill。 ユーザーは git の存在を意識しない設計なので、 通知は一切出さない。

## なぜ必要か

ユーザーはタスクごとに 「ログイン画面に email validation を追加して」 「dashboard layout のサインアウトボタンを直して」 といった**機能指示**で AI に依頼する。 AI はその裏で:

- **複数 Claude セッション間でのブランチ衝突を防ぐ**: 過去、 セッション A の `git switch -c` でセッション B の HEAD が裏で切り替わり、 別ブランチに commit してしまう事故が発生。 これを防ぐには、 各セッションが**自分専用の隔離 worktree**で作業する必要がある
- main 直接編集を避ける (PreToolUse hook で機械的にブロックされる)
- ローカル main を最新化してから新ブランチを切る (古い main からブランチを切ると後で conflict)
- ブランチ名を指示文から自動生成する (ユーザーが命名で迷わないように)

を毎回必ず通る必要がある。 これを毎回手書きすると忘れるので skill 化。

## このセッションが既に worktree を持っているか先に確認

**Step に入る前に必ず**: SessionStart hook が context に注入する以下を読む:

```
[claude-session] session_id=<UUID>
[claude-session] active_worktree=<absolute path>   ← これが既にあれば本 skill は不要
```

`active_worktree` 行がある場合 → 本 skill は何もせず終了 (silent)。 セッションは既にその worktree で動いている。

`session_id` 行が無い場合 → hook が動いていない異常状態。 ユーザーに「セッション初期化に失敗しているので一度 Claude を再起動してください」 と伝えて停止。

## 必須ステップ

順番に実行する。

### Step 1: 現状把握

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
CURRENT="$(git -C "$REPO_ROOT" branch --show-current)"  # detached なら空文字列
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git -C "$REPO_ROOT" rev-parse origin/main 2>/dev/null || true)"
git -C "$REPO_ROOT" status --porcelain | head -1   # dirty かどうか
git -C "$REPO_ROOT" rev-parse --verify origin/main >/dev/null 2>&1 && echo "main_remote=ok"
```

**判定**:

| 状況 | 振る舞い |
|---|---|
| **同セッションに active_worktree marker あり** | **本 skill は不要** (上の前置きセクション) |
| main 以外の feature ブランチ (cwd が repo root の場合) | **本 skill は何もせず終了** (silent)。 cwd の HEAD はそのままでも、 編集は marker 無しで legacy fallback (= main じゃなければ allow) で通る |
| **detached HEAD** で `HEAD == origin/main` | **正常な過渡状態** とみなして Step 2 へ (= `pr-merge-and-cleanup` で main が別 worktree に掴まれていた時の着地状態) |
| **detached HEAD** で `HEAD != origin/main` | 異常状態 → ユーザーに状況確認 (本 skill では自動修復しない) |
| main / master にいる | Step 2 へ進む |

### Step 2: ローカル main の fast-forward (worktree 在処を考慮)

main は **本 worktree で checked out されているとは限らない** (sub-agent や別セッションの worktree が掴んでいる場合)。 `git pull --ff-only` をいきなり呼ぶ前に、 main を保持している worktree を検出する。

```bash
git -C "$REPO_ROOT" fetch origin --quiet

CURRENT_WT="$REPO_ROOT"
MAIN_WT=""
wt=""
while IFS= read -r line; do
  case "$line" in
    "worktree "*) wt="${line#worktree }" ;;
    "branch refs/heads/main")
      MAIN_WT="$wt"
      break
      ;;
  esac
done < <(git -C "$REPO_ROOT" worktree list --porcelain)

if [ -z "$MAIN_WT" ]; then
  # main がどの worktree でも checked out されていない
  if [ "$CURRENT" = "main" ] || [ "$CURRENT" = "master" ]; then
    git -C "$REPO_ROOT" pull --ff-only --quiet
  else
    # detached HEAD on main commit のケース: main ref を直接更新
    git -C "$REPO_ROOT" fetch origin main:main --quiet 2>/dev/null || true
  fi
elif [ "$MAIN_WT" = "$CURRENT_WT" ]; then
  # cwd が main を持っている
  git -C "$REPO_ROOT" pull --ff-only --quiet
else
  # 別の worktree が main を掴んでいる: そちらで pull
  git -C "$MAIN_WT" pull --ff-only --quiet 2>/dev/null || true
fi
```

**`--ff-only` 失敗時**:
- ローカル main にコミットが乗っている (本来 hook で防いでいるが過去の履歴等で発生し得る) → 「main にローカル独自のコミットがあります」 とユーザーに状況を伝え、 自動修復しない (rebase / reset を勝手にしない)
- fetch が失敗 (認証 / ネットワーク) → 既存 [グローバル戦略 — 許可が下りないときの振る舞い](~/.claude/CLAUDE.md) に従い、 ユーザーに承認を求める

### Step 3: ブランチ名生成

ユーザー指示の**直近メッセージ** (skill が起動するきっかけになった発話) から英語 kebab-case を生成する。

#### プレフィックス

| 指示の性質 | プレフィックス |
|---|---|
| 機能追加 (新しい列 / シート / 集計項目 / UI 要素) | `feat/` |
| バグ修正 / 動作不具合の解消 | `fix/` |
| ドキュメント / 設定 / 雑務 | `chore/` |
| 既存コードの再構成・整理 (動作変更なし) | `refactor/` |
| ADR / skill / CLAUDE.md / docs 追加 | `docs/` |

#### 本体 (動詞 + 主名詞、 英語 kebab-case)

| 指示例 | 生成名 |
|---|---|
| ログイン画面に email validation を追加 | `feat/add-login-email-validation` |
| dashboard layout のサインアウトボタンを直して | `fix/dashboard-signout-button` |
| middleware の保護ルート判定を直して | `fix/middleware-protected-routes` |
| README を更新 | `chore/update-readme` |
| supabase クライアントのコードをきれいに | `refactor/supabase-client` |
| 新しい ADR を起こして | `docs/add-adr` |

#### 衝突時 (ブランチ名 OR worktree ディレクトリ のどちらかが既存)

ローカル / リモートに同名ブランチがある、 **または** `.claude/worktrees/<name>/` ディレクトリが既に存在する場合、 **末尾に `-2`, `-3` を付与して両方とも空くまで増やす**:

```bash
BASE_NAME="feat/add-status-reschedule"
NAME="$BASE_NAME"
WT_PATH="$REPO_ROOT/.claude/worktrees/$NAME"
i=2
while git -C "$REPO_ROOT" rev-parse --verify "$NAME" >/dev/null 2>&1 \
   || git -C "$REPO_ROOT" rev-parse --verify "origin/$NAME" >/dev/null 2>&1 \
   || [ -e "$WT_PATH" ]; do
  NAME="${BASE_NAME}-${i}"
  WT_PATH="$REPO_ROOT/.claude/worktrees/$NAME"
  i=$((i+1))
done
```

**既存ブランチに switch して再利用しない** — 過去の途中コミットを巻き込むリスクを避けるため毎回必ず新規作成。

### Step 4: 隔離 worktree 作成

```bash
mkdir -p "$(dirname "$WT_PATH")"
git -C "$REPO_ROOT" worktree add "$WT_PATH" -b "$NAME" origin/main
```

ポイント:

- `git worktree add` は **cwd の HEAD を一切動かさない**。 cwd で main にいる別セッションがあっても、 そのセッションは何も影響を受けない (これが本設計の核心)
- `-b "$NAME"` で新ブランチを `origin/main` から切って worktree に紐付ける
- worktree path に `/` を含む branch (例: `feat/foo`) でも git は intermediate dir を勝手に作るので問題ない

#### 失敗時の対処

| エラー | 原因 | 対処 |
|---|---|---|
| `fatal: '...' already exists` | 衝突回避ロジックが甘い (Step 3 の `-e` チェック漏れ) | `WT_PATH` を別名で再試行 |
| `fatal: not a valid object name 'origin/main'` | `git fetch` が走っていない | Step 2 から再実行 |
| `fatal: could not create work tree dir` | ディスクフル / 権限不足 | ユーザーに業務語彙で報告 「作業場所を確保できませんでした」 + 原因のログ添付 |

### Step 5: セッション marker 書込

worktree が作れたら、 **すぐに** session marker を書く。 これが PreToolUse hook の判断材料になり、 以降の Edit/Write/MultiEdit が worktree 配下に強制される。

```bash
SESSION_ID="<SessionStart context から拾った [claude-session] session_id=... の値>"
mkdir -p "$REPO_ROOT/.claude/sessions/$SESSION_ID"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
cat > "$REPO_ROOT/.claude/sessions/$SESSION_ID/wt.json" <<EOF
{
  "worktree_path": "$WT_PATH",
  "branch": "$NAME",
  "created_at": "$TS"
}
EOF
```

書込が成功した時点で worktree 隔離が **発効**。 直後の Edit / Write は worktree 配下のみ通る。

### Step 6: 以降の AI の振る舞い (重要)

**cwd は変えない / 変えられない** (Claude Code の制約)。 cwd は repo root のまま。 以降:

- **ファイル編集 (Edit/Write/MultiEdit)**: 必ず **絶対パスで `$WT_PATH/...` を指定**する。 例: `$WT_PATH/src/app/(auth)/login/page.tsx`
- **ファイル読取 (Read/Glob/Grep)**: worktree 配下を読む場合は同じく `$WT_PATH/...` で絶対指定。 main 側のファイルを参考に読みたい場合 (例: 履歴比較) は cwd 相対 / 別パスで OK (Read は強制対象外)
- **git 操作**: 必ず `git -C "$WT_PATH" ...` を経由する (cwd の git は触らない)
- **build / test / dev サーバー**: 必ず `( cd "$WT_PATH/<subdir>" && <cmd> )` のサブシェルで実行 (cwd を汚さない)
- **vercel CLI 操作 (読取系のみ)**: 同じくサブシェル経由で worktree 内のディレクトリで実行 (deploy 系は GitHub 連携経由なので AI が直接打たない)

**dirty な working tree が cwd 側にあった場合** (PreToolUse hook ブロック後のリカバリ等): cwd の dirty 変更は **新 worktree には持ち越されない**。 hook で deny されたエッジは元々書込が成立していないので問題なし。 もし cwd 側に既に書込済みの dirty ファイルが残っていたら、 ユーザーに状況を確認 (本 skill では自動移送しない)。

### Step 7: 過去マージ済ブランチ + 孤児 worktree の遅延 cleanup (おまけ)

`pr-merge-and-cleanup` で `--auto` 待機中だった PR が後でマージされ、 旧ブランチ + worktree が残っているケースを回収する。

```bash
git -C "$REPO_ROOT" fetch origin --prune --quiet  # 削除済 remote branch 情報を更新
for branch in $(git -C "$REPO_ROOT" branch --merged main 2>/dev/null | grep -vE '^\*|^[[:space:]]*(main|master)$' | xargs); do
  # worktree でまだ使われているなら skip (= 別セッションが現役)
  if git -C "$REPO_ROOT" worktree list --porcelain | grep -q "branch refs/heads/$branch$"; then
    continue
  fi
  pr_state="$(gh pr list --head "$branch" --state merged --json mergedAt -q '.[0].mergedAt' 2>/dev/null)"
  if [ -n "$pr_state" ] && [ "$pr_state" != "null" ]; then
    git -C "$REPO_ROOT" branch -D "$branch" 2>/dev/null
    # 孤児 worktree ディレクトリがあれば一緒に掃除
    orphan_wt="$REPO_ROOT/.claude/worktrees/$branch"
    if [ -d "$orphan_wt" ]; then
      git -C "$REPO_ROOT" worktree remove "$orphan_wt" --force 2>/dev/null \
        || rm -rf "$orphan_wt"
      # 空になった親ディレクトリ (.claude/worktrees/feat/ 等) を best-effort で削除
      rmdir "$(dirname "$orphan_wt")" 2>/dev/null
    fi
  fi
done
```

失敗しても本 skill 全体を止めない (ベストエフォート)。

### Step 8: 完了

**ユーザーへの通知は出さない**。 そのまま元の編集作業に進む (絶対パス `$WT_PATH/...` で)。

## 発動条件のサンプル

### 発動する (✅)

- ユーザー:「ログイン画面のバリデーションを直して」 (cwd 現在 main、 同セッションに active_worktree marker 無し)
- ユーザー:「dashboard に saved drawings 一覧を追加して」 (同上)
- ユーザー:「新しい作業始めて」 / 「新規ブランチで」 / 「別タスクお願い」
- PreToolUse hook が main 編集を deny した直後の AI 内部自動リカバリ
- AI が main にいて 「Edit / Write / MultiEdit を呼ぶ」 と判断した瞬間

### 発動しない (❌)

- **同セッションに既に active_worktree marker がある**: 本 skill 不要、 そのまま既存 worktree で続行
- 既に feature ブランチで作業中で marker 無し (cwd 移動していない旧式ケース): 本 skill は silent に終了 — 編集は legacy fallback (main じゃなければ通る) で進む
- 「git status を見せて」 / 「最新 PR どうなった?」 (読取のみ)
- 「Vercel preview を確認して」 (読取系、 git ブランチ作成不要)
- commit-and-pr の入口として呼ばれた場合 (commit-and-pr 自体が主担当)

## エッジケース

- **dirty working tree で main にいる**: hook block 後のリカバリ等で発生。 hook deny された Edit は成立していないので dirty にならない。 もし cwd 側に dirty な編集が残っていたら、 ユーザーに状況確認 (本 skill では自動移送しない)
- **`origin/main` が無い** (新規リポジトリ等): fetch を skip し、 ローカル main からそのまま分岐 (`-b "$NAME" main`)
- **`main` も `master` も無い**: 異常 — ユーザーに状況確認 (本 skill では自動修復しない)
- **ユーザー指示が極端に短い** (「直して」 等): 直前の文脈から推測。 推測できなければ `feat/task-YYYYMMDD-HHMMSS` のタイムスタンプ命名にフォールバック
- **`gh` 未インストール**: Step 7 (過去マージ済 cleanup) を skip。 メイン処理は続行
- **session_id が context に無い**: hook が動いていない or 古い install。 ユーザーに「セッション初期化に問題があるので Claude を再起動してください」と伝えて停止 (worktree 隔離が効かない状態で進めない)
- **`.claude/worktrees/<name>/` ディレクトリが既存** (前回中断で残骸): Step 3 の `-e` チェックで `-2` サフィックス付与
- **ディスクフル / `worktree add` 失敗**: ユーザーに業務語彙で報告 「作業場所を確保できませんでした。 メモリ容量を確認していただけますか?」 + 内部ログ添付

## 制約

- **silent に動く**: ユーザーへの通知は出さない (CLAUDE.md ユーザー応答の語彙ルール)
- **既存ブランチに switch しない**: 必ず新規作成
- **既存 worktree に attach しない**: 必ず新規作成
- **rebase / reset を勝手にしない**: 異常検出時はユーザーに相談
- **commit / push はしない**: 本 skill はブランチ + worktree 準備のみ。 commit / push / PR は `commit-and-pr` の責務
- **cwd を変えない / 変えられない**: Claude Code セッションの cwd は不変。 worktree 内での操作は絶対パス + サブシェル `cd` で行う

## 関連 skill / ルール

- [プロジェクト CLAUDE.md - セッション git ハイジーン](../../../CLAUDE.md) — 本 skill の発動を必須化するルール
- `.claude/hooks/git-session-bootstrap.sh` — SessionStart で session_id + active_worktree を context に注入
- `.claude/hooks/git-main-edit-guard.sh` — marker を読んで worktree 外編集を deny + main 編集を deny
- `commit-and-pr` skill — 本 skill で切った worktree で作業完了 → そちらが PR 作成を担当 (worktree 内の git 操作)
- `pr-merge-and-cleanup` skill — 本 skill の対になる「タスク終了時」 skill。 worktree と marker を一緒に掃除
