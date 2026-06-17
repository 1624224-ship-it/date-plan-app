# 💑 デートプラン提案アプリ

カップル向けのデートプラン自動生成Webアプリです。エリア・テーマ・予算などを入力するとAIが当日のプランを提案し、Googleカレンダーにも登録できます。

## 技術スタック

| 役割 | 技術 |
|------|------|
| フロントエンド | React + Tailwind CSS (Vite) |
| バックエンド | Node.js + Express |
| AI | Anthropic API (claude-sonnet-4-6) |
| カレンダー | Google Calendar API (OAuth 2.0) |

---

## セットアップ

### 前提条件

- Node.js 18 以上
- Anthropic API キー
- Google Cloud Console プロジェクト（カレンダー連携を使う場合）

---

### 1. リポジトリのクローン後、バックエンドをセットアップ

```bash
cd backend
npm install
cp .env.example .env
```

`.env` を開いて以下を設定してください：

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx   # Anthropic Console で取得
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
FRONTEND_URL=http://localhost:5173
PORT=3001
```

#### Google Cloud Console の設定手順

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. **API とサービス → ライブラリ** で「Google Calendar API」を有効化
3. **API とサービス → 認証情報** で「OAuth 2.0 クライアント ID」を作成
   - アプリケーションの種類：**ウェブ アプリケーション**
   - 承認済みのリダイレクト URI：`http://localhost:3001/api/auth/google/callback`
4. クライアント ID とシークレットを `.env` に貼り付け

---

### 2. フロントエンドをセットアップ

```bash
cd frontend
npm install
```

---

## 起動方法

**ターミナル1（バックエンド）**

```bash
cd backend
npm run dev
# → http://localhost:3001 で起動
```

**ターミナル2（フロントエンド）**

```bash
cd frontend
npm run dev
# → http://localhost:5173 を開く
```

---

## 使い方

1. **条件を入力**：エリア・テーマ・予算・時間帯・天気を選択
2. **プランを生成**：AIが3〜5件のスポットをタイムライン形式で提案
3. **決定 or 再生成**：気に入ったら「このプランで決定」、気に入らなければ「別のプランを見る」
4. **カレンダーに登録**（任意）：
   - 「Googleでログイン」ボタンでOAuth認証
   - デートの日付を選んで「Googleカレンダーに追加」

---

## 画面構成

```
InputForm   →   PlanTimeline   →   CalendarRegister
（入力画面）     （プラン表示）      （カレンダー登録）
```

---

## 注意事項

- カレンダー連携なしでも、プラン生成機能は `ANTHROPIC_API_KEY` だけで動作します
- OAuthトークンはサーバーのメモリに保存されます（再起動するとログアウト状態になります）
