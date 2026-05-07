# LiDAR×AI 自動作図システム (店舗系許認可向け)

風営法 1 号 / 深夜酒類提供飲食店の図面作成を AI 補助で自動化する Web SaaS。
詳細な事業背景・設計判断は親フォルダの ADR (Google Drive 同期領域) を参照してください。

## Phase 1 完了時点の機能

- ユーザー登録 / ログイン / サインアウト (Supabase Auth)
- 保護ルート (Next.js 16 proxy.ts)
- 空のダッシュボード

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
```

## 技術スタック

| レイヤー | ライブラリ | ADR |
|---|---|---|
| FW | Next.js 16 App Router + TypeScript | 0005 |
| UI | Tailwind CSS 4 | 0005 |
| 認証 | Supabase Auth (`@supabase/ssr`) | 0005 |
| テスト | Vitest + Testing Library | 0005 |
| ホスティング | Vercel | 0005 |

## ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/          認証画面 (route group)
│   ├── dashboard/       認証必須エリア
│   └── page.tsx         ランディング
├── lib/
│   └── supabase/        Supabase クライアントヘルパー
└── proxy.ts             保護ルート判定 (Next.js 16 proxy 規約)
```

## 次のフェーズ

Phase 2 で DXF パース + 求積エンジン (CLI) を実装。詳細は親プロジェクトの `docs/plans/00-roadmap.md` 参照。
