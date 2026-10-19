# zunda-lipsync v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PSD 立ち絵を VOICEVOX の音声に合わせて口パクさせ、セリフ1行ごとに単色背景・音声付き mp4 を書き出すブラウザアプリの最初の版を作る。

**Architecture:** サーバーを持たない Vite + React の SPA。PSD 解析・PSDTool 互換・VOICEVOX 通信・リップシンク計算・合成・エンコード・保存は `src/core/` 以下の UI 非依存モジュールに置き（将来のネイティブ化に備える）、`src/ui/` は React でそれらを呼ぶだけにする。書き出しは「(キャラ, 表情) ごとに6種類の口のフレームを事前合成 → フレームごとに選んで WebCodecs でエンコード」。

**Tech Stack:** Vite 8 / React 19 / TypeScript / Vitest 5 / ag-psd 31 / Mediabunny 1.61 / idb 8 / fflate 0.8 / fake-indexeddb（テストのみ）

**Spec:** `docs/superpowers/specs/2026-10-19-zunda-lipsync-design.md`

## Global Constraints

- PSD・セリフ・音声を外部に送らない。外部への通信は、設定された VOICEVOX エンジン URL へのリクエストだけ。
- VOICEVOX エンジン URL の既定値は `http://localhost:50021`。設定で変更でき、IndexedDB に保存する。
- 話速 `speedScale` の範囲は 0.5〜2.0、既定は 1.0。
- 書き出しは H.264 + AAC の mp4。30fps 固定。背景は単色で、既定は `#00FF00`、変更できる。
- 解像度のプリセットは 1920×1080 と 1280×720（既定は 1920×1080）。立ち絵の拡大率 `scale` は「立ち絵の高さ ÷ 動画の高さ」で、範囲は 0.3〜1.5、既定は 0.9。立ち絵は水平・垂直とも中央に置く。
- 対象環境は Windows と macOS の Chrome・Edge デスクトップ版。起動時に非対応を検出したら、画面に表示する。
- 母音から口への対応：`a,i,u,e,o` はそのまま、`A,I,U,E,O`（無声化）は小文字の母音、`N`・`cl`・`pau`・前後の無音は `closed`。子音区間は、そのモーラの母音の口にする。
- 立ち絵素材をリポジトリに入れない（テストの PSD フィクスチャも ag-psd でプログラム生成する）。
- ライセンスは MIT。コミットはコンベンショナルコミット形式（英語）。`main` へ直接コミットしない。
- core のモジュールは React と DOM グローバルに依存しない。canvas は引数で受け取る。

## Review Focus

1. **口の割り当てが一部未設定のまま書き出す。** 未設定の母音は `closed` の割り当てを使う。`closed` も未設定なら、表情の口をそのまま出す（落ちない）。→ Task 3 にテストあり。
2. **VOICEVOX が 422 を返す（空文字・記号だけのセリフ）、またはエンジンが途中で落ちる。** その行だけをエラー表示にし、「全行を書き出す」は残りの行を続ける。→ Task 6・Task 11 にテストあり。
3. **行が参照するキャラや表情が削除されている。** その行に「キャラ未設定」と出して書き出しを無効にし、ほかの行は動く。→ Task 9・Task 11 にテストあり。
4. **同じ階層に同名レイヤーがある PSD と `.pfv`。** `\N` 指定で正しいほうを表示する。見つからない行は数えて報告する。→ Task 4 にテストあり。
5. **話速を変えたときの口のずれ。** タイムラインの総時間がエンジンの丸め規則と一致する。→ Task 5 にテストと、実エンジンでの照合手順あり。

---

## File Structure

```
src/core/psd/types.ts          LayerNode, LayerId, VisibilityState
src/core/psd/layerTree.ts      ag-psd Layer[] → LayerNode[]（名前規則の解釈）
src/core/psd/visibility.ts     初期状態・表示切替（ラジオ/常時表示）
src/core/psd/pfv.ts            .pfv 解析と表情への適用
src/core/psd/compose.ts        描画リスト生成（純粋）と canvas への合成
src/core/character/types.ts    Character, Expression, Vowel, MouthMap, ScriptLine, ExportSettings
src/core/character/mouth.ts    口の差し替え（applyMouth / resolveMouthLayer）
src/core/lipsync/timeline.ts   AudioQuery → 口タイムライン
src/core/voicevox/types.ts     AudioQuery, Speaker 型
src/core/voicevox/client.ts    VOICEVOX HTTP クライアント
src/core/export/frames.ts      口ごとの事前合成とフレーム予定表
src/core/export/encode.ts      Mediabunny による mp4 生成・対応チェック
src/core/export/naming.ts      ファイル名・クレジット文字列
src/core/storage/db.ts         IndexedDB（キャラ・PSD・セリフ・設定）
src/ui/App.tsx                 タブ（キャラ設定 / セリフ）・エンジン状態バナー
src/ui/character/*.tsx         3列のキャラ設定画面
src/ui/script/*.tsx            セリフ一覧・試聴・プレビュー・書き出し
tests/                         src と同じ構成で *.test.ts
tests/fixtures/makePsd.ts      テスト用 PSD をプログラム生成
```

