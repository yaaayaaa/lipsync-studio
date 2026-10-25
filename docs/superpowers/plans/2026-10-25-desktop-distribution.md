# デスクトップ版の配布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** lipsync-studio を Electron で包み、Mac（署名・公証済み）と Windows（署名なし）のアプリとして GitHub Releases から配り、知らせなしで自動更新する。

**Architecture:** 画面は今の Vite + React のビルド（`dist/`）をそのまま使い、Electron のカスタムスキーム `app://lipsync-studio/` で読み込む（オリジンを固定して IndexedDB を守る）。VOICEVOX への通信は preload → メインプロセスの `net.fetch` に通し、CORS とエンジン側の設定を避ける。パッケージ化と自動更新は electron-builder + electron-updater（GitHub provider）。

**Tech Stack:** Electron 43.7.9、electron-builder、electron-updater、TypeScript、Vite 8、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-25-desktop-distribution-design.md`

## Global Constraints

- Electron は `43.7.9` に固定する（2026-10-25 に Mac と Windows で H.264/AAC の書き出しを確認した版）。ほかに足す依存（electron-builder・electron-updater）は、公開から2週間以上たった版を `npm view <pkg> time` で選び、正確な版で固定する
- 保存データの名前は変えない：IndexedDB `zunda-lipsync`、localStorage の頭 `zunda-lipsync.`
- 画面の読み込み元は `app://lipsync-studio/`（このオリジンは今後変えない。変えると使う人のデータが読めなくなる）
- BrowserWindow は `contextIsolation: true`・`nodeIntegration: false`・`sandbox: true`。preload が公開するのは `window.lipsyncDesktop.engineFetch` だけ
- 秘密情報（Apple の API キー、キーチェーンのパスワード、GitHub のトークン）はリポジトリに入れない。環境変数か `~/.config/lipsync-studio-signing/` から読む
- Mac の署名 ID：`Developer ID Application: Waffle, LLC. (GZPRJF9P3F)`。キーチェーン：`~/.config/lipsync-studio-signing/signing.keychain-db`（パスワードは同じフォルダの `keychain-password`）
- GitHub：`yaaayaaa/lipsync-studio`（公開）。appId：`net.yaaaa.lipsync-studio`。productName：`lipsync-studio`
- 既存の規約：コメントは日本語で「なぜ」を書く。コミットは英語のコンベンショナル形式で、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。新しく書いたファイルだけ `npx prettier --no-semi --single-quote --print-width 120` で整える
- 毎タスクの終わりに `npx tsc -b`・`npx oxlint src tests electron`・`npx vitest run` が通ること
- macOS のファイルシステムは大文字小文字を区別しない。名前が大文字小文字違いだけのファイルを作らない

## Review Focus

- **エンジンが落ちている・URL が間違っている：** ブリッジ経由でも、今と同じ「VOICEVOX に接続できません」の案内が出る（main の失敗が renderer で `TypeError` になり、`VoicevoxError('unreachable')` に変わる）→ Task 3 のテスト
- **書き出しの途中で中止・タイムアウト：** `AbortSignal` が効き、ブリッジの fetch が `AbortError` で止まる → Task 3 のテスト
- **`app://` で `../` を含むパスや存在しないパス：** `dist/` の外のファイルを返さない。存在しないパスは `index.html` に落ちない（画面は1ページなので 404 でよい）→ Task 2 のテスト
- **エンジン以外の URL への要求：** main は VOICEVOX の API のパス以外・`http(s)` 以外を断る（任意の URL に送る中継にならない）→ Task 3 のテスト
- **再起動後のデータ：** 同じオリジンで開くので、キャラ・台本・設定が残る → Task 2 の手動確認と Task 7 の確認

---

### Task 1: Web 版の配布をやめる

**Files:**
- Modify: `vite.config.ts`（VitePWA を外す）、`index.html`（apple-touch-icon の行を外す。favicon はそのまま）、`package.json` / `package-lock.json`（`vite-plugin-pwa`・`wrangler` を外し、`deploy` スクリプトを消す）、`.gitignore`（`.wrangler/` の行を消す）、`README.md`
- Delete: `wrangler.jsonc`、`public/apple-touch-icon.png`、`public/icon-192.png`
- Move: `public/icon-512.png` → `build/icon-source.png`（Task 6 でアプリのアイコンを作る元。`public/icon.svg` は favicon として残す）

