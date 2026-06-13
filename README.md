# 8年度 箱根アクションプラン PDCA管理アプリ — Netlify公開手順

このフォルダ一式を GitHub に置いて Netlify と連携すると、AIアドバイス機能つきで公開できます。
（ドラッグ&ドロップ方式では AI が動かないため、GitHub連携方式にしています）

---

## アプリの機能

- 数値目標①〜⑧：予算に対する実績を入力 → 評価点を自動算出（月次・総合評価つき）
- **施設内の取組み（フリー課題）**：ハラスメント防止・採用強化・安全衛生など、数値目標以外のテーマを月ごとに自由に追加してPDCA管理。各課題は「達成度（自己評価0〜100%）」スライダー＋PDCA記入＋AIアドバイス＋削除に対応
- 入力はすべてブラウザに自動保存（月をまたいで継続）

---

## 全体の流れ（所要 約20〜30分）

1. Anthropic APIキーを取得する
2. このフォルダを GitHub にアップする
3. Netlify で GitHub と連携してデプロイする
4. Netlify に APIキーを環境変数として登録する
5. 公開URLで動作確認

---

## STEP 1. Anthropic APIキーを取得

1. https://console.anthropic.com を開いてログイン（無料登録可）
2. 左メニュー **Billing（請求）** で支払い方法を登録し、少額（例: $5〜$10）をチャージ
   - ※ Claude Pro/Max のサブスクとは別。API利用は使った分だけの従量課金です
   - ※ 使い過ぎ防止に、Billing で「月の上限額」や「通知アラート」を設定しておくと安心
3. **API Keys** → **Create Key** でキーを発行
4. 表示されたキー（`sk-ant-...`）を**その場でコピー**（再表示されません）

---

## STEP 2. GitHub にアップロード

GitHubアカウントが無ければ https://github.com で作成。

### 一番かんたんな方法（ブラウザだけ）
1. GitHub で **New repository** → 名前を `hakone-pdca` などにして Create
2. リポジトリ画面の **uploading an existing file** をクリック
3. このフォルダの中身（`src` フォルダや `package.json` など全部）をドラッグ&ドロップ
4. **Commit changes** で確定

> `node_modules` と `dist` はアップ不要です（`.gitignore` で除外済み）。

---

## STEP 3. Netlify でデプロイ

1. https://app.netlify.com にログイン
2. **Add new project（旧 Add new site）** → **Import an existing project**
3. **GitHub** を選び、STEP 2 で作ったリポジトリを選択
4. ビルド設定は自動で読み込まれます（`netlify.toml` に記載済み）
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
   そのまま **Deploy** を押す

---

## STEP 4. APIキーを環境変数に登録（重要）

1. Netlify のプロジェクト画面 → **Site configuration** → **Environment variables**
2. **Add a variable** → **Add a single variable**
   - Key: `ANTHROPIC_API_KEY`
   - Value: STEP 1 でコピーしたキー（`sk-ant-...`）
3. 保存後、**Deploys** タブ → **Trigger deploy** → **Deploy site** で再デプロイ
   （環境変数を反映させるため、登録後の再デプロイが必要です）

> APIキーはサーバー側（Netlify Function）だけで使われ、ブラウザには出ません。安全です。

---

## STEP 5. 動作確認

- 公開URL（`https://〇〇.netlify.app`）を開く
- 月を選び、各項目に実績を入力 → 評価点が出るか確認
- 「AIに改善アドバイスを聞く」を押して、アドバイスが返るか確認

---

## よくあるつまずき

- **AIだけ動かない / 「APIキーが未設定です」と出る**
  → STEP 4 の環境変数登録 + 再デプロイができているか確認
- **AIが「通信エラー」と返る**
  → Anthropic Console の Billing にクレジット残高があるか確認
- **入力が消える**
  → 保存はブラウザごと。別のPC・別ブラウザでは引き継がれません（共有したい場合はご相談を）

---

## ローカルで試したい場合（任意）

```bash
npm install
npm run build      # ビルド確認
```
AIまで含めてローカル確認するには Netlify CLI（`npx netlify dev`）が必要です。