---

### Task 1: プロジェクトの土台

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `LICENSE`, `README.md`, `tests/smoke.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run dev` / `npm test` / `npm run build` / `npm run typecheck`

- [ ] **Step 1:** `npm create vite@latest . -- --template react-ts` 相当の構成を作る（既存の `docs/` と `.gitignore` は残す）。依存を追加する：`ag-psd@^31 mediabunny@^1.61 idb@^8 fflate@^0.8`、dev 依存は `vitest@^5 fake-indexeddb tsx`。`package-lock.json` をコミットする。
- [ ] **Step 2:** `vite.config.ts` に Vitest の設定（`environment: 'node'`、`include: ['tests/**/*.test.ts']`）を足し、`package.json` に `"test": "vitest run"` と `"typecheck": "tsc -b --noEmit"` を足す。
- [ ] **Step 3:** `tests/smoke.test.ts` に `expect(1 + 1).toBe(2)` を書く。
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` を実行する。期待結果：すべて成功。
- [ ] **Step 5:** `LICENSE`（MIT, 2026, yaaaa-waffle）と `README.md` を書く。README には、概要・必要なもの（VOICEVOX、Node.js、Chrome/Edge）・起動手順（`npm install` → VOICEVOX を起動 → `npm run dev`）・立ち絵素材は同梱せず規約はユーザーが守ること、を書く。
- [ ] **Step 6:** コミットする。`chore: scaffold vite react-ts app with vitest`

### Task 2: レイヤーツリーと PSDTool の名前規則

**Files:**
- Create: `src/core/psd/types.ts`, `src/core/psd/layerTree.ts`, `tests/fixtures/makePsd.ts`, `tests/core/psd/layerTree.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type LayerId = string // 子の配列インデックスを '/' でつないだもの（例 "2/0/5"）。ag-psd の配列順（下から上）
  interface LayerNode {
    id: LayerId
    name: string          // 表示名（先頭の * と ! を除いたもの）
    rawName: string       // PSD 上の名前そのまま（.pfv の照合に使う）
    kind: 'normal' | 'radio' | 'forced'
    isGroup: boolean
    flip: boolean         // :flipx/:flipy/:flipxy。常に非表示・ツリー非表示
    initiallyVisible: boolean // PSD の hidden の逆
    children: LayerNode[] // 下から上の順
    source: import('ag-psd').Layer // 合成で使う元データ
  }
  type VisibilityState = Record<LayerId, boolean>
  function buildLayerTree(layers: Layer[]): LayerNode[]
  function findNode(tree: LayerNode[], id: LayerId): LayerNode | undefined
  function parentId(id: LayerId): LayerId | null
  ```
  `tests/fixtures/makePsd.ts`: `layer(name: string, opts?: { hidden?: boolean; children?: Layer[] }): Layer`（画像なしの ag-psd Layer を作る）

- [ ] **Step 1: 失敗するテストを書く** `layerTree.test.ts`
  - `buildLayerTree([layer('*目'), layer('!体'), layer('髪:flipx'), layer('普通')])` で、kind がそれぞれ `radio`・`forced`・`normal`・`normal`、name が `目`・`体`・`髪:flipx`・`普通`、3番目の `flip` が `true` になる
  - グループの子の id が `"1/0"` の形になる
  - `hidden: true` のレイヤーは `initiallyVisible === false`
  - `findNode(tree, "1/0")` が該当ノードを返す。`parentId("1/0") === "1"`、`parentId("1") === null`
- [ ] **Step 2:** `npx vitest run tests/core/psd/layerTree.test.ts` を実行する。期待結果：モジュールがないため FAIL。
- [ ] **Step 3:** 上記のシグネチャで実装する。
- [ ] **Step 4:** 同じテストを実行する。期待結果：PASS。
- [ ] **Step 5:** コミットする。`feat: parse PSD layer tree with PSDTool naming rules`

### Task 3: 表示状態の規則と口の差し替え

**Files:**
- Create: `src/core/psd/visibility.ts`, `src/core/character/types.ts`, `src/core/character/mouth.ts`, `tests/core/psd/visibility.test.ts`, `tests/core/character/mouth.test.ts`

**Interfaces:**
- Consumes: Task 2 の `LayerNode`, `VisibilityState`, `findNode`, `parentId`
- Produces:
  ```ts
  // visibility.ts
  function initialVisibility(tree: LayerNode[]): VisibilityState
  function setVisible(tree: LayerNode[], state: VisibilityState, id: LayerId, visible: boolean): VisibilityState // 新しいオブジェクトを返す
  function isEffectivelyVisible(tree: LayerNode[], state: VisibilityState, id: LayerId): boolean // 祖先すべてが表示中か
  // character/types.ts
  type Vowel = 'a' | 'i' | 'u' | 'e' | 'o' | 'closed'
  const VOWELS: readonly Vowel[] // ['a','i','u','e','o','closed']
  type MouthMap = Partial<Record<Vowel, LayerId>>
  interface Expression { id: string; name: string; visibility: VisibilityState }
  interface VoiceRef { styleId: number; speakerName: string; styleName: string }
  interface Character { id: string; name: string; psdFileName: string; voice: VoiceRef | null; mouthGroupId: LayerId | null; mouthMap: MouthMap; expressions: Expression[] }
  interface ScriptLine { id: string; text: string; characterId: string | null; expressionId: string | null; speedScale: number }
  interface ExportSettings { width: number; height: number; scale: number; background: string }
  const DEFAULT_EXPORT_SETTINGS: ExportSettings // {1920,1080,0.9,'#00FF00'}
  // mouth.ts
  function resolveMouthLayer(map: MouthMap, vowel: Vowel): LayerId | null // 未設定は closed に、closed も未設定なら null
  function applyMouth(tree: LayerNode[], state: VisibilityState, mouthGroupId: LayerId | null, mouthLayerId: LayerId | null): VisibilityState
  ```
- 規則：
  - `forced` は常に true
  - `flip` は常に false
  - 同じ親の `radio` 兄弟は、ちょうど1つだけ true。初期状態では、表示中のうち一番上（配列の最後）を残す。表示中が1つもなければ一番上を表示する
  - `radio` に `setVisible(..., false)` しても変わらない
  - `applyMouth` は `mouthLayerId` が null か `mouthGroupId` が null なら state をそのまま返す。そうでなければ、口グループ直下の子をすべて false にしてから、`mouthLayerId` だけを true にする（radio 規則より優先する）

- [ ] **Step 1: 失敗するテストを書く**
  - visibility：radio 兄弟で2つ表示中のときは上だけが残る。0個なら一番上。radio を選ぶと兄弟が消える。radio に false は無視される。forced は false にできない。flip は初期状態で false。親グループが非表示なら `isEffectivelyVisible` が false
  - mouth：`resolveMouthLayer({closed:'3/0'}, 'a') === '3/0'`、`resolveMouthLayer({}, 'a') === null`。`applyMouth` は口グループに3つの子があり表情側で `3/1` が表示中のとき、`3/2` を渡すと `3/2` だけが true（Review Focus 1）。`mouthLayerId` が null なら state と同じ内容
- [ ] **Step 2:** 2つのテストを実行する。期待結果：FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** テストを実行する。期待結果：PASS。
- [ ] **Step 5:** コミットする。`feat: add visibility rules and mouth replacement`

### Task 4: `.pfv` の解析と適用

**Files:**
- Create: `src/core/psd/pfv.ts`, `tests/core/psd/pfv.test.ts`

**Interfaces:**
- Consumes: Task 2 の `LayerNode`・`VisibilityState`
- Produces:
  ```ts
  interface PfvFavorite { name: string; folderPath: string[]; layerPaths: string[][] } // layerPaths は rawName のパス。'\N' は付いたまま
  function parsePfv(text: string): PfvFavorite[]                 // 1行目が [PSDToolFavorites-v1] でなければ PfvFormatError を投げる
  function applyFavorite(tree: LayerNode[], fav: PfvFavorite): { visibility: VisibilityState; missingPaths: number }
  class PfvFormatError extends Error {}
  ```
- 解析規則（spec 4.2 と PSDTool マニュアル）：
  - 先頭の BOM と CR は無視する
  - 最初の `//` 行より前の行は読み飛ばす
  - `//` 行は `//` を除いてから `~` で分割する。マーカー（`~folder`・`~filter`・未知のもの）が付いていれば、その見出しと、次の `//` までの行を読み飛ばす
  - マーカーのない `//a/b/名前` は、`folderPath=['a','b']`・`name='名前'` のお気に入り
  - 見出しと各パスの各要素は `decodeURIComponent` する。ただしパス要素は、先に末尾の `\数字` を切り離してからデコードする
  - 空行は無視する
