# 終端の長さと瞬き Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 書き出す mp4 を喋り終わりから「終端の長さ」だけ延ばし（既定は設定画面、行ごとの上書きは1行編集）、目を割り当てたキャラは書き出しとプレビュー再生で瞬きするようにする。

**Architecture:** 瞬きの位置は行 ID を種にした擬似乱数で決める純粋関数（`src/core/lipsync/blink.ts`）。立ち絵の画像は今の「口ごとの画像の Map」を、口×目の組み合わせを必要になったときに合成して覚える `FrameStore` に置き換える（全組み合わせを先に作るとメモリが3倍になるため）。書き出しとプレビュー再生は、使うフレームの組み合わせを先に `prepare` してから同期で描く。

**Tech Stack:** 既存のまま（Vite 8 / React 19 / TypeScript / Vitest 5 / idb 8 / lucide-react）。依存は増やさない。

**Spec:** `docs/superpowers/specs/2026-10-20-tail-and-blink-design.md`（土台は `2026-10-19-zunda-lipsync-design.md` と `2026-10-20-line-editor-design.md`。矛盾したら前者を優先）

## Global Constraints

- 依存パッケージを増やさない。core（`src/core/`）は React と DOM グローバル（`document`・`window`）に依存しない（`OffscreenCanvas`・`createImageBitmap` は今も core で使っているので可）。
- 動画は 30fps（`FPS`）。終端の長さは 0〜10 秒・0.1 秒刻み、既定 0。保存値は範囲外なら丸めて使う。
- 終端の長さ 0 秒・瞬きなし（閉じ目が未割り当て）のとき、書き出しのフレーム数と各フレームの絵は今とまったく同じであること。
- 瞬き：最初の瞬きは動画の頭から 1〜3 秒（30〜89 フレーム目に始まる）、以後は前の瞬きの開始から 3〜5 秒（90〜149 フレーム）おき。1回は半目ありなら `half, closed, closed, half`、半目なしなら `closed, closed, closed`。種は `ScriptLine.id`。同じ種なら同じ位置で、フレーム数を増やしても前のほうの位置は変わらない。
- 開いた目は割り当てない（スタイルの表示のまま）。閉じ目が未割り当てなら瞬きしない。目の状態の当て方は口と同じ「グループの子を全部消して1つだけ出す」。
- 延ばした部分の音は入れない（音声トラックは今のまま）。アプリ内の試聴・プレビュー再生には終端の長さを効かせない。瞬きはプレビュー再生にも効かせる。
- 古い保存データ（`tailSeconds`・目の割り当てを持たない設定・キャラ・行）はそのまま読めること。キャラの新しい項目は任意（`?`）にする。
- UI の文言は日本語。色は `app.css` の変数だけで指定する。アイコンは lucide-react。
- コミットはコンベンショナルコミット（英語）。作業ブランチは `feat/v1` のまま。

## Review Focus

1. **終端 0 秒・瞬きなしのキャラで書き出す（既存ユーザーそのまま）。** フレーム数と各フレームの口が今と同じ。→ Task 3 にテスト。
2. **同じ行を2回書き出す／終端の長さだけ変えて書き出し直す。** 瞬きの位置が同じ（終端を延ばしても前の瞬きは動かない）。→ Task 2 にテスト。
3. **割り当てた閉じ目・目のグループが PSD から消えている（PSD を差し替えた）。** 瞬きを諦めて開いた目のまま書き出す。エラーにしない。→ Task 2（`applyEyes` が見つからないグループで状態を変えない）と Task 5（画面に「見つかりません」）にテスト。
4. **口グループと目のグループに同じグループを選ぶ。** 目の欄で選べないようにする（口グループを候補から外す）。→ Task 5 にテスト。
5. **1行編集で終端の長さを動かしてから取り消す／セリフ画面で同じ行を変える。** 取り消しで行の値が消えて既定値に戻る。ほかの画面の変更で履歴が消える既存の規則にも乗る。→ Task 6 にテスト。

---

### Task 1: 終端の長さのデータと設定画面

**Files:**
- Modify: `src/core/character/types.ts`
- Create: `src/core/export/tail.ts`
- Modify: `src/ui/settings/ExportSettingsPanel.tsx`
- Test: `tests/core/export/tail.test.ts`、`tests/core/storage/db.test.ts`・`tests/ui/script/lineText.test.ts`（追記）

