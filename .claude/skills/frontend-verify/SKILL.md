---
name: frontend-verify
description: Next.js (src/) を編集したセッションで「ひと段落」がついた時に必ず発動する end-to-end 検証 skill。 (1) `npm run typecheck`、 (2) `npm run lint`、 (3) `npm run format:check`、 (4) `npm test`、 (5) `npm run build` — Phase 1 Definition of Done と GitHub Actions CI の全 5 項目を**ローカルで先回り**通過させる、 (6) UI 変更があれば `npm run dev` で http://localhost:3000 を起動し golden path を実画面確認 → 停止、 (7) commit-and-pr に連鎖して PR 作成 (Vercel が PR ごとに preview を自動デプロイ、 main マージで本番反映)。 ユーザーが「PR 作って」「コミットして」「ひと段落ついた」と発話したセッションで、 `src/**` に変更がある場合に **必ず** 起動する。 単に src/ を Read しただけのセッションでは発動しない。
---

# frontend-verify

LiDAR×AI 自動作図 MVP (Next.js 14 + Supabase + Vercel) を編集したセッションで、 「ひと段落」 がついたタイミングで **必ず** 自動発動する end-to-end 検証 skill。

## 運用方針 (重要)

本プロジェクトの本番反映パスは **GitHub → Vercel 自動連携**:

- main への push (= PR マージ) で Vercel が production deploy
- PR 作成で Vercel が preview deploy (PR ごとに固有 URL)
- ローカルから `vercel deploy` を直接打つことはしない (CI/CD 経由)

frontend-verify は本番反映 **そのもの** ではなく、 「PR を出す前に CI が通ることをローカルで先回り確認 + UI golden path を実画面確認」 する位置付け。 これにより GitHub Actions が落ちて PR が止まる事故 + 本番に壊れた UI が乗る事故を防ぐ。

## なぜ必要か

過去の経験上、 フロントエンド変更は以下の落とし穴をシステマチックに踏みやすい:

- 型チェックを通したつもりで `next build` で別エラーが出る (tsc と Next.js で挙動が違う箇所、 特に Server Components 周り)
- ローカルでは見た目 OK でも production build で CSS が剥がれる / Server Action が 500 で落ちる / middleware が無限リダイレクトする
- Prettier と ESLint の違反を見落として CI 落ちで PR レビューが進まない
- Vitest の追加テストが書かれず仕様が壊れたまま main に流れる
- `npm run dev` で動いていたが `npm run build` の output trace で missing dependency が露呈

これら 5 種を「毎回」自動で機械的に通すために本 skill が存在する。 ユーザーは「PR 作って」と言うだけで、 CI 5 項目通過 → UI 確認 → PR 作成までが一気通貫で走る。

## 発動条件

### 発動する (✅)

- セッション中に `src/**` の Edit / Write / MultiEdit があった
- かつ ユーザーが以下のいずれかを発話した:
  - 「PR 作って」「コミットして」「変更を保存」「github に上げて」
  - 「ひと段落ついた」「これで完了」「終わり」「デプロイして」「公開して」
  - その他「セッション末に commit-and-pr が起動する」状況

PostToolUse hook (`.claude/settings.json`) が `src/**` 編集を検知した時点で reminder が注入されるので、 セッション中ずっと「frontend-verify をやる」状態が頭に残る。 セッション末の commit-and-pr 起動より **前に** 本 skill を必ず通す。

### 発動しない (❌)

- src/ を Read だけして編集していない
- docs/ や README.md のみの変更 (これらは UI に影響しない)
- ユーザーが「frontend-verify をスキップして」と明示
- 既に同セッションで frontend-verify を完走済み (二重実行防止)

## 必須ステップ

順番に実行する。 失敗があれば次のステップに進まず、 ユーザーに業務語彙で報告して止まる。

### Step 0: worktree path の解決 (毎回最初に)

このセッションが隔離 worktree で動いている場合、 src/ のソースは `$WT/src/` にあり、 cwd の `src/` は古い (= main 側) 状態のまま。 build / dev / test は必ず worktree 配下で実行する。

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
SESSION_ID="<context から取得>"
WT_JSON="$REPO_ROOT/.claude/sessions/$SESSION_ID/wt.json"
if [ -f "$WT_JSON" ] && command -v jq >/dev/null 2>&1; then
  WT="$(jq -r '.worktree_path // empty' "$WT_JSON")"
  [ -d "$WT" ] || WT=""