- 適用規則：全ノードを false にしてから、各パスを上から辿る。各階層で `rawName` と `\N`（N は省略時 0。同名の兄弟を配列の先頭（下）から数えた番号）で一致するノードを探し、辿ったノードをすべて true にする。辿れなかったパスは `missingPaths` に数える。最後に forced を true、flip を false にする

- [ ] **Step 1: 失敗するテストを書く**
  - ヘッダーがないと `PfvFormatError`
  - `//お気に入り/普通` と `//お気に入り/空~folder` を含む入力で、お気に入りは1件だけ、`name === '普通'`・`folderPath` は `['お気に入り']`
  - `~filter` 見出しの後の行が、どのお気に入りにも入らない
  - `%2F` を含む名前がデコードされる。`a%5cb` は `a\b` になり、インデックスとして扱われない
  - 同名の兄弟 `口`（下）と `口`（上）があるとき、`口\1` で上のほうが true になり、下は false（Review Focus 4）
  - 存在しない `ない/レイヤー` は `missingPaths === 1`
- [ ] **Step 2:** テストを実行する。期待結果：FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** テストを実行する。期待結果：PASS。
- [ ] **Step 5:** コミットする。`feat: import PSDTool favorites (.pfv) as expressions`

### Task 5: リップシンクのタイムライン