- [ ] **Step 1:** 上の通り外す。`npx vite build` の出力に `sw.js`・`manifest.webmanifest`・`registerSW.js` がないことを確かめる
- [ ] **Step 2:** Cloudflare の Worker を消す：`npx --yes wrangler@4.149.0 delete --name lipsync-studio --force`。続けて `curl -s -o /dev/null -w "%{http_code}" https://lipsync-studio.yaaaa.net/` が 200 以外になることを確かめる（DNS の反映に数分かかることがある）
- [ ] **Step 3:** README から「一度開くと…オフラインで開けます」の段落を消す（起動手順の書き換えは Task 7）
- [ ] **Step 4:** tsc・oxlint・vitest を通してコミット：`chore: stop distributing as a web app`

### Task 2: Electron で画面を開く

**Files:**
- Create: `electron/main.ts`、`electron/appProtocol.ts`、`tsconfig.electron.json`、`tests/electron/appProtocol.test.ts`
- Modify: `package.json`（`electron@43.7.9` を devDependencies に、`"main": "dist-electron/main.js"`、スクリプト `electron:build`・`electron:dev`・`electron:start`）、`tsconfig.json`（references に `tsconfig.electron.json`）、`.gitignore`（`dist-electron/`）、`vitest` の include はそのまま（`tests/**/*.test.ts`）

**Interfaces:**
- Produces: `resolveAppPath(urlPath: string, root: string): string | null` — `app://lipsync-studio/<urlPath>` の `<urlPath>` を `root`（`dist/` の絶対パス）の中のファイルの絶対パスにする。`/` と空は `index.html`。正規化した結果が `root` の外なら `null`
- Produces: `APP_ORIGIN = 'app://lipsync-studio'`（`electron/appProtocol.ts`）

- [ ] **Step 1: 失敗するテストを書く**（`tests/electron/appProtocol.test.ts`）

```ts
const root = '/opt/app/dist'
expect(resolveAppPath('/', root)).toBe('/opt/app/dist/index.html')
expect(resolveAppPath('', root)).toBe('/opt/app/dist/index.html')
expect(resolveAppPath('/assets/index-abc.js', root)).toBe('/opt/app/dist/assets/index-abc.js')
expect(resolveAppPath('/%E3%81%82.png', root)).toBe('/opt/app/dist/あ.png')
expect(resolveAppPath('/../secret.txt', root)).toBeNull()
expect(resolveAppPath('/assets/%2E%2E/%2E%2E/secret.txt', root)).toBeNull()
```

- [ ] **Step 2:** `npx vitest run tests/electron` で失敗を確かめる
- [ ] **Step 3:** `electron/appProtocol.ts` に `resolveAppPath` を書く（`decodeURIComponent` → `path.posix.normalize` / `path.resolve` → `root + path.sep` で始まるかを見る。Node の `path` だけを使い、Electron を import しない：テストを Node で回すため）
- [ ] **Step 4:** テストが通ることを確かめる
- [ ] **Step 5:** `electron/main.ts` を書く
  - `protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }])` を `app.whenReady` の前に
  - `protocol.handle('app', …)`：`resolveAppPath` で解決し、`null` やファイルなしは 404、あれば `net.fetch(pathToFileURL(file))`
  - ウィンドウ：初期 1440×900、最小 960×600。`ELECTRON_DEV_URL` があればそれを、なければ `app://lipsync-studio/` を開く
  - `webContents.setWindowOpenHandler` で外部リンクは `shell.openExternal`（`https:` だけ）にして `deny`。`will-navigate` で自分のオリジン以外への移動を止める
  - メニューは Electron の既定のまま（編集メニューで Cmd/Ctrl+C/V/Z が効く）
- [ ] **Step 6:** `tsconfig.electron.json`：`include: ["electron"]`、`module: "commonjs"`、`outDir: "dist-electron"`、`types: ["node"]`、`noEmit: false`、`rootDir: "electron"`（出力が `dist-electron/main.js` になるように）。スクリプト：
  - `electron:build`：`tsc -p tsconfig.electron.json`
  - `electron:start`：`npm run build && npm run electron:build && electron .`
  - `electron:dev`：`npm run electron:build && ELECTRON_DEV_URL=http://localhost:5173 electron .`（Vite の開発サーバーは別に起動しておく）
- [ ] **Step 7: 手動確認：** `npm run electron:start` でアプリが開き、ブラウザ版と同じ画面が出る。DevTools で `location.origin === 'app://lipsync-studio'`・`isSecureContext === true`。キャラを1つ追加 → 終了 → 起動し直して残っている
- [ ] **Step 8:** コミット：`feat: open the app in an Electron window`

