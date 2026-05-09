---
name: pr-merge-and-cleanup
description: 現在のブランチで作成された PR を main にマージし、 ローカル main を最新化、 マージ済みブランチを削除する end-to-end skill。 動作は (1) `gh pr merge --squash --auto --delete-branch` で PR をマージ予約、 (2) ローカル main を fast-forward pull、 (3) `git worktree list` で他セッション利用をチェック、 (4) 安全な場合のみ旧ブランチを削除、 (5) ユーザーに業務語彙で結果報告。 発動条件は (a) 直前の AI 発話に「本番に反映してよいですか?」 「マージしてよいですか?」 等の確認文が含まれた直後の「はい」「OK」「お願い」「反映して」 等の承認返答、 (b)「マージして」「PR を取り込んで」「本番に反映」 等の単独明示指示。 ✅ AI が反映確認した直後の「はい」 ✅ 「マージして」 ✅ 「本番に反映」 ✅ 「PR を取り込んで」 ❌ 文脈不明の単独「はい」 (直前 AI 発話に「反映」「マージ」 等が無い) ❌ commit-and-pr 完了前 (PR がまだ存在しない) の発動 ❌ 「PR の状態を確認して」 等の読取要求。
---

# pr-merge-and-cleanup

PR 承認後のマージ + 後片付けを end-to-end で行う skill。 ユーザーが 「本番に反映していいですか?」 への 「はい」 だけで、 マージ → ローカル main 同期 → 旧ブランチ削除まで完結させる。

## なぜ必要か

ユーザーは:
- GitHub の merge ボタンを自分で押さない
- ローカル main を pull する用語を知らない
- 古いブランチが残っているかを気にしない

これら全てを AI が裏で完結させる必要がある。 一方で、 マージは**不可逆な本番反映**なので、 機械的に毎回同じチェックリストを通る。

## 発動の前提

本 skill が呼ばれる時点で:

1. 現在のブランチで PR が**既に作成済**であること (`commit-and-pr` を通った後)
2. 直前の AI 発話に「本番に反映してよいですか?」 等の確認文があった、 またはユーザーが明示的に「マージして」 と発話した

PR が無い場合は本 skill ではなく `commit-and-pr` を起動する。

## 必須ステップ

順番に実行する。

### Step 0: worktree path の解決 (毎回最初に)

このセッションが隔離 worktree で動いているかを `.claude/sessions/<session_id>/wt.json` で判定する。 以降の git 操作は **すべて `$WT` 経由**で行う (cwd の git は触らない)。

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"

# session_id は SessionStart hook 注入の context から取得
SESSION_ID="<context から取得>"
WT_JSON="$REPO_ROOT/.claude/sessions/$SESSION_ID/wt.json"
if [ -f "$WT_JSON" ] && command -v jq >/dev/null 2>&1; then
  WT="$(jq -r '.worktree_path // empty' "$WT_JSON")"
  [ -d "$WT" ] || WT=""
else
  WT=""
fi

# Marker が無い旧式セッション (worktree 隔離前) では cwd を WT として扱う
[ -z "$WT" ] && WT="$REPO_ROOT"

# Mode 判別: ISOLATED なら $WT は cwd と別の隔離 worktree、 LEGACY なら $WT = cwd
if [ "$WT" = "$REPO_ROOT" ]; then
  MODE="LEGACY"
else
  MODE="ISOLATED"
fi
```

### Step 1: 現在のブランチと PR を特定

```bash
CURRENT="$(git -C "$WT" branch --show-current)"
[ -z "$CURRENT" ] && { echo "DETACHED"; exit 1; }

PR_NUM="$(gh pr list --head "$CURRENT" --json number -q '.[0].number')"
```

PR が無い (`PR_NUM` が空):
> この作業ブランチには PR がまだ作成されていません。 先に変更を保存して PR を作成しますね。

→ `commit-and-pr` skill にフォールバック。

### Step 2: マージ可能性チェック

```bash
gh pr view "$PR_NUM" --json mergeStateStatus,mergeable,baseRefName,isDraft -q \
  '. | {state: .mergeStateStatus, mergeable: .mergeable, base: .baseRefName, draft: .isDraft}'