**Files:**
- Create: `src/core/voicevox/types.ts`, `src/core/lipsync/timeline.ts`, `tests/core/lipsync/timeline.test.ts`, `tests/fixtures/audioQuery.ts`, `scripts/check-timeline.ts`

**Interfaces:**
- Consumes: Task 3 の `Vowel`
- Produces:
  ```ts
  // voicevox/types.ts — エンジンの JSON のキー名のまま
  interface Mora { text: string; consonant: string | null; consonant_length: number | null; vowel: string; vowel_length: number; pitch: number }
  interface AccentPhrase { moras: Mora[]; accent: number; pause_mora: Mora | null; is_interrogative?: boolean }
  interface AudioQuery { accent_phrases: AccentPhrase[]; speedScale: number; pitchScale: number; intonationScale: number; volumeScale: number; prePhonemeLength: number; postPhonemeLength: number; pauseLength?: number | null; pauseLengthScale?: number; outputSamplingRate: number; outputStereo: boolean; kana?: string }
  interface SpeakerStyle { name: string; id: number }
  interface Speaker { name: string; speaker_uuid: string; styles: SpeakerStyle[] }
  // lipsync/timeline.ts
  interface MouthSegment { start: number; end: number; vowel: Vowel } // 秒
  interface MouthTimeline { segments: MouthSegment[]; duration: number }
  const ENGINE_FRAME_RATE = 93.75 // 24000 / 256
  function vowelToMouth(vowel: string): Vowel
  function buildMouthTimeline(query: AudioQuery): MouthTimeline
  function mouthAt(timeline: MouthTimeline, t: number): Vowel // 範囲外は 'closed'
  ```
- 時間の計算（VOICEVOX エンジンの処理順に合わせる）：
  - 音素の並びは `pre`（prePhonemeLength）→ 各アクセント句の [子音・母音]… → `pause_mora` → `post`（postPhonemeLength）
  - `pause_mora` の長さは、`pauseLength` が null でなければその値、そうでなければ `vowel_length` を使う。どちらの場合も `pauseLengthScale`（既定 1）を掛ける
  - 各音素の長さを `speedScale` で割り、`roundHalfToEven(len * 93.75)` でフレーム数にする。秒にするときは `frames / 93.75`
  - 連続する同じ口の区間はまとめる
  - `duration` は全フレーム数の合計を 93.75 で割った値
  - 子音区間の口は、そのモーラの母音の口

- [ ] **Step 1: 失敗するテストを書く**（フィクスチャ：「こんにちは」相当の手書き AudioQuery。pre 0.1・post 0.1・pause_mora 1つ）
  - `vowelToMouth`：`'a'→'a'`、`'I'→'i'`、`'N'→'closed'`、`'cl'→'closed'`、`'pau'→'closed'`
  - 先頭の区間は `closed` で、`end` が `round(0.1*93.75)/93.75`
  - `speedScale` が 1.0 と 2.0 のときの `duration` が、手計算した各音素のフレーム数の合計に一致する（Review Focus 5）
  - `pauseLength` が 0.5、`pauseLengthScale` が 2 なら、pause の区間は `round(1.0/speed*93.75)` フレーム
  - 隣り合う区間に隙間も重なりもない（`segments[i].end === segments[i+1].start`）
  - `mouthAt(tl, -1)` と `mouthAt(tl, tl.duration + 1)` は `'closed'`
