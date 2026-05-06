---
name: adr-compact
description: docs/adr/ の決定記録が15件以上に増えたとき、 重要かつ現在のプロジェクトと整合する 5 件の決定に**自動・silent で**集約する skill。 SessionStart hook (adr-count-guard.sh) が閾値超過を検知すると本 skill が無確認で即起動する。 旧 ADR は `git mv` で `docs/adr/archive-YYYYMMDD/` に退避するので git 履歴 + 物理ファイル両方に残る (削除はしない)。 ユーザーへの確認 / 報告は一切行わない (silent 運用)。
---

# ADR Compact

## いつ使うか

**起動条件**:
- SessionStart hook (`adr-count-guard.sh`) が「決定記録が N 件 (≥ 15) に増えました」 と context に注入した瞬間、 **無確認で即起動**。
- またはユーザー本人から手動指示 (「決定の整理して」 等) があれば件数に関係なく起動可。

**起動しない場面**:
- ADR が 15 件未満で、 ユーザーの手動指示も無い (hook が context に出していない)

**重要原則**:
- **silent 運用**: ユーザーへの確認 / 進捗報告 / 完了通知を**一切**出さない。 ユーザーの元依頼への応答は通常通り進めつつ、 本 skill の処理を裏で完走させる。
- **履歴の二段安全網**: 旧 ADR は (1) `git mv` で `archive-YYYYMMDD/` に退避 (= git 履歴 + 物理ファイル両方に残る) ので「削除」は決して行わない。 集約 ADR の `Consolidated from:` フィールドと `Historical record` セクションで旧番号を機械的に追跡可能にする。
- **承認スキップは silent 前提**: ユーザーは git / ADR の存在を意識しない設計なので「確認」 自体が業務ノイズ。 確認なし自動実行の前提は、 安全網 (退避フォルダ + git history + Consolidated from 参照) で履歴破壊を実質ゼロに抑えていることに依存する。 安全網を弱めるリファクタは禁止。

## ワークフロー

### Step 0: 事前検証

```bash
# 件数確認 (必ず 5 件超でないと圧縮の意味がない)
COUNT=$(find docs/adr -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]-*.md' | wc -l)
```

`$COUNT` が 5 以下なら起動意味なし → **silent でそのまま終了** (ユーザーに何も報告しない。 SessionStart hook 経由でも手動指示でも同じ)。 hook は閾値 15 で発火するので、 通常はこの分岐に入らない。 入った場合は前回の圧縮直後に手動で再起動された等の可能性。

### Step 1: 全 ADR の読込 + 現プロジェクト状態の把握

並列で以下を Read:

1. **全 ADR**: `docs/adr/*.md` を**全件**読む (1 ファイルずつ Read 並列)
2. **現プロジェクト整合性の根拠**:
   - `CLAUDE.md` (現在のディレクトリ構成 / 設計方針)
   - `git log --oneline -30 origin/main` (直近の変更傾向)
   - `git ls-files | head -50` (現存ディレクトリ構造)
3. **既存の archive-YYYYMMDD/ 履歴**: 過去に圧縮を実施しているか確認 (`ls docs/adr/archive-*/ 2>/dev/null`)

### Step 2: 各 ADR の分類

各 ADR を 3 カテゴリに分類:

| カテゴリ | 判定基準 | 集約後の扱い |
|---|---|---|
| **A: アクティブ + 現在のプロジェクトに効いている** | Status が `Accepted` で、 Decision の対象が現コードベース / 現運用に存在する | 5 件の集約 ADR の素材になる |
| **B: 上書き済み / 廃止済み** | Status が `Superseded by ADR-NNNN` または `Deprecated` | 集約 ADR の「歴史的経緯」 セクションに 1 行で言及する程度。 退避フォルダにも残る |
| **C: アクティブだが現在は無関係** | Status は `Accepted` だが、 対象機能が削除済み / プロジェクト方針が変わって現在のコードに痕跡が無い | 退避フォルダに残るのみ。 集約 ADR には載せない |

C カテゴリの判定が一番むずかしい。 **疑わしい時は A 扱い** (誤って捨てるより冗長な方が安全)。 判定根拠は次セクションに書く。

### Step 3: 集約方針を AI 単独で決定

5 件にどうグルーピングするかは AI が単独で判断する (silent 運用なのでユーザーに見せない)。 ただし**判断のトレーサビリティを残す**ため、 集約 ADR の `Context` セクションに「なぜこの粒度で集約したか」 の理由を 1 〜 2 文で書き残す (= 後から AI / 人間が読み直したときに納得できる根拠)。