**Interfaces:**
- Produces:
  - `ExportSettings.tailSeconds: number`、`DEFAULT_EXPORT_SETTINGS.tailSeconds = 0`
  - `ScriptLine.tailSeconds?: number`（ない＝既定を使う）
  - `TAIL_RANGE = { min: 0, max: 10, step: 0.1 } as const`（`tail.ts`）
  - `clampTail(seconds: number): number`（範囲に収め 0.1 刻みに丸める。非有限は 0）
  - `effectiveTail(line: Pick<ScriptLine, 'tailSeconds'>, settings: Pick<ExportSettings, 'tailSeconds'>): number`（行の値があればそれ、なければ既定。どちらも `clampTail` を通す）

- [ ] **Step 1: 失敗するテストを書く**
  - `clampTail(-1) === 0`、`clampTail(12) === 10`、`clampTail(1.26) === 1.3`、`clampTail(NaN) === 0`
  - `effectiveTail({}, { tailSeconds: 2 }) === 2`、`effectiveTail({ tailSeconds: 0 }, { tailSeconds: 2 }) === 0`（0 も行の値として効く）
  - `tests/ui/script/lineText.test.ts`：作り込みのある行の文を変えて作り込みを捨てても（`applyTextChange`・`dropTuning`）、`tailSeconds` は残る
  - db：`tailSeconds` を持たない古い設定を保存してから `loadSettings()` すると `export.tailSeconds === 0`。`tailSeconds` を持つ行・持たない行がそのまま往復する
- [ ] **Step 2: `npx vitest run tests/core/export/tail.test.ts tests/core/storage/db.test.ts` で失敗を確認**
- [ ] **Step 3: 実装する**（`loadSettings` は既存の `{ ...DEFAULT_EXPORT_SETTINGS, ...saved?.export }` で足りるはず。足りなければ直す）
- [ ] **Step 4: 設定画面の「書き出し」欄に「終端の長さ」を足す**：つまみ（`TAIL_RANGE`）と `1.0 秒` の表示、説明「喋り終わったあと、立ち絵を映し続ける長さ。1行編集で行ごとに変えられます」。書き出し中は他の項目と同じく触れない
- [ ] **Step 5: `npx vitest run && npx tsc -b && npx oxlint` が通る**
- [ ] **Step 6: Commit** `feat: add a default tail length setting for exports`

### Task 2: 瞬きの位置と目の当て方（core）

**Files:**
- Create: `src/core/lipsync/blink.ts`、`src/core/character/eyes.ts`
- Modify: `src/core/character/types.ts`、`src/core/character/mouth.ts`
- Test: `tests/core/lipsync/blink.test.ts`、`tests/core/character/eyes.test.ts`、`tests/core/character/mouth.test.ts`（既存が通ること）

**Interfaces:**
- Produces:
  - `type EyeState = 'open' | 'half' | 'closed'`、`EYE_STATES: readonly EyeState[]`（`types.ts`）
  - `interface EyeMap { closed?: LayerId; half?: LayerId }`、`Character.eyeGroupId?: LayerId | null`、`Character.eyeMap?: EyeMap`（`types.ts`）
  - `blinkStarts(seed: string, frameCount: number): number[]`（各瞬きの開始フレーム。Global Constraints の間隔。`frameCount` 以降に始まるものは含めない）
  - `eyeAtFrame(starts: readonly number[], frame: number, hasHalf: boolean): EyeState`
  - `eyeSchedule(seed: string, frameCount: number, hasHalf: boolean): EyeState[]`
  - `interface BlinkSpec { groupId: LayerId; closed: LayerId; half: LayerId | null }`、`blinkSpec(character: Pick<Character, 'eyeGroupId' | 'eyeMap'>): BlinkSpec | null`（閉じ目がなければ null）
  - `eyeLayer(spec: BlinkSpec, eye: EyeState): LayerId | null`（open は null＝変えない、half は `half ?? closed`）
  - `applyEyes(tree, state, spec: BlinkSpec | null, eye: EyeState): VisibilityState`
  - `mouth.ts`：グループの子を全部消して1つだけ出す処理を `showOnlyChild(tree, state, groupId, layerId)` に切り出し、`applyMouth` と `applyEyes` の両方がそれを使う（`applyMouth` の振る舞いは変えない）