- [ ] **Step 2:** テストを実行する。期待結果：FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** テストを実行する。期待結果：PASS。
- [ ] **Step 5:** 実エンジンで照合する。`scripts/check-timeline.ts`（`npx tsx` で実行）を作る。これは `VOICEVOX_URL`（既定 `http://localhost:50021`）に対して、3つの文を speedScale 0.5・1.0・2.0 で `audio_query` と `synthesis` にかけ、WAV のサンプル数 ÷ サンプリングレートと `duration` の差を表示する。期待結果：差がすべて 1/30 秒未満。エンジンにつながらない場合は「未照合」と報告して先に進み、Task 12 で必ず照合する。
- [ ] **Step 6:** コミットする。`feat: build mouth timeline from VOICEVOX audio query`

### Task 6: VOICEVOX クライアント

**Files:**
- Create: `src/core/voicevox/client.ts`, `tests/core/voicevox/client.test.ts`

**Interfaces:**
- Consumes: Task 5 の型
- Produces:
  ```ts
  type VoicevoxErrorKind = 'unreachable' | 'timeout' | 'http' | 'invalid-response'
  class VoicevoxError extends Error { kind: VoicevoxErrorKind; status?: number }
  interface VoicevoxClientOptions { baseUrl: string; timeoutMs?: number /* 既定 30000 */; fetch?: typeof fetch }
  class VoicevoxClient {
    constructor(opts: VoicevoxClientOptions)
    version(): Promise<string>                                   // GET /version
    speakers(): Promise<Speaker[]>                               // GET /speakers
    audioQuery(text: string, styleId: number): Promise<AudioQuery> // POST /audio_query?text=&speaker=
    synthesis(query: AudioQuery, styleId: number): Promise<ArrayBuffer> // POST /synthesis?speaker=  body=JSON
  }
  function prepareQuery(query: AudioQuery, speedScale: number): AudioQuery // speedScale を設定し、outputSamplingRate=48000・outputStereo=false にした複製を返す
  ```
- `outputSamplingRate=48000` にするのは、ブラウザの AAC エンコーダーが 24kHz を受け付けない環境があるため（タイムラインの計算には影響しない）。
- `baseUrl` の末尾の `/` は取り除く。タイムアウトは `AbortController` で行う。`fetch` の TypeError は `unreachable` にする。

- [ ] **Step 1: 失敗するテストを書く**（`fetch` をスタブにする）
  - `audioQuery('あ', 3)` が `POST http://localhost:50021/audio_query?text=%E3%81%82&speaker=3` を呼ぶ
  - `synthesis` が `Content-Type: application/json` で、JSON の本文を送る
  - 422 の応答で `VoicevoxError`（`kind:'http'`, `status:422`）を投げる（Review Focus 2）
  - fetch が TypeError を投げたら `kind:'unreachable'`
  - `timeoutMs: 10` で解決しない fetch に対して `kind:'timeout'`
  - `/speakers` が配列でなければ `kind:'invalid-response'`
  - `prepareQuery` は元のオブジェクトを変更しない
- [ ] **Step 2:** テストを実行する。期待結果：FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** テストを実行する。期待結果：PASS。
- [ ] **Step 5:** コミットする。`feat: add VOICEVOX engine client with timeout and typed errors`

### Task 7: 合成

**Files:**
- Create: `src/core/psd/compose.ts`, `tests/core/psd/compose.test.ts`

**Interfaces:**
- Consumes: Task 2・Task 3
- Produces:
  ```ts
  interface DrawOp { kind: 'layer'; id: LayerId; opacity: number; blend: GlobalCompositeOperation; clipping: boolean }
  interface GroupOp { kind: 'group'; id: LayerId; opacity: number; blend: GlobalCompositeOperation | 'pass-through'; children: (DrawOp | GroupOp)[] }
  function buildDrawList(tree: LayerNode[], state: VisibilityState): (DrawOp | GroupOp)[] // 下から上。非表示・flip・画像なしの葉は除く
  function composeTo(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, tree: LayerNode[], state: VisibilityState, psdSize: { width: number; height: number }): void
  function blendModeToComposite(mode: string | undefined): GlobalCompositeOperation | 'pass-through'
  ```
- `composeTo` は ag-psd の `layer.canvas` を `left`/`top` に描く。グループは一時 canvas に合成してから、opacity・blend を付けて親に描く（pass-through は親に直接描く）。clipping は直前の非 clipping レイヤーを下地にして `source-atop` で描く。対応する描画モードは normal・multiply・screen・overlay・darken・lighten・color-dodge・color-burn・hard-light・soft-light・difference・exclusion。それ以外は normal で描き、`console.warn` を1回出す。描画モードとマスクにどこまで対応するかは spec 8 で作る人に任されている。上は最低限の線。

