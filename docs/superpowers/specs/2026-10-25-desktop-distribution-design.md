# デスクトップ版として配布する — 設計

日付: 2026-10-25 / 対象ブランチ: feat/v1

## 意図と理由

lipsync-studio を Web アプリとしてではなく、ダウンロードして開く普通のソフト（Mac / Windows）として配る。

Web 版として https://lipsync-studio.yaaaa.net に公開して試した結果、公開サイトから手元の VOICEVOX エンジンにつなぐには、使う人が初回に次の2つをしないといけないと分かった（2026-10-25 に実測）。

1. Chrome の「ローカルネットワークへのアクセス」を許可する（許可しないと Chrome が loopback への通信を止める）
2. VOICEVOX エンジンの設定（`http://localhost:50021/setting`）で公開サイトのオリジンを許可し、エンジンを再起動する（初期設定の `cors_policy_mode=localapps` は localhost と `app://.` 以外のオリジンを 403 で断る。設定は再起動まで効かない）

両方そろうと通る（version・audio_query とも 200）。VOICEVOX を使う人の多くにとってこれは最初の大きなつまずきになるので、最初からデスクトップ版で配る。

## ゴール

- Mac と Windows で、ダウンロードして開くだけで使える。VOICEVOX エンジン（既定 `http://localhost:50021`）に、エンジン側の設定なしでつながる
- 今の機能（キャラ設定・台本・書き出し・設定）が、ブラウザ版と同じに動く。とくに WebCodecs による H.264/AAC の書き出し
- 新しい版は知らせを出さずに裏で取得し、次の起動から新しい版になる
- Mac 版は署名と公証をして、開くときに「開発元を確認できません」が出ない

## やらないこと

- Web 版の提供（公開サイトは閉じる）
- Windows のコード署名（最初は署名なしで出す。SmartScreen の警告は「詳細情報 → 実行」で開ける。使う人が増えたら考える）
- 新しい版の通知・更新の確認ボタン
- OS ネイティブの UI（画面は今の React のまま）
- VOICEVOX エンジンの同梱（使う人が VOICEVOX を自分で入れて起動する前提は今のまま）
- Linux 版

## 失敗とみなすこと（動いても）

- 起動のたびにキャラ・台本・設定が消える（保存先のオリジンが起動ごとに変わる等）
- 書き出しがブラウザ版より遅い・壊れる
- 使う人に VOICEVOX 側の設定変更や、追加のソフトの導入を求める

## 決まっていること

- **枠組み:** Electron。中身が Chrome と同じなので、これまで Chrome で確かめた書き出しがそのまま動く。Tauri は Mac で WebKit になり H.264/AAC の WebCodecs が動く保証がないので選ばない（ユーザー了承済み）
- **対象 OS:** Mac と Windows の両方
- **Mac の署名:** waffle の Apple Developer アカウントで Developer ID 署名と公証をする。資格情報は環境変数で渡し、リポジトリに入れない
- **Windows の署名:** しない
- **更新:** 自動更新。GitHub Releases から取得し、知らせは出さず、次の起動で入れ替わる
- **置き場所:** GitHub `yaaayaaa/lipsync-studio`（公開リポジトリ。まだ作っていない）。配布ファイルもここの Releases に置く
- **公開サイト:** 閉じる。Cloudflare の Worker `lipsync-studio`（カスタムドメイン `lipsync-studio.yaaaa.net`）を削除し、`wrangler.jsonc`・`npm run deploy`・wrangler の依存を外す
- **PWA:** 外す（`vite-plugin-pwa`、manifest、Service Worker の登録）。`public/` のアイコンはアプリのアイコンの元として使ってよい
- **保存データの名前:** IndexedDB の名前 `zunda-lipsync` と localStorage の頭 `zunda-lipsync.` は変えない（既存のコメントの通り）

## 私（Claude）の判断で決めたこと