- [ ] **Step 1: 失敗するテストを書く**
  - 同じ種・同じ `frameCount` で `blinkStarts` が等しい。違う種では（ほぼ確実に）違う
  - 最初の開始が 30〜89、隣り合う開始の差が 90〜149（種を20個ほど変えて全部確かめる）
  - `blinkStarts(seed, 300)` は `blinkStarts(seed, 900)` の先頭と一致（延ばしても前は動かない）
  - `frameCount` が 30 未満なら空
  - `eyeAtFrame([30], 29..34, true)` が `open, half, closed, closed, half, open`、`hasHalf=false` で `open, closed, closed, closed, open, open`
  - `blinkSpec`：`eyeGroupId` が null・undefined、`eyeMap` がない、`closed` がない → null
  - `applyEyes`：open なら state をそのまま返す。closed なら目のグループの子が閉じ目だけ表示。half が未割り当てなら half で閉じ目。グループが木にない（PSD 差し替え）なら state をそのまま返す
- [ ] **Step 2: 失敗を確認**
- [ ] **Step 3: 実装する**。擬似乱数は依存なしで、種の文字列から作った 32bit の値で動く小さな生成器（例：FNV-1a で種を作り mulberry32 で回す）。「1〜3 秒」「3〜5 秒」は整数フレームで一様に選ぶ
- [ ] **Step 4: `npx vitest run && npx tsc -b && npx oxlint`**
- [ ] **Step 5: Commit** `feat: add deterministic blink timing and eye layer switching`

### Task 3: 書き出しに終端の長さと瞬きを入れる

**Files:**
- Modify: `src/core/export/frames.ts`、`src/core/export/encode.ts`
- Modify: `src/ui/script/mouthFrameCache.ts`、`src/ui/script/ScriptContext.tsx`、`src/ui/script/useRenderLine.ts`、`src/ui/script/lineJobs.ts`、`src/ui/script/LinePreview.tsx`、`src/ui/script/useLinePlayback.ts`（型の置き換えに伴う最小限。瞬きの表示は Task 4）
- Test: `tests/core/export/frames.test.ts`、`tests/ui/script/mouthFrameCache.test.ts`

**Interfaces:**
- Consumes: Task 1 の `effectiveTail`、Task 2 の `blinkSpec`・`eyeSchedule`・`applyEyes`・`EyeState`
- Produces:
  - `interface FrameKey { vowel: Vowel; eye: EyeState }`
  - `frameSchedule(timeline, fps = FPS, minDuration = 0, tailSeconds = 0): Vowel[]`（フレーム数 `ceil((max(timeline.duration, minDuration) + tailSeconds) * fps - 1e-9)`。延ばした部分は `closed`）
  - `lineFrameKeys(vowels: readonly Vowel[], blink: { seed: string; hasHalf: boolean } | null): FrameKey[]`（blink が null なら全部 `open`）
  - `class FrameStore`：`constructor(tree, expression: VisibilityState, character: Pick<Character, 'mouthGroupId' | 'mouthMap' | 'eyeGroupId' | 'eyeMap'>, psdSize)`、`prepare(keys: Iterable<FrameKey>): Promise<void>`（まだない組み合わせだけ合成して覚える）、`get(key: FrameKey): ImageBitmap`（未 prepare なら例外）、`has(key)`、`blink: BlinkSpec | null`、`close()`
  - `prerenderMouthFrames` は `createFrameStore(...)`（全口 × `open` を prepare 済みで返す）に置き換え、`MouthFrames` 型は消す
  - `RenderLineInput` に `tailSeconds: number` と `blinkSeed: string` を足し、`frames: FrameStore` にする。`renderLineMp4` は口の予定と目の予定から `FrameKey[]` を作り、`await frames.prepare(keys)` してから今と同じループで描く
  - `PreparedFrames.frames: FrameStore`。`MouthFrameCache` の版（`versionOf`）に `eyeGroupId`・`eyeMap` を含める。退役時は `FrameStore.close()`
  - `useRenderLine` は `effectiveTail(line, settings.export)` と `line.id` を渡す
  - `drawMouthFrame(ctx, frames: FrameStore, key: FrameKey, psdSize, settings)`（今の vowel 引数を key にする。未 prepare の組み合わせは描かずに背景だけ）