- [ ] **Step 1: 失敗するテストを書く**（`buildDrawList` と `blendModeToComposite` だけ。canvas の描画は Task 12 で目視確認する）
  - 非表示の親の子は出ない。flip は出ない
  - 並び順が下から上
  - `blendModeToComposite('multiply') === 'multiply'`、`'pass through'` は `'pass-through'`、未知は `'source-over'`
  - `clipping: true` の葉に `clipping` が付く
- [ ] **Step 2:** テストを実行する。期待結果：FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** テストを実行する。期待結果：PASS。
- [ ] **Step 5:** コミットする。`feat: compose visible PSD layers onto canvas`

### Task 8: 書き出し（フレーム予定・mp4 エンコード・名前）

**Files:**
- Create: `src/core/export/frames.ts`, `src/core/export/encode.ts`, `src/core/export/naming.ts`, `tests/core/export/frames.test.ts`, `tests/core/export/naming.test.ts`

**Interfaces:**
- Consumes: Task 3 の `resolveMouthLayer`・`applyMouth`・`ExportSettings`、Task 5 の `MouthTimeline`・`mouthAt`、Task 7 の `composeTo`
- Produces:
  ```ts
  // frames.ts
  const FPS = 30
  function frameSchedule(timeline: MouthTimeline, fps?: number): Vowel[] // 長さ = ceil(duration*fps)。i 番目は mouthAt(tl, (i+0.5)/fps)
  function placement(settings: ExportSettings, psdSize: {width:number;height:number}): { x: number; y: number; width: number; height: number } // 高さ = settings.height*scale、中央寄せ、整数に丸める
  type MouthFrames = Map<Vowel, ImageBitmap> // 6種の口それぞれの立ち絵（PSD サイズ）
  function prerenderMouthFrames(tree: LayerNode[], expression: VisibilityState, character: Pick<Character,'mouthGroupId'|'mouthMap'>, psdSize: {width:number;height:number}): Promise<MouthFrames>
  // encode.ts
  interface EncodeSupport { ok: boolean; reason?: string }
  function checkEncodeSupport(settings: ExportSettings): Promise<EncodeSupport> // canEncodeVideo('avc',{width,height}) と canEncodeAudio('aac',{numberOfChannels:1,sampleRate:48000})
  interface RenderLineInput { wav: ArrayBuffer; timeline: MouthTimeline; frames: MouthFrames; psdSize: {width:number;height:number}; settings: ExportSettings; onProgress?: (ratio: number) => void; signal?: AbortSignal }
  function renderLineMp4(input: RenderLineInput): Promise<Blob> // type 'video/mp4'
  // naming.ts
  function lineFileName(index: number, characterName: string, text: string): string // `${3桁ゼロ埋め(index+1)}_${キャラ名}_${本文の先頭10文字}.mp4`。/\:*?"<>| と改行は '_' にし、前後の空白は除く
  function creditText(speakerNames: string[]): string // 重複を除いて出現順に `VOICEVOX:${name}` を '、' でつなぐ
  ```
- `renderLineMp4` は Mediabunny を次のように使う。`new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })`、`new CanvasSource(offscreenCanvas, { codec: 'avc', bitrate: QUALITY_HIGH })` を `addVideoTrack(src, { frameRate: 30 })` に渡し、`new AudioBufferSource({ codec: 'aac', bitrate: QUALITY_HIGH })` を `addAudioTrack` に渡す。各フレームでは、背景で塗ってから `placement` の位置に該当する口の `ImageBitmap` を描き、`add(i/30, 1/30)` を await する。音声は `OfflineAudioContext` か `AudioContext({sampleRate:48000})` の `decodeAudioData` で AudioBuffer にしてから `add` する。
- 口の事前合成：`prerenderMouthFrames` は `VOWELS` それぞれについて `applyMouth(tree, expression, mouthGroupId, resolveMouthLayer(mouthMap, v))` を `composeTo` で描き、`createImageBitmap` する。

- [ ] **Step 1: 失敗するテストを書く**
  - `frameSchedule`：duration 1.0 で長さ 30、duration 1.01 で長さ 31。0.0〜0.5 秒が `a` で 0.5〜1.0 秒が `closed` なら、14番目は `a`、15番目は `closed`
  - `placement`：1920×1080・scale 0.9・PSD 1000×2000 なら `{height:972, width:486, x:717, y:54}`
  - `lineFileName(0, 'ずんだもん', 'こんにちは/ずんだもん\nなのだ')` は `'001_ずんだもん_こんにちは_ずんだも.mp4'（置換してから先頭10文字を取る）`
  - `creditText(['ずんだもん','四国めたん','ずんだもん'])` は `'VOICEVOX:ずんだもん、VOICEVOX:四国めたん'`