- **VOICEVOX へのつなぎ方:** 画面（renderer）はカスタムスキーム（例 `app://lipsync-studio`）で読み込み、オリジンを起動ごとに固定する（IndexedDB・localStorage がオリジンに結びつくため。ローカルの http サーバーで配ると、ポートが変わるたびにデータが消えるか、ポートの衝突に悩む）。VOICEVOX への通信は renderer から直接せず、メインプロセス経由（`net.fetch` 等）で行う。メインプロセスの通信は CORS の対象外なので、エンジンの設定に関係なく、別のパソコンのエンジンにもつながる。`VoicevoxClient` はすでに `fetch` を差し替えられる（`src/core/voicevox/client.ts` の `VoicevoxClientOptions.fetch`）ので、そこに preload が公開する関数を渡す。メインプロセスは任意の URL に送るプロキシにならないよう、設定されたエンジンの URL への要求だけを通す
- **カスタムスキームの権限:** `standard`・`secure`・`supportFetchAPI`・`stream` などを付け、WebCodecs や IndexedDB が secure context で動くようにする
- **書き出しの保存:** 今の `<a download>` のまま、Electron の保存ダイアログで保存先を選ばせる
- **パッケージ化:** electron-builder。Mac は dmg と zip（自動更新に zip が要る）、Windows は NSIS インストーラー。自動更新は electron-updater（GitHub provider）
- **ビルドする場所:** 最初はこの Mac で両 OS 分を手元ビルドしてリリースする。CI（GitHub Actions）は後回し
- **セキュリティ:** `contextIsolation: true`・`nodeIntegration: false`・`sandbox: true`。preload が公開するのは VOICEVOX への通信の関数だけ。外部リンクは既定のブラウザで開き、アプリ内で別のサイトへ移動させない
- **エンジン URL の受け渡し:** エンジン URL は今まで通り renderer の IndexedDB に置く。renderer は要求ごとに URL を main に渡し、main は `http:`/`https:` で、かつ VOICEVOX の API のパス（`/version`・`/speakers`・`/audio_query`・`/synthesis` など、`client.ts` が使うもの）への要求だけを通す。renderer は自前のコードしか読み込まないので、これで十分とする
- **書き出しが Electron で動くか:** 2026-10-25 に最小の Electron 43.7.9（Chromium 150）で確かめ済み。Mac（この Mac）と Windows（gen2 の Windows VM、GPU なし）の両方で、`canEncodeVideo('avc')`・`canEncodeAudio('aac')` が true で、mediabunny の CanvasSource + AudioBufferSource で 1920×1080・3秒の mp4 が作れ、ffprobe で h264 + aac 48kHz を確認した。Windows VM ではハードウェアのエンコーダがなく（`prefer-hardware` は非対応）、既定の選択でソフトウェアに落ちて動いた。計画では、実アプリを包んだあとに両 OS で実際の書き出しを確かめる
- **Web 版のデータの移行:** しない。Web 版は 2026-10-25 に1日公開しただけで、使っている人はいない
- **画面の文言:** ブラウザ前提の文言（エンジン設定の「エンジン側で CORS の許可も必要です」、エンジンにつながらないときの案内の CORS の話など）も、デスクトップ版に合わせて直す
- **GitHub への公開:** 今の `feat/v1` の履歴をそのまま公開リポジトリに push し、そこを origin にする。push の前に、履歴に秘密情報（鍵・トークン・パスワード）や配布できない素材が入っていないかを調べる（`samples/` は git 管理外）。リリースの公開には GitHub のトークンを環境変数 `GH_TOKEN` で渡す
- **Mac の公証:** 手元にある App Store Connect の API キーで `notarytool` を使う（Apple ID のパスワードは使わない）

## 作り手に任せること

- Electron と electron-builder の具体的な版（2週間以上前に出た版を固定する）
- Mac を arm64 と x64 の別々にするか universal にするか
- ファイル構成（例 `electron/main.ts`・`electron/preload.ts`）と、そのビルド方法
- 開発時の起動方法（Vite の開発サーバーを Electron で開くなど）。今の `npm run dev`（ブラウザで開く）は開発用に残してよい
- ウィンドウの初期サイズ・最小サイズ、メニューバーの中身（標準の編集メニューで Ctrl/Cmd+C/V/Z が効くこと）
- アプリのアイコン（今の仮アイコンから作る）
- README の書き換え（必要なもの・起動手順を、ダウンロードして開く形に。「通信するのは VOICEVOX エンジンだけ」の一文は、更新の確認で GitHub と通信する旨を足す）

## 確かめ方

- 両 OS のビルドを実際に起動し、PSD の読み込み → 台本で再生 → 1行の書き出し → まとめて書き出し（mp4 と zip）が通る
- 初期設定の VOICEVOX エンジン（`--cors_policy_mode` を付けない）につながる
- アプリを終了して起動し直しても、キャラ・台本・設定・テーマ・パネルの並びが残る
- Mac で、ダウンロードした dmg から入れて開いても警告が出ない（公証済み）
- 古い版を入れた状態で新しい版をリリースし、起動 → 終了 → 起動で新しい版になる