- [ ] **Step 1: 失敗するテストを書く**（`frames.test.ts`）
  - `frameSchedule(t, 30, 0, 0)` が今のテストの期待と同じ（既存テストはそのまま通す）
  - `tailSeconds = 1` で 30 フレーム増え、増えた分が全部 `closed`。`tailSeconds = 0.1` で 3 フレーム増える
  - `lineFrameKeys(vowels, null)` は全部 `eye: 'open'` で口は `vowels` のまま
  - `lineFrameKeys(vowels, { seed, hasHalf: true })` の目が `eyeSchedule(seed, vowels.length, true)` と一致
  - `mouthFrameCache.test.ts`：目の割り当てだけ変えたキャラで作り直される
- [ ] **Step 2: 失敗を確認**
- [ ] **Step 3: 実装する**。`FrameStore` は合成済みの組み合わせだけを持つ（口 7 × 開き目が基本。瞬きで使う組み合わせだけ追加）。合成は今の `prerenderMouthFrames` と同じく `composeTo` で PSD サイズに描いて `createImageBitmap`
- [ ] **Step 4: `npx vitest run && npx tsc -b && npx oxlint`**
- [ ] **Step 5: ブラウザで確認**（`scratchpad/pw` の playwright-core。サンプル PSD は `npx tsx scripts/make-sample-psd.ts`）：終端 0 秒・目なしで書き出したフレーム数が変わらない／終端 2 秒で 60 フレーム増える（mp4 の長さで確認）
- [ ] **Step 6: Commit** `feat: extend exports by the tail length and blink in exported frames`

### Task 4: プレビュー再生で瞬きする

**Files:**
- Modify: `src/ui/character/samplePlayback.ts`、`src/ui/script/useLinePlayback.ts`、`src/ui/script/LinePreview.tsx`
- Test: `tests/ui/character/samplePlayback.test.ts`

**Interfaces:**
- Consumes: Task 2 の `blinkStarts`・`eyeAtFrame`、Task 3 の `FrameStore`・`FrameKey`・`drawMouthFrame`
- Produces:
  - `PlaybackCallbacks.onMouth(vowel: Vowel, time: number): void`（`time` は `audio.currentTime`。既存の呼び出し側は第2引数を無視してよい）
  - `PreviewFrame` の `vowel` を `key: FrameKey` に置き換える
  - `useLinePlayback` のプレビュー：合成と画像の用意が済んだら、音声の長さ分のフレーム数で `blinkStarts(line.id, …)` を求め、使う組み合わせを `prepare` してから再生を始める。`onMouth` ではフレーム番号 `floor(time * FPS)` の目を `eyeAtFrame` で出す。終端の長さは足さない

- [ ] **Step 1: 失敗するテストを書く**：`onMouth` が `('a', <currentTime>)` で呼ばれる（既存の `toHaveBeenLastCalledWith('a')` を2引数に直す）
- [ ] **Step 2: 失敗を確認 → 実装 → `npx vitest run && npx tsc -b && npx oxlint`**
- [ ] **Step 3: ブラウザで確認**：閉じ目を割り当てたキャラの行（5 秒以上の文）を「セリフ」と「1行編集」でプレビュー再生し、途中で目が閉じるフレームがあること（canvas の目の位置の画素を数フレーム採って変化を確かめる）
- [ ] **Step 4: Commit** `feat: blink during preview playback`

### Task 5: キャラ設定で目を割り当てる

**Files:**
- Create: `src/ui/character/EyePanel.tsx`
- Modify: `src/ui/character/CharacterPage.tsx`、`src/ui/character/LayerTree.tsx`、`src/ui/character/mouthGroup.ts`、`src/ui/app.css`
- Test: `tests/ui/character/mouthGroup.test.ts`（追記）