- [ ] **Step 2:** テストを実行する。期待結果：FAIL。
- [ ] **Step 3:** 実装する（`renderLineMp4`・`prerenderMouthFrames`・`checkEncodeSupport` はブラウザ専用。動作は Task 11 と Task 12 で確かめる）。
- [ ] **Step 4:** `npm test && npm run typecheck` を実行する。期待結果：PASS。
- [ ] **Step 5:** コミットする。`feat: render lip-synced line to mp4 with Mediabunny`

### Task 9: 保存（IndexedDB）

**Files:**
- Create: `src/core/storage/db.ts`, `tests/core/storage/db.test.ts`

**Interfaces:**
- Consumes: Task 3 の型
- Produces:
  ```ts
  interface AppSettings { engineUrl: string; export: ExportSettings }
  interface Store {
    listCharacters(): Promise<Character[]>
    saveCharacter(c: Character, psd?: Blob): Promise<void>   // psd を渡したときだけ PSD を保存・置換する
    loadPsd(characterId: string): Promise<Blob | undefined>
    deleteCharacter(id: string): Promise<void>                // PSD も消す
    loadScript(): Promise<ScriptLine[]>
    saveScript(lines: ScriptLine[]): Promise<void>
    loadSettings(): Promise<AppSettings>                     // 未保存なら engineUrl 'http://localhost:50021' と DEFAULT_EXPORT_SETTINGS
    saveSettings(s: AppSettings): Promise<void>
  }
  function openStore(dbName?: string /* 既定 'zunda-lipsync' */): Promise<Store>
  function lineProblem(line: ScriptLine, characters: Character[]): 'no-character' | 'no-expression' | 'no-voice' | 'empty-text' | null
  ```
- `idb` を使う。オブジェクトストアは `characters`・`psds`・`kv`（script と settings）の3つで、DB バージョンは 1。

- [ ] **Step 1: 失敗するテストを書く**（`import 'fake-indexeddb/auto'`、テストごとに別の dbName を使う）
  - 保存したキャラが一覧に出る。PSD の Blob を読み戻せる。削除すると両方消える
  - 設定を保存していなければ既定値が返る
  - `lineProblem`：キャラが削除済みなら `'no-character'`、表情が削除済みなら `'no-expression'`、声が null なら `'no-voice'`、空白だけの本文なら `'empty-text'`（Review Focus 3）
- [ ] **Step 2:** テストを実行する。期待結果：FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** テストを実行する。期待結果：PASS。
- [ ] **Step 5:** コミットする。`feat: persist characters, script and settings in IndexedDB`

### Task 10: キャラ設定画面（3列）

**Files:**
- Create: `src/ui/character/CharacterPage.tsx`, `src/ui/character/LayerTree.tsx`, `src/ui/character/Preview.tsx`, `src/ui/character/MouthPanel.tsx`, `src/ui/character/ExpressionPanel.tsx`, `src/ui/usePsd.ts`, `src/ui/AppContext.tsx`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: Task 2〜4・7・9、Task 6 の `VoicevoxClient.speakers`
- Produces: `AppContext` に `{ store: Store; settings: AppSettings; client: VoicevoxClient; characters: Character[]; reloadCharacters(): Promise<void> }`、`usePsd(characterId): { tree: LayerNode[]; psdSize; status: 'loading'|'ready'|'error'; error?: string }`（解析結果はメモリにキャッシュする）

- [ ] **Step 1:** 画面を作る。
  - 左にキャラ一覧（追加・名前変更・削除）
  - キャラの追加では PSD ファイルを選ぶ（`readPsd(buf)`。失敗したら「PSD を読み込めませんでした: 理由」を表示）
  - 3列は、左：レイヤーツリー（radio はラジオボタン、forced はチェックなし、flip は出さない）、中央：プレビュー（`composeTo`。現在の口割り当ての母音を選んで確認できる）、右：パネル類
  - 右列の上から順に
    - 声（`speakers()` から話者とスタイルを選ぶ。エンジンにつながらなければ「VOICEVOX に接続できません」）
    - 口グループ（グループのノードから選ぶ）と、6つの母音のプルダウン（候補は口グループ直下の子）
    - 「あいうえお」ボタン（`audioQuery('あいうえお', styleId)` から合成して再生し、`mouthAt` でプレビューの口を動かす）
    - 表情の一覧（現在の状態を名前付きで保存・上書き・削除、`.pfv` の読み込みと「N件取り込み、M件のレイヤーが見つかりませんでした」の表示）
  - 変更はその場で `saveCharacter` する
- [ ] **Step 2:** `npm run typecheck && npm test` を実行する。期待結果：PASS。
- [ ] **Step 3:** `npm run dev` で開き、Task 12 の PSD で、ツリーの操作・表情の保存・口の割り当て・「あいうえお」再生ができることを確かめる。スクリーンショットを撮って報告に付ける。
- [ ] **Step 4:** コミットする。`feat: add three-column character setup page`