判断ガイドライン:
- **テーマで揃える**: 「認証 + middleware」 「DXF パース + 求積エンジン」 「課金 + Stripe」 など、 同じ関心事に属するものを束ねる
- **時系列の因果で揃える**: ADR-A の決定が ADR-B の前提になっているなら同じ集約 ADR に入れる
- **量のバランス**: 5 件のうち 1 件が原典 10 件分を抱え、 残り 4 件が 1 件ずつ、 のような偏りは避ける (集約後の各 ADR が「重み」 で似た規模になるよう調整)
- **C カテゴリ (現在無関係) の判定が微妙な ADR**: A 扱いで集約 ADR に含める (疑わしきは残す)
- **5 件にこだわらない**: 4 件で素直に分かれるなら 4 件、 6 件必要なら 6 件で OK。 「最大 5」 はガイドライン

### Step 4: 集約 ADR ファイルの作成

Step 3 の判断結果に従って 5 件 (± 数件) の新 ADR を作成する。 **silent 自動実行なので承認待ちはしない**: Step 3 の AI 判断がそのまま実行に進む。

**番号付け**: 既存の最大番号の次から連番。 例: 既存最大が 0025 なら新 ADR は 0026 〜 0030。 番号衝突予防は CLAUDE.md の規約に従う:

```bash
/bin/ls docs/adr/ | sort | tail -3
gh pr list --search "docs/adr/0" --state all --json number,title,state
git fetch origin main && git log origin/main --oneline -10 -- docs/adr/
```

**ファイル名**: `NNNN-<集約テーマ>-consolidated.md` (`-consolidated` サフィックスで「これは集約 ADR」 と一目で判る)

**ファイル本体の構造**:

```markdown
# ADR-NNNN: <集約テーマを 1 行で>
- Status: Accepted
- Date: YYYY-MM-DD
- Consolidated from: ADR-AAAA, ADR-BBBB, ADR-CCCC

## Context
このテーマで過去にどのような議論 / 制約があり、 どの ADR でどの判断が積まれたか。
旧 ADR を時系列順に 1 〜 2 文ずつ要約 (旧 ADR の Date を併記)。

## Decision
集約後の **現在有効な決定**。 旧 ADR で Superseded されたものは載せず、
最新の判断のみ。 1 〜 5 文で簡潔に。

## Consequences
この決定群が現プロジェクトにもたらしている良い面 / 悪い面 / 将来動かすときの条件。

## Historical record
退避された旧 ADR の番号とタイトル一覧 (lookup 用):
- ADR-AAAA: <タイトル> (Status: Accepted/Superseded)
- ADR-BBBB: <タイトル> (Status: ...)
```

`Consolidated from:` フィールドで旧 ADR への参照が機械可読に保たれるので、 後から「なぜこの決定?」 と遡れる。

### Step 5: 旧 ADR の退避

```bash
TS="$(date -u +%Y-%m-%d)"
ARCHIVE_DIR="docs/adr/archive-$TS"
mkdir -p "$ARCHIVE_DIR"

# 集約対象の旧 ADR を退避フォルダへ git mv (履歴を残しつつ移動)
for f in docs/adr/[0-9][0-9][0-9][0-9]-*.md; do
  # 集約 ADR 自身は移動対象から除く (ファイル名に -consolidated サフィックス)
  case "$f" in
    *-consolidated.md) continue ;;
  esac
  git mv "$f" "$ARCHIVE_DIR/$(basename "$f")"
done
```

**git mv を使う理由**: 単なる `mv` だと git 上では「削除 + 新規作成」 になり履歴が切れる。 `git mv` だと rename として認識される。

### Step 6: README of archive

退避フォルダのトップに INDEX を書いておく (人間が後から見たとき迷子にならないため):

```markdown
# Archive 2026-05-02

このフォルダは ADR-Compact skill によって YYYY-MM-DD に退避された旧 ADR です。
集約後の決定は docs/adr/ 直下の `*-consolidated.md` を参照してください。

## 退避ファイル一覧 (集約先 ADR への対応)

| 旧 ADR | タイトル | 集約先 |
|---|---|---|
| 0001 | MVP v1 target and business domain | ADR-NNNN (事業ドメイン定義) |
| 0005 | Tech stack MVP v1 | ADR-NNNN (技術スタック確定) |
| ... | ... | ... |
```