**Interfaces:**
- Consumes: Task 2 の `blinkSpec`・`applyEyes`・`EyeMap`、既存の `LayerSelect`・`groupOptions`（`MouthPanel.tsx` から共有できる場所へ移す）
- Produces:
  - `eyeGroupChoicePatch(saved: LayerId | null | undefined, chosen: LayerId | null): { eyeGroupId: LayerId | null; eyeMap: EyeMap } | null`（口の `groupChoicePatch` と同じ規則：同じなら null、変えたら割り当てを消す）
  - `EyePanel`：見出し「目（瞬き）」。「目のグループ」（候補から口グループを除く）、「閉じ目」（必須）、「半目」（任意）。グループが PSD にないときは口と同じ文言で知らせる。説明「閉じ目を選ぶと、書き出しとプレビューで瞬きします。開いた目はスタイルの表示のまま使います」
  - プレビュー欄に「瞬き」ボタン：押すと `eyeAtFrame` の1回分（4 または 3 フレーム、1/30 秒ずつ）を中央のプレビューに流す。閉じ目が未割り当てなら押せない
  - レイヤーツリーで目のグループに「目」のバッジ（口の「口」バッジと同じ見た目）

- [ ] **Step 1: 失敗するテストを書く**：`eyeGroupChoicePatch(undefined, 'g') → { eyeGroupId: 'g', eyeMap: {} }`、`('g','g') → null`、`('g', null) → { eyeGroupId: null, eyeMap: {} }`
- [ ] **Step 2: 失敗を確認 → 実装 → `npx vitest run && npx tsc -b && npx oxlint`**
- [ ] **Step 3: ブラウザで確認**（ライト・ダーク両方のスクリーンショット）：サンプル PSD で目のグループと閉じ目を選ぶ→「瞬き」で目が閉じる→再読み込みしても割り当てが残る。可能なら `/Users/a/Documents/repo/lipsync-studio/fixtures/vendor/ずんだもん立ち絵素材2.3.psd`（読むだけ。そのリポジトリは変えない）で `!目`・`*UU` を選んで確かめる
- [ ] **Step 4: Commit** `feat: assign eye layers for blinking on the character page`

### Task 6: 1行編集で行ごとの終端の長さ

**Files:**
- Modify: `src/ui/lineEditor/history.ts`、`src/ui/lineEditor/LineEditorPage.tsx`、`src/ui/lineEditor/GlobalParams.tsx`（または新しい小さな欄）、`src/ui/app.css`
- Test: `tests/ui/lineEditor/history.test.ts`

**Interfaces:**
- Consumes: Task 1 の `TAIL_RANGE`・`clampTail`・`effectiveTail`
- Produces:
  - `Snapshot` に `tailSeconds?`（`tuning` と同じく「ない」も状態として扱う）。`snapshotOf`・`applySnapshot`・`sameSnapshot`・`outsideChange`・`SNAPSHOT_FIELDS` を対応させる
  - 右の列に「終端の長さ」：つまみ（`TAIL_RANGE`）と `1.0 秒`。行の値がなければ既定値を表示して「既定」と添え、動かしたら行の値になる（`editLine` を通す。つまみのドラッグは他のつまみと同じく1件にまとめる）。行の値があれば「この行だけ」と添え、「既定に戻す」で `tailSeconds` の項目ごと消す

- [ ] **Step 1: 失敗するテストを書く**
  - `snapshotOf` → `applySnapshot` で `tailSeconds` あり・なしが往復する（なしに戻すと項目自体が消える）
  - `sameSnapshot` が `tailSeconds` の違いを違いとみなす
  - `outsideChange`：他の画面で `tailSeconds` だけ変わったら `'clear'`
- [ ] **Step 2: 失敗を確認 → 実装 → `npx vitest run && npx tsc -b && npx oxlint`**
- [ ] **Step 3: ブラウザで確認**：動かす→「この行だけ」→ Ctrl/Cmd+Z で「既定」に戻る→「既定に戻す」→設定画面の既定値を変えると、その行の表示も変わる
- [ ] **Step 4: Commit** `feat: override the tail length per line in the line editor`

### Task 7: ドキュメント

**Files:**
- Modify: `README.md`、`docs/manual-check.md`

- [ ] **Step 1: README**：使い方に「目の割り当て（瞬き）」と「終端の長さ（設定画面の既定・1行編集で行ごと）」を足す
- [ ] **Step 2: manual-check**：Task 3〜6 のブラウザ確認の結果を書く。本物のずんだもん PSD で確かめたかどうかを正直に書く。既知の制限に「スタイルで初めから目を閉じた形の行も、瞬きの間は割り当てた閉じ目になる」を足す
- [ ] **Step 3: Commit** `docs: describe tail length and blinking`
