# zunda-lipsync

PSD の立ち絵を VOICEVOX の音声にリップシンクさせ、mp4 として書き出すブラウザアプリです。
PSD・セリフ・音声は外部に送信しません。通信するのは、設定した VOICEVOX エンジンの URL だけです。

## 必要なもの

- [VOICEVOX](https://voicevox.hiroshiba.jp/)（エンジンを起動しておく。既定の URL は `http://localhost:50021`）
- Node.js
- Chrome または Edge のデスクトップ版（Windows / macOS）

## 起動手順

1. `npm install`
2. VOICEVOX を起動する
3. `npm run dev`

別の端末など、`localhost` 以外の URL でこのアプリを開く場合は、その URL（オリジン）を VOICEVOX 側で許可する必要があります。
`http://localhost:50021/setting` を開き、許可するオリジンに追加してください。

## 使い方

1. **キャラ追加**：「キャラ設定」で立ち絵の .psd を追加する。レイヤーツリーで表示を切り替えられる
2. **口グループと母音の割り当て**：口のレイヤーが入ったグループを選び、あ・い・う・え・お・閉じ にそれぞれ口を割り当てる。「あいうえお」で試し再生できる。声（話者）もここで選ぶ
3. **表情**：今の表示状態を表情として保存する。PSDTool の .pfv も取り込める
4. **セリフ**：「セリフ」でセリフを追加し、キャラ・表情・話速（0.5〜2.0）を選ぶ。試聴とプレビューができる。解像度・立ち絵の大きさ・背景色もここで設定する
5. **書き出し**：1行ずつ、または全行をまとめて（zip）書き出す。H.264 + AAC、30fps の mp4 になる。背景は単色で、既定は `#00FF00`（動画編集ソフトのクロマキー用）

PSD 以外の素材は不要です。試すだけなら、`npx tsx scripts/make-sample-psd.ts` でサンプル PSD（`samples/sample.psd`、git 管理外）を作れます。

画面の配色は OS のライト / ダーク設定に従います（書き出す動画の色には影響しません）。

## VOICEVOX のクレジット表記

VOICEVOX で作った音声を公開するときは、クレジット表記が必要です。
書き出し後に `VOICEVOX:キャラ名` の形で表示されるので、動画の概要欄などに記載してください。
話者ごとの利用規約は、利用者自身が確認し、守ってください。

## 動作確認

実機での確認項目と、開発時に確認した内容、既知の制限は [docs/manual-check.md](docs/manual-check.md) にあります。

## 開発用コマンド

- `npm test` : テストを実行する
- `npm run typecheck` : 型チェック
- `npm run lint` : oxlint
- `npm run build` : 本番ビルド
- `npx tsx scripts/make-sample-psd.ts` : サンプル PSD の生成
- `npx tsx scripts/check-timeline.ts` : 口パクのタイムラインを本物のエンジンで照合する

## 立ち絵素材について

立ち絵の素材はこのリポジトリに同梱していません。
使う素材の利用規約は、利用者自身が確認し、守ってください。

## ライセンス

MIT

### 使っている素材のライセンス

- アイコン：[Lucide](https://lucide.dev/)（`lucide-react`）。ISC ライセンス、Copyright (c) 2026 Lucide Icons and Contributors。全文は `node_modules/lucide-react/LICENSE` と https://lucide.dev/license にあります