### Task 3: VOICEVOX への通信をメインプロセスに通す

**Files:**
- Create: `electron/engineTypes.ts`、`electron/engineRequest.ts`、`electron/preload.ts`、`src/core/voicevox/bridgeFetch.ts`、`tests/electron/engineRequest.test.ts`、`tests/core/voicevox/bridgeFetch.test.ts`
- Modify: `electron/main.ts`（`ipcMain.handle('engine:fetch', …)` と `webPreferences.preload`）、`src/ui/AppContext.tsx:76`（ブリッジがあれば `fetch` に渡す）、`src/vite-env.d.ts` か新しい `src/desktop.d.ts`（`window.lipsyncDesktop` の型）

**Interfaces:**
- Produces（共有の型は `electron/engineTypes.ts` に置き、`src` 側は `import type` で読む。逆向き（electron → src）にしない：`tsconfig.electron.json` は出力するので、src を読むと出力先の構成が崩れる。app 側の tsconfig は出力しないので問題ない）:

```ts
export interface EngineRequest { url: string; method: 'GET' | 'POST'; headers: Record<string, string>; body?: string }
export interface EngineResponse { status: number; statusText: string; headers: Record<string, string>; body: ArrayBuffer }
export interface DesktopBridge { engineFetch(req: EngineRequest): Promise<EngineResponse> }
```

`createBridgeFetch(bridge: DesktopBridge): typeof fetch` は `src/core/voicevox/bridgeFetch.ts` に置く

- Produces: `isAllowedEngineRequest(req: EngineRequest): boolean`（`electron/engineRequest.ts`）— `http:`/`https:` で、パスが `/version`・`/speakers`・`/audio_query`・`/accent_phrases`・`/mora_data`・`/synthesis` のどれか（クエリは自由）、method が GET/POST
- Consumes: `VoicevoxClientOptions.fetch`（`src/core/voicevox/client.ts:22`）。client は `TypeError` を「接続できません」に、タイムアウトの abort を「タイムアウト」に変えている（`client.ts:146-163`）

- [ ] **Step 1: 失敗するテストを書く**
  - `engineRequest.test.ts`：`http://localhost:50021/version` GET → true。`http://192.168.1.5:50021/synthesis?speaker=3` POST → true。`file:///etc/passwd` → false。`https://example.com/` → false。`http://localhost:50021/setting` → false。`http://localhost:50021/../version` は URL 正規化後のパスで判定（`/version` なら true でよい）
  - `bridgeFetch.test.ts`（偽の bridge を渡す）：
    - status 200 と JSON の body → `await res.json()` が中身になり、`res.ok === true`
    - status 422 → `res.ok === false`、`res.status === 422`、`await res.text()` が本文
    - bridge が reject → `TypeError` で reject（`VoicevoxClient` に通して `kind === 'unreachable'` になることも1件）
    - `signal` を abort → `name === 'AbortError'` で reject（bridge が返る前でも）
    - `init.body` が文字列で、`headers` が `Headers` でも plain object でも bridge に `Record<string,string>` で渡る
- [ ] **Step 2:** 失敗を確かめる
- [ ] **Step 3:** 実装する
  - `createBridgeFetch`：`Request` を作って url・method・headers・body（`await req.text()`、GET では渡さない）を取り出し、bridge を呼ぶ。`signal` の abort と競争させる。結果から `new Response(body, { status, statusText, headers })` を返す。bridge の失敗はすべて `new TypeError(...)` にする
  - `ipcMain.handle('engine:fetch')`：`isAllowedEngineRequest` でなければ throw。`net.fetch` して `arrayBuffer()` で返す。main 側でも 150 秒で打ち切る（renderer のタイムアウト 120 秒より長く）
  - `preload.ts`：`contextBridge.exposeInMainWorld('lipsyncDesktop', { engineFetch: (req) => ipcRenderer.invoke('engine:fetch', req) })`
  - `AppContext.tsx`：`window.lipsyncDesktop` があれば `new VoicevoxClient({ baseUrl: engineUrl, fetch: createBridgeFetch(window.lipsyncDesktop) })`。ブラウザ（開発用の `npm run dev`）では今のまま
