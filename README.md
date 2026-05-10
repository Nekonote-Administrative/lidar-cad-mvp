# LiDAR×AI 自動作図システム (店舗系許認可向け)

風営法 1 号 / 深夜酒類提供飲食店の図面作成を AI 補助で自動化する Web SaaS。
詳細な事業背景・設計判断は親フォルダの ADR (Google Drive 同期領域) を参照してください。

## Phase 1 完了時点の機能

- ユーザー登録 / ログイン / サインアウト (Supabase Auth)
- 保護ルート (Next.js 16 proxy.ts)
- 空のダッシュボード

## Phase 2 完了時点の機能 (CLI)

Polycam Room Capture が出力する DXF を CLI で読み込み、 壁/ドア/窓を構造化抽出し、 直線壁の三斜分割 + 求積表 JSON を出力する純粋 TypeScript ライブラリ。 Web エディタ (Phase 3 で実装) からも同じ `src/lib/cad/` を import して利用する。

```bash
npm run cad:parse -- tests/fixtures/synthetic-rectangle-room.dxf --zone 客室
```

主な公開 API (`src/lib/cad/`):

- `parsePolycamDxf(dxfText)` — Polycam DXF からレイヤー (`WALLS` / `DOORS` / `WINDOWS`) を抽出
- `triangulate(polygon)` — 単純多角形を三角形分割 (Earcut)
- `subtractPolygon(a, b)` — 多角形差分 (柱の控除など)
- `calculateAreaTable(zoneName, triangles)` — ADR-0008 整合性 (個別三角形 → m² 第 2 位切り捨て → 合計) を満たす求積表を生成
- `validateAreaIntegrity(table)` — ADR-0008 整合 2/3 を検証 (PDF 出力経路の必須ガード)
- `validatePolygonOrThrow(polygon)` — 自己交差・退化を検出
- `truncateToFixed(value, fractionDigits)` — 切り捨て (toward zero)

ライブラリは **環境非依存** (Node でも Browser でも動く)。 `src/lib/cad/` 内には Konva / Next / Supabase / Node `fs` の import を **絶対に持ち込まない**。 IO は `src/cli/parse-dxf.ts` (CLI 層) で行う。

## 開発環境セットアップ

### 前提

- Node.js 20+
- npm
- Supabase アカウント (https://supabase.com)
- Vercel アカウント (https://vercel.com)

### 初回セットアップ

```bash
git clone <repo>
cd lidar-cad-mvp
npm install
cp .env.example .env.local
# .env.local を Supabase の値で書き換える
npm run dev
```

ブラウザで http://localhost:3000 を開く。

## スクリプト

```bash
npm run dev          # 開発サーバー起動 (http://localhost:3000)
npm run build        # 本番ビルド
npm run typecheck    # TypeScript 型チェック
npm run lint         # ESLint
npm run format       # Prettier フォーマット (書き換え)
npm run format:check # Prettier フォーマットチェックのみ
npm test             # Vitest テスト実行
npm run test:watch   # Vitest watch モード
npm run cad:parse    # Phase 2 CLI: Polycam DXF → 求積表 JSON
```

## 技術スタック

| レイヤー | ライブラリ | ADR |
|---|---|---|
| FW | Next.js 16 App Router + TypeScript | 0005 |
| UI | Tailwind CSS 4 | 0005 |
| 認証 | Supabase Auth (`@supabase/ssr`) | 0005 |
| DXF パース | `dxf-parser` | 0005 |
| 三斜分割 | `earcut` (Mapbox) | 0005 |
| 多角形演算 | `polygon-clipping` | 0005 |
| 求積精度 | 第 2 位切り捨て (個別計算後合計) | 0008 |
| テスト | Vitest + Testing Library | 0005 |
| ホスティング | Vercel | 0005 |

## ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/          認証画面 (route group)
│   ├── dashboard/       認証必須エリア
│   └── page.tsx         ランディング
├── cli/
│   └── parse-dxf.ts     Phase 2 CLI エントリ
├── lib/
│   ├── cad/             Phase 2 CAD 純粋ライブラリ (環境非依存)
│   │   ├── types.ts
│   │   ├── truncate.ts
│   │   ├── polygon-validation.ts
│   │   ├── triangulate.ts
│   │   ├── polygon-ops.ts
│   │   ├── area-calc.ts
│   │   ├── area-integrity.ts
│   │   └── dxf-parser.ts
│   └── supabase/        Supabase クライアントヘルパー
└── proxy.ts             保護ルート判定 (Next.js 16 proxy 規約)
tests/
└── fixtures/            合成 DXF (Polycam フォーマット仕様に基づく手書き)
```

## 次のフェーズ

Phase 3 で Web エディタ UI (Konva.js キャンバス + DXF アップロード + ゾーン手動指定 + 求積表表示) を実装。 Phase 2 の `src/lib/cad/` を Phase 3 がそのまま import して使う。 詳細は親プロジェクトの `docs/plans/00-roadmap.md` 参照。