fi
[ -z "$WT" ] && WT="$REPO_ROOT"   # 旧式セッションは cwd で従来通り
```

以降の Step ではすべて `( cd "$WT" && ... )` のサブシェルで実行する。 cwd は変えない。

### Step 1: TypeScript 型チェック

```bash
( cd "$WT" && npm run typecheck )
```

成功条件: exit code 0、 エラー / warning なし。

失敗時:
- 該当ファイル + 行を表示し、 型不整合の根本を直す
- `any` / `as` で**回避しない** (本番で実害が出る)
- `// @ts-ignore` も**使わない**

### Step 2: ESLint

```bash
( cd "$WT" && npm run lint )
```

成功条件: exit code 0、 エラー / warning なし。

失敗時:
- ルール違反を実コードで修正 (auto-fix を盲目適用しない)
- `eslint-disable-next-line` は最後の手段で、 理由をコメント必須

### Step 3: Prettier フォーマットチェック

```bash
( cd "$WT" && npm run format:check )
```

成功条件: exit code 0。

失敗時:
- `( cd "$WT" && npm run format )` で auto-fix
- 再度 `format:check` を実行して通ることを確認

### Step 4: Vitest

```bash
( cd "$WT" && npm test )
```

成功条件: exit code 0、 全テスト PASS。

失敗時:
- 失敗テストの assertion を読み、 期待値と実装のどちらが正かを判定
- TDD 文脈なら期待値が正 → 実装を直す
- 仕様変更で期待値が古いなら期待値を更新 (理由をコミットメッセージに残す)
- テストを `skip` / `xit` で**回避しない**

### Step 5: 本番ビルド (Next.js production build)

```bash
( cd "$WT" && npm run build )
```

成功条件:
- exit code 0
- 出力に `Compiled successfully` / `Route (app)` 一覧が表示される
- `.next/` 配下に build artifact が生成される

失敗時:
- Server Components / Client Components 境界の誤り (例: `'use client'` 漏れ、 server-only API を client から import) → 該当ファイルを修正
- middleware.ts の export 不整合 → `export const config = { matcher: [...] }` の matcher 構文を確認
- 環境変数欠落 (`NEXT_PUBLIC_*` 等) → `.env.local` を確認 (但し `.env.local` を AI が編集することはしない、 ユーザーに依頼)
- Supabase クライアント周りの型エラー → `@supabase/ssr` のバージョン整合を確認

### Step 6: UI golden path 確認 (UI 変更があれば)

src/ 編集の中に `app/`, `components/`, `*.tsx`, `*.css` の変更が含まれる場合のみ実行。 純粋な `lib/` 変更のみなら skip 可。

#### 6a. dev サーバー起動 (background)

```bash
( cd "$WT" && npm run dev )
```