- [ ] **Step 4:** テストが通ることを確かめる
- [ ] **Step 5: 手動確認：** **初期設定の** VOICEVOX エンジン（`docker run --rm -d --name lss-probe -p 127.0.0.1:50131:50021 voicevox/voicevox_engine:cpu-ubuntu22.04-latest`、`--cors_policy_mode` を付けない）にアプリの設定で `http://localhost:50131` を入れてつながる。PSD を読み込み → 台本で再生 → 1行の書き出し → まとめて書き出し（mp4 と zip）。保存ダイアログが出て保存できる（出なければ `session.on('will-download')` で保存先を選ばせる）。エンジンを止めると「接続できません」の案内が出る。終わったら `docker stop lss-probe`
- [ ] **Step 6:** コミット：`feat: route VOICEVOX requests through the main process`

### Task 4: 画面の文言をデスクトップ版に合わせる

**Files:**
- Modify: `src/ui/EngineBanner.tsx:20`、`src/ui/settings/EngineSettingsPanel.tsx:43`、ほかに `grep -rn "CORS\|ブラウザ\|Chrome\|Edge" src` で見つかるブラウザ前提の文言

- [ ] **Step 1:** CORS の話を消し、「VOICEVOX が起動しているか、URL が正しいか確認してください」の趣旨にする。別のパソコンのエンジンを使う場合は「そのパソコンで VOICEVOX を `--host 0.0.0.0` 付きで起動」程度の一言にする
- [ ] **Step 2:** 既存テストで文言を見ているものがあれば合わせる。tsc・oxlint・vitest
- [ ] **Step 3:** コミット：`fix: drop browser-only hints from engine messages`

### Task 5: パッケージ化（未署名でまず通す）

**Files:**
- Create: `electron-builder.yml`、`build/icon.png`（1024×1024、`build/icon-source.png` から作る。足りなければ `public/icon.svg` を Chrome で 1024px に描き出す。Task 1 の前の `scratchpad/pw/icons.mjs` と同じやり方）、`build/entitlements.mac.plist`
- Modify: `package.json`（electron-builder を devDependencies に、スクリプト `dist:mac`・`dist:win`）、`.gitignore`（`release/`）

- [ ] **Step 1:** `electron-builder.yml`：
  - `appId: net.yaaaa.lipsync-studio`、`productName: lipsync-studio`、`directories.output: release`
  - `files`：`dist/**`、`dist-electron/**`、`package.json` だけ（`src/`・`samples/`・`docs/` を入れない）
  - `mac`：`target: [dmg, zip]`、`arch: [arm64, x64]`（universal にしない：大きさが倍になるため）、`hardenedRuntime: true`、`entitlements` と `entitlementsInherit` に `build/entitlements.mac.plist`（`com.apple.security.cs.allow-jit`・`com.apple.security.cs.allow-unsigned-executable-memory`）、`category: public.app-category.video`
  - `win`：`target: nsis`、`arch: [x64]`。`nsis`：`oneClick: false`、`allowToChangeInstallationDirectory: true`
  - `publish`：`provider: github`、`owner: yaaayaaa`、`repo: lipsync-studio`
- [ ] **Step 2:** スクリプト：`dist:mac` = `npm run build && npm run electron:build && electron-builder --mac`、`dist:win` = 同様に `--win`。この Task では `CSC_IDENTITY_AUTO_DISCOVERY=false` を付けて未署名で作る
- [ ] **Step 3:** Mac でビルドして `release/` の arm64 の .app を開き、Task 3 の手動確認をもう一度（初期設定のエンジン、書き出し、再起動後のデータ）
- [ ] **Step 4:** Windows 用をこの Mac でビルドし、gen2 の Windows VM（`ssh svwin`）に入れて確かめる。GUI は **対話セッションのスケジュールタスク** で起こす（ssh から直接起こすと session 0 で窓が出ない）：

```powershell
$a = New-ScheduledTaskAction -Execute 'C:\Users\waffle\lss\lipsync-studio-Setup.exe'
$p = New-ScheduledTaskPrincipal -UserId waffle -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName lss -Action $a -Principal $p -Force; Start-ScheduledTask -TaskName lss
```

  VM の中の VOICEVOX は無いので、エンジン URL に gen2 から届く VOICEVOX（Mac の `100.x.x.x:50121` など、Tailscale で届くもの）を入れて、書き出しまで通す。画面の確認はスクリーンショット（`Add-Type -AssemblyName System.Windows.Forms` で撮る PowerShell をタスクで実行）で行う。終わったらタスクを消す
- [ ] **Step 5:** コミット：`build: package the desktop app with electron-builder`

### Task 6: Mac の署名と公証

**Files:**
- Create: `scripts/dist-mac.sh`（キーチェーンを開き、環境変数を整えて `electron-builder --mac` を呼ぶ）
- Modify: `electron-builder.yml`（`mac.notarize: true`）、`package.json`（`dist:mac` を `scripts/dist-mac.sh` に）