### Task 11: セリフ画面・書き出し・エンジン状態

**Files:**
- Create: `src/ui/script/ScriptPage.tsx`, `src/ui/script/LineRow.tsx`, `src/ui/script/LinePreview.tsx`, `src/ui/script/ExportSettingsPanel.tsx`, `src/ui/EngineBanner.tsx`, `src/ui/SupportBanner.tsx`, `src/core/export/exportAll.ts`, `tests/core/export/exportAll.test.ts`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: Task 5〜9
- Produces:
  ```ts
  // exportAll.ts — UI 非依存。依存は引数で受け取る
  type LineResult = { lineId: string; ok: true; fileName: string; blob: Blob } | { lineId: string; ok: false; error: string }
  function exportLines(lines: ScriptLine[], renderOne: (line: ScriptLine, index: number) => Promise<{ fileName: string; blob: Blob }>, onLineDone?: (r: LineResult) => void): Promise<LineResult[]>
  function zipResults(results: LineResult[]): Promise<Blob> // 成功したものだけを fflate の zipSync（level 0）でまとめる
  ```

- [ ] **Step 1: 失敗するテストを書く** `exportAll.test.ts`
  - 3行中2行目の `renderOne` が `VoicevoxError` を投げても、1行目と3行目は `ok: true`、2行目は `ok:false` でエラー文に「VOICEVOX」を含む（Review Focus 2）
  - `zipResults` の zip を fflate の `unzipSync` で開くと、成功した2ファイルの名前と中身が一致する
- [ ] **Step 2:** テストを実行する。期待結果：FAIL。
- [ ] **Step 3:** `exportAll.ts` を実装し、テストを通す。
- [ ] **Step 4:** 画面を作る。
  - セリフ一覧：行の追加・削除・上下移動、本文、キャラ、表情、話速（0.5〜2.0、0.05刻み）、試聴、プレビュー、書き出し
  - `lineProblem` が null でない行には理由を表示し、試聴・書き出しを無効にする（Review Focus 3）
  - 1行の処理は `prepareQuery` → `synthesis` → `buildMouthTimeline` → `prerenderMouthFrames`（(キャラ, 表情) ごとにキャッシュ）→ `renderLineMp4`
  - プレビューは `<canvas>` と `<audio>` で、`audio.currentTime` から `mouthAt` で口を選んで描く
  - 書き出し設定：解像度プリセット・scale・背景色。変更は `saveSettings` する
  - 「全行を書き出す」は進行状況を表示し、`zipResults` を `zunda-lipsync.zip` としてダウンロードする。失敗した行は一覧に赤で表示する
  - 書き出し後に `creditText` を表示し、コピーボタンを付ける
  - `EngineBanner`：起動時と30秒ごとに `version()` を呼び、失敗したら「VOICEVOX に接続できません（URL: …）。VOICEVOX が起動しているか確認してください」と表示する。URL の変更欄も置く
  - `SupportBanner`：`checkEncodeSupport` が ok でなければ「このブラウザでは mp4 を書き出せません。Windows/macOS の Chrome か Edge を使ってください」と表示する
  - セリフは変更のたびに `saveScript` する（300ms のデバウンス）
- [ ] **Step 5:** `npm test && npm run typecheck && npm run build` を実行する。期待結果：すべて成功。
- [ ] **Step 6:** コミットする。`feat: add script editor, preview and mp4 export`

### Task 12: 実機での確認と README の仕上げ

**Files:**
- Modify: `README.md`
- Create: `docs/manual-check.md`

- [ ] **Step 1:** 実際の VOICEVOX エンジンで `npx tsx scripts/check-timeline.ts` を実行する。期待結果：差がすべて 1/30 秒未満。超えていたら Task 5 の規則を直し、テストを足す。
- [ ] **Step 2:** 公開されているずんだもんの立ち絵 PSD（ユーザーの手元のもの。リポジトリには入れない）で、次を確かめる。
  - 見た目が PSDTool と同じになる
  - PSDTool で書き出した `.pfv` を取り込める
  - 口グループを指定し、6つの母音を割り当てられる
  - 話速 0.5・1.0・2.0 の3行を書き出し、mp4 が再生でき、口と音声が合っている
  - 背景を `#0000FF` にした mp4 を動画編集ソフトのクロマキーで抜ける
- [ ] **Step 3:** 確認した手順と結果を `docs/manual-check.md` に書く。README に使い方（キャラ追加 → 口の割り当て → セリフ → 書き出し）と、VOICEVOX のクレジット表記が必要なことを追記する。
- [ ] **Step 4:** コミットする。`docs: add usage guide and manual verification record`