`run_in_background: true` で起動。 Next.js の起動ログから `Local: http://localhost:3000` を読み取る (デフォルト 3000、 競合時は 3001 等に自動 fallback)。 起動完了の確認: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` が **200** を返す。

#### 6b. Chrome MCP で開く

```
mcp__claude-in-chrome__tabs_context_mcp (createIfEmpty: true)
mcp__claude-in-chrome__navigate (url: http://localhost:3000/)
mcp__claude-in-chrome__read_page (filter: all)
mcp__claude-in-chrome__read_console_messages
```

確認項目 (Phase 1 時点の golden path):
- `/` (ランディング): 「LiDAR×AI 自動作図 (β)」 ヘッダ + ログイン / 新規登録ボタンが表示される
- `/login`: メール / パスワードフォームが表示される
- `/signup`: メール / パスワードフォーム + トライアル文言が表示される
- 認証済み状態なら `/dashboard`: ヘッダにユーザー email + サインアウトボタン + プロジェクト一覧 placeholder
- console error が出ていないか (hydration error / Server Action error 等は特に注意)

Phase が進んだ際は本セクションを更新する (Phase 2 で DXF アップロード画面、 Phase 3 でキャンバス、 等)。

#### 6c. Chrome 拡張が未接続だった場合

`tabs_context_mcp` が `Browser extension is not connected.` を返したら:
- ユーザーに **1 回だけ**お願い: 「Chrome を立ち上げて Claude 拡張を有効にしていただけますか? PR 前の動作確認に使います」
- それでも接続不可なら **HTTP 200 確認のみ**にフォールバック (`curl http://localhost:3000/{,login,signup}` の status code チェック) し、 Step 7 のレポートに「実画面確認はユーザー側でお願いします」 と明示

#### 6d. dev サーバー停止

`TaskStop` で background プロセスを止める。 ポート開放を確認する必要は無い (次回起動時に Next.js が自動で別ポート選ぶ)。

### Step 7: commit-and-pr に連鎖

```
Skill(skill="commit-and-pr")
```

ここで作る PR は **Vercel preview deploy のトリガー** にもなる (Vercel が PR ごとに固有 preview URL を発行)。 main マージで本番反映。 これをユーザーに明示する: 「PR を作りました。 マージで Vercel が本番反映します。 マージ前に preview URL で最終確認も可能です」。

commit-and-pr が:
- 変更を stage (シークレット混入チェック含む)
- コミット (履歴スタイル踏襲)
- push
- PR 作成

を完走する。 PR URL が返ってくる。

### Step 8: ユーザー向けレポート (簡潔に)

レポート例 (成功時):

```
フロントエンドの変更を PR にしました。 マージで本番に反映されます。

- 自動チェック: 型チェック / Lint / Format / テスト / 本番ビルドすべて通過
- ローカル画面確認: ランディング / ログイン / 新規登録 すべて正常表示
- レビュー用ページ (PR): https://github.com/Nekonote-Administrative/lidar-cad-mvp/pull/<n>
  ※ Vercel が PR preview を自動デプロイします (PR の Checks タブで URL 確認可能)
  ※ main にマージするとそのまま本番反映されます
```

レポート例 (失敗時 - typecheck):

```
フロントエンドの変更で、 自動チェックが止まりました。

- 内容: 型チェックでエラーが出ました。 src/lib/supabase/server.ts の cookies の型が
  Next.js 14 の API と合っていません
- PR 作成は止めています (壊れた状態を main に流さないため)
- 修正してから再度お試しください
```

レポート例 (失敗時 - build):

```
フロントエンドの変更で、 本番ビルドが失敗しました。

- 内容: src/app/dashboard/layout.tsx で server-only API を Client Component から
  import しています ('use client' 指定の誤りの可能性)
- 型チェックは通っています (Next.js の build 時にだけ出るエラー)
- 修正方針: layout.tsx を Server Component のままにするか、 supabase クライアントを
  client.ts 経由に切替えるかを決めて再実行してください
```

## エッジケース

- **Chrome 拡張が立ち上がっていない**: Step 6c のフォールバック (HTTP 200 確認のみ) + ユーザーに 1 回お願い
- **dev サーバーが既に立っている**: Next.js が自動で別ポート (3001 等) を選ぶ。 ログから実ポートを読み取って Chrome MCP に渡す
- **build エラーで PR を出すべきでない**: Step 1〜5 のいずれか失敗時は Step 7 に進まず止まる
- **`.env.local` 不在で build / test が失敗**: Phase 1 では Supabase 環境変数なしでも build は通る (ランタイム参照のみ)。 もし build 時に `process.env.NEXT_PUBLIC_*` の不在で落ちるなら、 ユーザーに `.env.local` 設定を依頼 (AI は `.env.local` に書き込まない)
- **CI 通過と本 skill のズレ**: CI が `npm ci` でクリーンインストール後に同コマンド列を実行する。 本 skill との差異は「CI は `format:check` も含む」 のみ — 本 skill が全 5 項目を回せば CI も通る前提
- **Vercel preview が deploy 失敗**: 通常は GitHub Actions と同じビルド失敗が原因。 PR の Checks タブで Vercel の log を読み、 必要なら追加コミットで直す

## 他 skill との連携

- **commit-and-pr**: 本 skill の Step 7 で**必ず**呼ぶ。 frontend-verify の最後段
- **schedule**: 使わない
- **retrospective-codify / empirical-prompt-tuning**: engineer モード時のみ、 セッション末のクロージングフローで本 skill 完走後に走る場合あり (CLAUDE.md 参照)

## 制約

- **vercel CLI で直接 deploy しない**: 本プロジェクトは GitHub → Vercel 自動連携。 ローカルから `vercel deploy --prod` を打つのは禁止 (経路が二重化されて事故る)
- **main 直 push はやらない**: commit-and-pr 側で feature ブランチ → PR の流れを担保
- **dev サーバーを残置しない**: Step 6d で必ず停止
- **`.env.local` を AI が編集しない**: 値の管理はユーザー責務 (ローカル / Vercel Environment Variables / GitHub Secrets で 3 か所同期)
- **`--no-verify` で hook を回避しない**: pre-commit hook を勝手にスキップしない
- **テストを `skip` で**飛ばさない**: 失敗テストは実装か期待値を直す

## 関連

- [プロジェクト CLAUDE.md](../../../CLAUDE.md) — クロージングフロー
- `commit-and-pr` skill — 本 skill が連鎖呼び出しする
- `docs/plans/01-foundation.md` — Phase 1 Definition of Done (本 skill の Step 1〜5 が DoD の 2〜6 に対応)