- [ ] **Step 1:** 公証に使う App Store Connect の API キーを決める：`~/.appstoreconnect/private_keys/` の3本のうち、Waffle, LLC.（GZPRJF9P3F）のもの。Key ID と Issuer ID は `grep -rn "ASC_KEY_ID\|ASC_ISSUER_ID\|issuer" ~/Documents/repo/*/fastlane* ~/Documents/repo/*/.env* 2>/dev/null` などで探し、`xcrun notarytool history --key <p8> --key-id <id> --issuer <issuer>` が通るもので確かめる。見つからなければ止めて相談する
- [ ] **Step 2:** `scripts/dist-mac.sh`：`security unlock-keychain -p "$(cat ~/.config/lipsync-studio-signing/keychain-password)" ~/.config/lipsync-studio-signing/signing.keychain-db`、`CSC_KEYCHAIN` にそのキーチェーン、`CSC_NAME="Waffle, LLC. (GZPRJF9P3F)"`、`APPLE_API_KEY`・`APPLE_API_KEY_ID`・`APPLE_API_ISSUER` は `~/.config/lipsync-studio-signing/notary.env`（リポジトリ外、600）から読む。キーやパスワードはスクリプトに書かない
- [ ] **Step 3:** ビルドし、`codesign --verify --deep --strict --verbose=2 <app>`、`spctl --assess --type execute --verbose <app>` が `accepted source=Notarized Developer ID`、`xcrun stapler validate <dmg>` が通る
- [ ] **Step 4:** dmg を mini に送り（`scp`）、ダウンロードしたファイルと同じ扱いにするため `xattr -w com.apple.quarantine "0081;$(printf %x $(date +%s));Safari;" <dmg>` を付けてから開き、警告なしで起動することを確かめる
- [ ] **Step 5:** コミット：`build: sign and notarize the macOS app`

### Task 7: 自動更新と最初のリリース

**Files:**
- Create: `electron/updater.ts`
- Modify: `electron/main.ts`（パッケージ版だけ、起動から少し後に `autoUpdater.checkForUpdates()`）、`package.json`（electron-updater を dependencies に。`version` を `0.1.0` に）、`README.md`（必要なもの・入れ方・起動の手順をダウンロードして開く形に。「通信するのは VOICEVOX エンジンだけ」に、更新の確認で GitHub と通信する旨を足す。開発の手順は `npm run electron:dev` に）

- [ ] **Step 1:** `electron/updater.ts`：`autoUpdater.autoDownload = true`、`autoInstallOnAppQuit = true`、知らせは出さない。失敗はログに残すだけで、画面には出さない（オフラインでも邪魔をしない）。`app.isPackaged` のときだけ動かす
- [ ] **Step 2:** GitHub に `yaaayaaa/lipsync-studio` を公開で作る前に、履歴の秘密情報を調べる：`git log -p --all | grep -nE "BEGIN (RSA|EC|OPENSSH)? ?PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[0-9A-Za-z]{36}|github_pat_|sk-[A-Za-z0-9]{20,}|AuthKey_|password\s*[:=]"`、`git log --all --stat | grep -iE "\.(p8|p12|key|pem|psd)$"`。見つかったら止めて相談する
- [ ] **Step 3:** `gh repo create yaaayaaa/lipsync-studio --public --source . --remote origin`、`git push -u origin feat/v1`。既定のブランチを `feat/v1` にするか main を作るかは、push の前に main を `feat/v1` から作って既定にする（`git branch main feat/v1 && git push -u origin main`）
- [ ] **Step 4:** `GH_TOKEN`（`yaaayaaa` に書き込める PAT。`~/.local/bin/gh` のラッパーが使うものと同じ）を付けて、Mac（Task 6 のスクリプト）と Windows の両方を `--publish always` でビルドし、v0.1.0 を下書きリリースにする。中身（dmg・zip・exe・`latest-mac.yml`・`latest.yml`・blockmap）がそろったら公開する
- [ ] **Step 5: 更新の確認：** Mac に v0.1.0 を入れて起動。`version` を `0.1.1` にして同じ手順でリリース → v0.1.0 を起動 → 終了 → 起動で 0.1.1 になる（ウィンドウのタイトルかアプリについての画面で版を確かめる）。Windows でも同じ。確認に使った 0.1.1 はそのまま残してよい
- [ ] **Step 6:** コミット：`feat: update silently from GitHub Releases`。README の変更は `docs: describe installing the desktop app` で別コミット