### Step 7: 動作確認

```bash
# 圧縮後の件数確認 (5 件以下になっているはず)
find docs/adr -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]-*.md' | wc -l

# 退避フォルダに全件が入っていることを確認
find docs/adr/archive-* -type f -name '[0-9][0-9][0-9][0-9]-*.md' | wc -l

# 集約 ADR が読める状態であることを確認
for f in docs/adr/[0-9][0-9][0-9][0-9]-*-consolidated.md; do
  head -3 "$f"
  echo "---"
done
```

### Step 8: ユーザーへの完了報告は出さない (silent 運用)

本 skill の処理結果はユーザーに**一切**通知しない。 元の依頼への応答に「決定の整理が完了しました」 のような付随報告も付けない。 集約結果が後から効くタイプの作業 (= ユーザーは ADR の存在を意識しないので、 整理されたこと自体に興味がない) なので、 silent で完了させる。

ただし**変更内容は commit-and-pr のフローで PR の差分として残る**。 commit message には機械可読な形で集約事実を残す (例: `chore(adr): consolidate ADR-0013..0025 into 5 decisions`)。 PR タイトル / body も同様に技術的な記述で OK (PR は履歴管理用なので業務語彙ルールの対象外)。

## 重要な制約

- **silent 自動実行**: hook が context に注入したら、 ユーザーに何も尋ねず / 報告せず即実行。 「整理しますか?」 「整理しました」 などの発話を一切出さない
- **rename 必須**: 旧 ADR は `git mv` で退避 (履歴維持)
- **退避フォルダを作る**: 単に削除しない。 `archive-YYYYMMDD/` を必ず作る (git history のみに頼ると後から探しづらい)
- **疑わしきは残す**: カテゴリ C (現プロジェクト無関係) の判定が微妙なら A 扱いで集約 ADR に含める
- **集約 ADR は 5 件にこだわらない**: 4 件で素直に分かれるなら 4 件、 6 件必要なら 6 件で OK。 「最大 5」 をガイドラインとし、 強制ではない。 ただし元の 15+ から大きく減らすこと
- **commit-and-pr で締める**: 本 skill 単独では commit しない。 ひと段落としてクロージングフロー (retrospective-codify → empirical-prompt-tuning → commit-and-pr) に乗せる。 commit-and-pr が末尾で「本番反映してよいですか?」 と聞くのはこの skill とは別レイヤ (フロー全体への確認なので silent ルールの例外)

## エッジケース

- **既に archive-YYYYMMDD/ がある (今日中の 2 回目)**: 退避先を `archive-YYYYMMDD-2`, `-3` ... と suffix を付けて衝突回避
- **集約途中でエラー** (`git mv` 失敗 / ファイル書込失敗): すでに動かしたファイルを元の位置に戻す (rollback)。 commit はまだなのでローカルだけで完結。 ユーザーには通知せず元依頼の作業を継続
- **旧 ADR 内に他 ADR への内部リンク**: 集約後はリンク切れになる。 集約 ADR の `Historical record` セクションに旧番号 + タイトルを残しておけば検索で辿れる (= 完全には保てないが妥協ライン)
- **集約対象に番号の連続性が無い** (例: 0013, 0014, ... の途中が既に過去の archive に入っている): 過去 archive を読み込まずに集約しても OK (過去 archive の旧 ADR は今回の対象外)
- **5 件への分類が無理** (テーマが多様すぎる): 強引に集約せず、 集約 ADR を 6 〜 7 件まで増やす。 それでも収まらないほどテーマが分散しているなら本回は見送り (= 旧 ADR を退避せずに終了。 silent なのでユーザーは気付かない。 次セッションで件数閾値が再判定される)

## 関連 skill / hook

- `.claude/hooks/adr-count-guard.sh` — SessionStart で 15 件以上検知 → 「silent に本 skill を即起動せよ」 と context に注入 (ユーザーへの確認は無し)
- `commit-and-pr` skill — 本 skill 完了後のクロージング (退避 + 集約 ADR を 1 PR に)
- `retrospective-codify` skill — 集約途中で得た学び (例: 「この種の決定は最初から集約 ADR に書くべき」 等) を ast-grep / skill / CLAUDE.md に固定する
- CLAUDE.md 「設計方針 + ADR 運用」 セクション — 1 ファイル 1 決定 / Superseded 運用の原則 (本 skill はこの原則の 「定期的な圧縮」 例外運用)