```

| 状態 | 振る舞い |
|---|---|
| `isDraft = true` | `gh pr ready "$PR_NUM"` で ready 化 → 再評価 |
| `mergeStateStatus = CLEAN` | Step 3 へ |
| `mergeStateStatus = BEHIND` | `commit-and-pr` の Step 7d で解消されているはず。 念のため `git -C "$WT" fetch && git -C "$WT" rebase origin/<base> && git -C "$WT" push --force-with-lease` を試行 → 再評価 |
| `mergeStateStatus = BLOCKED` | review 必須 / required check 失敗中 → `--auto` で予約は可能 (Step 3 へ進む) |
| `mergeStateStatus = DIRTY` | 真の merge 競合 → ユーザーに業務語彙で報告して停止 (下記) |
| `mergeStateStatus = UNKNOWN` / `null` | GitHub 計算中 → 2 秒間隔で 3 回まで再取得 |

**`DIRTY` 時のユーザー向け報告**:
> main にある別の変更とぶつかって、 自動では取り込めない箇所がありました。 どちらを優先するかをご相談させてください。

→ 停止。 ローカル削除も skip。

### Step 3: マージ実行

```bash
gh pr merge "$PR_NUM" --squash --auto --delete-branch
```

- `--squash`: ブランチの全コミットを 1 コミットにまとめて main に追加
- `--auto`: 必須 check 通過後に自動マージ予約 (即時マージ可能なら即マージ)
- `--delete-branch`: マージ後に GitHub 側のリモートブランチを削除

`--auto` が enable できないリポジトリ (= branch protection 未設定 / 必須 check 未設定) でエラーになる場合: `--auto` を外して `gh pr merge "$PR_NUM" --squash --delete-branch` (即時マージ) にフォールバック。

### Step 4: マージ完了の検出

```bash
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  STATE="$(gh pr view "$PR_NUM" --json state -q .state)"
  case "$STATE" in
    MERGED) break ;;
    CLOSED) echo "closed_without_merge"; exit 1 ;;
  esac
  sleep 2
done
```

最大 30 秒 (2 秒 × 15 回) polling:

| 結果 | 振る舞い |
|---|---|
| `MERGED` 検出 | Step 5 へ進む |
| `OPEN` のまま 30 秒経過 (`--auto` 待機中) | 業務語彙で「自動チェック通過後にマージされる予約をしました。 結果は次回ツールを開いた時に反映されます」 と報告 → Step 5 / 6 を skip して終了 |
| `CLOSED` (マージされず閉じられた異常状態) | エラーレポートして停止 |

### Step 4.5: 隔離 worktree の解放 (ISOLATED モードのみ)

ISOLATED モードでは、 マージ完了直後に **本セッション専用の worktree を解放**する。 ただし **cwd が worktree 配下にある場合は物理削除を遅延させる** (= 削除キューに登録だけして、 次回 SessionStart hook が拾って物理削除する)。

#### なぜ削除を遅延させるのか (cwd 内側ケース)

Claude Code 本体プロセスの cwd は subprocess から変更できない。 自セッションが「自分の cwd」 を物理削除すると次の症状が連鎖する:

1. cwd 無効化 → 後続 Bash tool が毎回 `Working directory ... was deleted; shell cwd recovered to ...` を吐く
2. MCP server 再起動時に cwd 由来の env var path 展開が壊れる (`Missing environment variables: _R%/` 等の path substitution 残骸)
3. 同一ディレクトリで別セッションを起動しても即崩れる

そのため、 cwd 配下の worktree は本セッションでは消さず、 削除キュー (= 後述の `PENDING` ファイル) に append だけする。 次回 Claude Code 起動時に `git-session-bootstrap.sh` がキューを拾って物理削除する。 cwd 外の worktree (= 過去セッションが起こした遅延分の継承や、 cwd を別場所に向けて起動したレアケース) は従来通り即時削除して構わない。

PENDING ファイルは **必ず main repo 側** (= primary worktree) の `.claude/sessions/.worktrees-to-delete` に置く。 削除対象の worktree 配下に書くと、 worktree 物理削除と同時に PENDING 自身が消えて遅延処理が永久に走らない。 main repo 側 path は `git rev-parse --git-common-dir` の親ディレクトリで解決する (cwd が worktree 内でも main 側を指す)。

#### 実装

```bash
QUEUED="no"

