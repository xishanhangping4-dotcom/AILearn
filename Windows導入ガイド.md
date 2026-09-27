# Windowsで使う方へ（ベータ対応）

このキットはWindowsでも動くように作ってありますが、**動作確認の中心はMacです。**
うまくいかない箇所があったら、画面の文章をそのままClaudeに貼って相談してください。

---

## いちばん簡単な導入（おすすめ）

Macと同じです。コマンド入力は要りません。

1. Claudeアプリを開いてログインする
2. 上の「**Code**」タブを選ぶ
3. 「フォルダを選択」で、この `note-kit` フォルダを選ぶ
4. 入力欄に「**セットアップして**」と打ってEnter

あとはAIが、Windows向けのやり方で案内してくれます。

---

## 手動で導入する場合

### 使うのは「PowerShell」です

コマンドは**PowerShell（パワーシェル）**で実行してください。
スタートボタンを右クリック →「ターミナル」または「Windows PowerShell」を選ぶと開きます。
（黒い画面の「コマンドプロンプト」では、下のコマンドは動きません）

### Step 1. フォルダを置く

`note-kit` フォルダを、**自分のユーザーフォルダの直下**に置きます。
置いたあとが `C:\Users\あなたの名前\note-kit` になっていればOKです。

### Step 2. スキルをClaudeに読み込ませる

PowerShellに次を貼り付けてEnter：

```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null; Copy-Item -Recurse -Force "$HOME\note-kit\skills\*" "$HOME\.claude\skills\"
```

そのあと**Claudeを一度閉じて、開き直してください。**

### Step 3. 設定ファイルを埋める

`note-kit` フォルダの中の `profile.md` をメモ帳などで開いて記入します。
（内容はMacと共通です。詳しくは「はじめにお読みください.md」のStep 3を見てください）

### Step 4. note入稿ツールの準備

PowerShellで、上から順に1行ずつ実行します。

```powershell
cd $HOME\note-kit\note-draft
```

```powershell
npm install
```

```powershell
npx playwright install chromium
```

> 150MBほどのダウンロードが走ります。数分かかることがあります。

```powershell
npm run login
```

> ブラウザが開くので、あなたが手でnoteにログインしてください。パスワードは保存されません。

これで準備完了です。使い方はMacと同じ（「はじめにお読みください.md」の「1本書いてみる」へ）。

---

## Windowsだけの注意点

- **図解の文字の見た目が少し変わります**：Macはヒラギノ、Windowsは游ゴシック／メイリオという標準の書体で描かれます。レイアウトは同じです
- **環境の点検**は同じコマンドで動きます：`cd $HOME\note-kit\note-draft` のあと `npm run doctor`
- セキュリティソフトがブラウザの自動操作を止めることがあります。その場合は一時的に許可してください

## うまくいかないとき

- 「スクリプトの実行が無効」と赤い文字が出る → PowerShellで `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` を実行してから再挑戦（何をするか：ダウンロードした道具の実行を、あなたのアカウントに限って許可する設定です）
- それ以外はMacと共通です。「はじめにお読みください.md」の「困ったときは」を見てください
