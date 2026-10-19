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

## 開発用コマンド

- `npm test` : テストを実行する
- `npm run typecheck` : 型チェック
- `npm run build` : 本番ビルド

## 立ち絵素材について

立ち絵の素材はこのリポジトリに同梱していません。
使う素材の利用規約は、利用者自身が確認し、守ってください。

## ライセンス

MIT