if [ "$MODE" = "ISOLATED" ]; then
  # main repo (= primary worktree) のパスを cwd 非依存で解決
  # 注意: --git-common-dir は worktree から呼ぶと "/path/to/main/.git" の
  # 絶対パス (= 共有 .git) を返す。 --git-dir (= worktree 個別の
  # "/path/to/main/.git/worktrees/<name>") と混同しない。 親 dir を取れば常に
  # main repo の絶対パスになる。
  GIT_COMMON_DIR="$(git -C "$WT" rev-parse --git-common-dir 2>/dev/null)"
  MAIN_REPO=""
  if [ -n "$GIT_COMMON_DIR" ]; then
    MAIN_REPO="$(cd "$(dirname "$GIT_COMMON_DIR")" 2>/dev/null && pwd)"
  fi
  [ -z "$MAIN_REPO" ] && MAIN_REPO="$REPO_ROOT"

  CWD="$(pwd)"
  case "$CWD" in
    "$WT"|"$WT"/*)
      # cwd が WT 配下: 物理削除を遅延キューに登録 (PENDING は main repo 側に置く)
      PENDING="$MAIN_REPO/.claude/sessions/.worktrees-to-delete"
      mkdir -p "$(dirname "$PENDING")" 2>/dev/null
      # 重複行は append しない (再 merge 時の二重登録防止)
      if [ ! -f "$PENDING" ] || ! grep -Fxq "$WT" "$PENDING" 2>/dev/null; then
        printf '%s\n' "$WT" >> "$PENDING"
      fi
      QUEUED="yes"
      ;;
    *)
      # cwd が WT 配下でない: 従来通り即時物理削除
      git -C "$REPO_ROOT" worktree remove "$WT" --force 2>/dev/null \
        || rm -rf "$WT"
      rmdir "$(dirname "$WT")" 2>/dev/null
      ;;
  esac

  # session marker は両ケースとも今すぐ消して安全。
  # marker は worktree path への参照を持つだけで、 worktree 本体とは独立管理。
  # 即時削除ケースでは worktree が既に消えたので marker も整合のため削除。
  # 遅延ケースでは marker が残っていると次回 bootstrap の SESSIONS sweep が
  # 「marker あり / worktree あり」 と認識してしまい、 PENDING との二重管理になる。
  # marker 先消しなら sweep が「marker なし」 で素通りし、 PENDING のみが
  # 削除責務を持つ単純な状態になる。
  rm -rf "$MAIN_REPO/.claude/sessions/$SESSION_ID" 2>/dev/null

  # 以降の git 操作は cwd (= main 側) を使う
  WT="$REPO_ROOT"
fi
```

**`git worktree remove --force` が失敗した場合 (即時削除パス)**: 別プロセスが worktree 内のファイルを掴んでいるなど (まれ)。 `rm -rf "$WT"` でディレクトリだけ消し、 後で `git worktree prune` (SessionStart hook 次回) でリポメタを掃除させる。

**遅延キューに積んだケースの始末**: 次回 Claude Code 起動時、 `git-session-bootstrap.sh` が `.worktrees-to-delete` を順に処理する: 各 path について、 (a) 自セッションの active_worktree なら次回に持ち越す (= 同 path で再起動した時の保険)、 (b) ディスク上に存在すれば `git worktree remove --force` または `rm -rf` で物理削除 + 親ディレクトリ rmdir、 (c) 全行処理が終わったら、 残行があれば PENDING を上書き、 無ければ PENDING ファイル自体を削除する。

### Step 5: ローカル main 同期

#### 5a. ISOLATED モード (Step 4.5 後)

cwd (= `$REPO_ROOT`) は本セッションが開始時に main を掴んでいる前提。 そのまま pull する。

```bash
# Step 4.5 で WT は REPO_ROOT に切り替わっている
CURRENT_REPO_BRANCH="$(git -C "$REPO_ROOT" branch --show-current)"
case "$CURRENT_REPO_BRANCH" in
  main|master)
    git -C "$REPO_ROOT" pull --ff-only origin "$CURRENT_REPO_BRANCH" 2>/dev/null || true
    ;;
  *)
    # cwd が別 feature 等にある (まれ): main ref を fetch で進めるだけ
    git -C "$REPO_ROOT" fetch origin main:main --quiet 2>/dev/null || true
    ;;
esac
```

#### 5b. LEGACY モード (旧式: cwd が feature ブランチを直接持っていた)

main は **cwd の worktree で checked out されているとは限らない** (sub-agent 等の別作業場所が掴んでいる場合がある)。 そのまま `git switch main` を呼ぶと `fatal: 'main' is already checked out at ...` で落ちるので、 **main の在処を先に検出** してから pull する。

##### 5b.1 main を保持している worktree を検出

```bash
CURRENT_WT="$WT"  # = $REPO_ROOT in LEGACY mode
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
done < <(git -C "$WT" worktree list --porcelain)
```

##### 5b.2 ケース別に main を最新化 + 現在の worktree を「feature ブランチを離れた状態」 に整える

```bash
if [ -z "$MAIN_WT" ]; then
  # main がどの worktree でも checked out されていない: 普通に switch + pull
  git -C "$WT" switch main
  git -C "$WT" pull --ff-only origin main
elif [ "$MAIN_WT" = "$CURRENT_WT" ]; then
  # 現在の worktree が main を持っている: そのまま pull
  git -C "$WT" switch main 2>/dev/null || true
  git -C "$WT" pull --ff-only origin main
else
  # 別の worktree が main を掴んでいる:
  #   (a) その worktree 内で pull (ローカル main ref を進める)
  #   (b) 現在の worktree は detached HEAD で main commit に移動
  git -C "$MAIN_WT" pull --ff-only origin main
  git -C "$WT" switch --detach main
fi
```

#### 5c. `--ff-only` 失敗時 (両モード共通)

ローカル main にコミットが乗っている / main 保持 worktree が dirty 状態のとき:

> ローカル側の main に予期しない変更があります。 自動では取り込めないので確認させてください。

→ 停止 (rebase / reset を勝手にしない)。 旧ブランチ削除 (Step 6) も skip。

#### 5d. `gh pr merge --auto --delete-branch` 自身がローカル更新でエラーを出すケース

`gh pr merge` は内部で local main を update しようとし、 main が別 worktree に掴まれていると `failed to run git: fatal: 'main' is already checked out at ...` を出す。 **このエラーは無視してよい** — 本 Step が main を独立に更新するため重複処理が吸収する。 GitHub 側のマージ自体は成功している (Step 4 の polling で `MERGED` を確認できれば OK)。

### Step 6: 旧ブランチ削除

#### 6a. 別 worktree が同 branch を掴んでいないか確認

ISOLATED モードで Step 4.5 を済ませている場合、 通常は誰も掴んでいない。 念のため確認 (並行セッションの可能性):

```bash
OTHER_HOLD=""
wt=""
while IFS= read -r line; do
  case "$line" in
    "worktree "*) wt="${line#worktree }" ;;
    "branch refs/heads/$CURRENT")
      OTHER_HOLD="$wt"
      break
      ;;
  esac
done < <(git -C "$REPO_ROOT" worktree list --porcelain)
```

`OTHER_HOLD` が空でない: 削除しない (内部ログのみ)。
空: そのまま 6b へ進む。

#### 6b. 安全削除を試行

```bash
git -C "$REPO_ROOT" branch -d "$CURRENT" 2>/dev/null && DELETED=yes
```

成功したら完了。 失敗 (squash merge は別 hash になるため `-d` が「未マージ commit がある」 と判定する) した場合 → 6c へ。

#### 6c. squash merge 確認後の強制削除

```bash
MERGED_AT="$(gh pr view "$PR_NUM" --json mergedAt -q .mergedAt)"
if [ -n "$MERGED_AT" ] && [ "$MERGED_AT" != "null" ]; then
  git -C "$REPO_ROOT" branch -D "$CURRENT" && DELETED=yes
fi
```

GitHub 上で **`mergedAt` が non-null (= マージ済確認できた時のみ)** `-D` (大文字、 強制) で削除。 マージ済確認できなければ削除しない。

リモートブランチは Step 3 の `--delete-branch` フラグで GitHub 側が削除済。

### Step 7: ユーザー向けレポート (業務語彙)

[CLAUDE.md ユーザー応答の語彙ルール](../../../CLAUDE.md) に従い、 ブランチ名 / commit hash / merge / rebase / squash 等の用語は出さない。 文言は Step 4.5 の `QUEUED` フラグを参照して分岐する。

**通常成功 (即時物理削除に成功 = `QUEUED=no`)**:
> 本番に反映しました。 古い作業場所も片付けたので、 次の作業からきれいな状態で始められます。

**通常成功 (削除キューに登録 = `QUEUED=yes`)**:
> 本番に反映しました。 今の作業場所は次回ツールを開いた時に自動で片付きます。

**`--auto` 待機中**:
> 自動チェック通過後に本番反映する予約をしました。 通過すれば自動で反映されます。 結果は次にツールを開いた時に取り込まれます。

**worktree 利用中で削除 skip**:
> 本番に反映しました。 (作業場所は別のセッションで使用中のため残しました)

**`-d` / `-D` のいずれも失敗** (マージ確認できない異常状態):
> 本番に反映しました。 古い作業場所の片付けはあとで行います。

**`DIRTY` で停止**:
> main にある別の変更とぶつかって、 自動では取り込めない箇所がありました。 どちらを優先するかをご相談させてください。

## 発動条件のサンプル

### 発動する (✅)

- AI:「現在の変更を本番に反映してよいですか?」 → ユーザー:「はい」 / 「OK」 / 「お願い」 / 「反映して」
- ユーザー:「マージして」 / 「PR を main に取り込んで」 / 「本番に反映」 / 「PR を反映」

### 発動しない (❌)

- 文脈不明の単独「はい」 (直前 AI 発話に「反映」「マージ」 等が**無い**)
- commit-and-pr 完了前 (= PR がまだ存在しない時) の「マージして」 → `commit-and-pr` を先に通す
- 「PR の状態を確認して」 / 「mergeable か見て」 (読取のみ → `gh pr view`)
- 「PR を閉じて」 (close は本 skill の責務外、 `gh pr close` を別途案内)

## エッジケース

- **PR が複数ある** (同 head ブランチに複数 PR は GitHub 仕様で不可): 万一存在すれば `--state open` で number 最大の 1 件を対象
- **マージ後に「待った、戻して」**: revert PR を別途作る作業 → 本 skill の責務外。 「戻し用の PR を作りますか?」 とユーザーに提案
- **`gh auth` 切れ**: 「GitHub の認証が切れています。 `gh auth login` をお願いします」 と業務語彙で停止 ([グローバル戦略](~/.claude/CLAUDE.md))
- **`--auto` が enable できないリポジトリ**: Step 3 で `--auto` を外して即時マージにフォールバック
- **Draft PR**: `gh pr ready "$PR_NUM"` で ready 化してから merge
- **`--delete-branch` がリモート削除に失敗** (権限不足等): GitHub auto-delete 設定がオンならいずれ消える。 オフなら 「リモートブランチが残っています」 と内部ログのみ (ユーザーへの通知は不要)
- **main が別 worktree に掴まれている (LEGACY モード)**: Step 5b.2 の 3 番目のケース。 別 worktree で pull → 現在の worktree は detached HEAD で main commit に着地。 ユーザーへの説明は 「main と同じ位置」 で十分 (技術用語 `detached HEAD` は出さない)。 次タスク開始時に `git-task-start` skill が detached HEAD on main commit を **正常状態として処理する** (= 同 commit から新ブランチを切る)。 この前提は本 skill と git-task-start で対になっている。
- **ISOLATED モードでの worktree 削除失敗**: `git worktree remove --force` が稀に失敗する (別プロセスが worktree 内のファイルを掴んでいる等)。 `rm -rf "$WT"` で物理削除し、 リポメタは次回 SessionStart hook が `git worktree prune` を介して掃除する
- **cwd を含む worktree の削除遅延**: Claude Code 本体プロセスは subprocess から cwd を変更できないため、 自セッションが「自分の cwd」 を物理削除すると、 後続 Bash tool / MCP server / 同ディレクトリ別セッションが連鎖的に壊れる。 そのため Step 4.5 では cwd 配下の場合のみ削除キュー (`.claude/sessions/.worktrees-to-delete`) に登録するに留め、 物理削除は次回 SessionStart hook (`git-session-bootstrap.sh`) に委譲する。 cwd 外の場合は従来通り即時物理削除して構わない

## 制約

- **main 直接 push は絶対にしない** (本 skill / 全 skill 共通)
- **rebase / reset を勝手にしない**: `--ff-only` 失敗時はユーザーに相談
- **gh pr merge を skill 経由ではなく直接打たない** (本 skill が必ず通るルート)
- **deploy はやらない**: 本 skill は git/GitHub のみ。 Vercel deploy は GitHub 連携で自動 (本 skill が main にマージしたら Vercel が本番反映を自動実行)
- **ユーザー報告は簡潔に** (CLAUDE.md ユーザー応答ルール)

## 関連 skill / ルール

- [プロジェクト CLAUDE.md - セッション git ハイジーン](../../../CLAUDE.md) — 本 skill の発動を必須化するルール
- `commit-and-pr` skill — 前段 (PR 作成)。 本 skill 発動前に必ず通る。 完了レポート末尾で「本番に反映してよいですか?」 と問う
- `git-task-start` skill — マージ後の次タスク開始時に使う対の skill
- `.claude/hooks/git-session-bootstrap.sh` — `--auto` 待機中の遅延マージを次セッション開始時に検出
