# 1行編集画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** セリフ1行を VOICEVOX エディタと同じ細かさで作り込み、口パク付きで確かめて1本の mp4 をダウンロードできる「1行編集」画面を足す。作り込みは行に保存し、「セリフ」画面の試聴・プレビュー・書き出しにも効かせる。

**Architecture:** 作り込みは `ScriptLine.tuning`（アクセント句＋全体の数値＋作ったときの文と声）として IndexedDB の既存のセリフ一覧に保存する。合成に使うクエリの組み立て（自動／作り込み／声が変わったときの取り直し）とアクセント句の編集操作は `src/core/voicevox/` の UI 非依存モジュールに置く。セリフの状態は今 `ScriptPage` の中にあるので、2画面で共有できるよう `ScriptProvider` に持ち上げる。

**Tech Stack:** 既存のまま（Vite 8 / React 19 / TypeScript / Vitest 5 / idb 8 / lucide-react）。依存は増やさない。

**Spec:** `docs/superpowers/specs/2026-10-20-line-editor-design.md`（土台は `docs/superpowers/specs/2026-10-19-zunda-lipsync-design.md`。矛盾したら前者を優先）

## Global Constraints

- 依存パッケージを増やさない。
- core（`src/core/`）は React と DOM グローバルに依存しない。
- 話速の置き場は `ScriptLine.speedScale` だけ（範囲 0.5〜2.0、既定 1.0）。`tuning` に話速を持たせない。
- 合成直前に必ず `outputSamplingRate: 48000`・`outputStereo: false` を付ける（既存の `prepareQuery` を通す）。これらは `tuning` に保存しない。
- `/synthesis` は `enable_interrogative_upspeak` を指定しない（エンジン既定 true。`buildMouthTimeline` がそれを前提にしている）。
- 全体の数値の範囲（VOICEVOX エディタに合わせる。私の判断）：音高 `pitchScale` −0.15〜0.15、抑揚 `intonationScale` 0〜2、音量 `volumeScale` 0〜2、間の倍率 `pauseLengthScale` 0〜2、開始の無音 `prePhonemeLength` 0〜1.5、終了の無音 `postPhonemeLength` 0〜1.5（秒）。モーラの高さ 3.0〜6.5、子音・母音の長さ 0〜0.30 秒、句の後ろの無音 0〜1.0 秒。いずれも刻み 0.01。
- 既定値は `/audio_query` が返した値。`pauseLength`（絶対値）は扱わず常に `null`。`is_interrogative` はエンジンが返したまま触らない。
- 単体ダウンロードのファイル名は `<セリフ先頭10文字>_<ID8文字>.mp4`。ID は書き出すたびに `newId()` から作る。zip の中身の名前（`lineFileName`）は変えない。
- UI の文言は日本語。色は `app.css` の変数だけで指定する（白黒基調・ダーク対応）。アイコンは lucide-react。
- コミットはコンベンショナルコミット（英語）。`main` へ直接コミットしない（作業ブランチは `feat/v1` のまま）。

## Review Focus

1. **声が変わった行を、開かずにいきなり全行書き出しする。** 書き出しの直前に `/mora_data` で取り直し、取り直した `tuning` を保存する。取り直しに失敗したらその行だけエラーで、残りは続く。→ Task 1・Task 3 にテストあり。
2. **作り込んだ行の文を「セリフ」画面で1文字消す。** 打った瞬間には捨てず、確定時に確認を出す。取りやめたら文も作り込みも元のまま。→ Task 3 にテストあり。
3. **読みの修正で、1つの句が2つ以上の句になって返ってくる／不正な読み。** 前者は区切り直しとして受け入れ、後者は元のままでエラー文を出す。→ Task 5 にテストあり。
4. **手で長さ・間・前後の無音・間の倍率を変えた行の口パク。** 合成に使ったクエリから口を作るので、WAV の長さと一致する。→ Task 1 と Task 7（実エンジン照合）にテストあり。
5. **開いている行を「セリフ」画面で削除する／キャラを削除する。** 1行編集は未選択に戻る／行に問題を表示して編集・再生・書き出しを止める。→ Task 4 にテストあり。

---

### Task 1: 作り込みのデータと、合成に使うクエリの組み立て（core）

**Files:**
- Modify: `src/core/character/types.ts`（`LineTuning`、`ScriptLine.tuning?`）
- Modify: `src/core/voicevox/client.ts`（`accentPhrases`・`moraData` を追加）
- Create: `src/core/voicevox/tuning.ts`
- Test: `tests/core/voicevox/tuning.test.ts`、`tests/core/voicevox/client.test.ts`（追記）

**Interfaces:**
- Produces:
  - `interface LineTuning { text: string; styleId: number; accentPhrases: AccentPhrase[]; pitchScale: number; intonationScale: number; volumeScale: number; pauseLengthScale: number; prePhonemeLength: number; postPhonemeLength: number }`（`types.ts`。`AccentPhrase` は `core/voicevox/types` から import）
  - `ScriptLine.tuning?: LineTuning`
  - `VoicevoxClient.accentPhrases(text: string, styleId: number, isKana: boolean): Promise<AccentPhrase[]>`（`POST /accent_phrases?text&speaker&is_kana`）
  - `VoicevoxClient.moraData(phrases: AccentPhrase[], styleId: number): Promise<AccentPhrase[]>`（`POST /mora_data?speaker`、本文は JSON 配列）
  - `tuningFromQuery(query: AudioQuery, text: string, styleId: number): LineTuning`
  - `queryFromTuning(tuning: LineTuning, speedScale: number): AudioQuery`（`prepareQuery` を通す。`pauseLength: null`）
  - `resolveTuning(client, tuning: LineTuning, styleId: number): Promise<{ tuning: LineTuning; refreshed: boolean }>`：`tuning.styleId === styleId` ならそのまま、違えば `moraData(tuning.accentPhrases, styleId)` で高さと長さを取り直し `styleId` を更新（全体の数値は残す）
  - `isTuningStale(tuning: LineTuning, text: string): boolean`（`tuning.text !== text`）

- [ ] **Step 1: 失敗するテストを書く**（`tuning.test.ts`、スタブの client で）
  - `tuningFromQuery` → `queryFromTuning(t, 1.5)` で、アクセント句と全体の数値が元のクエリと一致し、`speedScale === 1.5`・`outputSamplingRate === 48000`・`outputStereo === false`・`pauseLength === null`
  - `queryFromTuning` の結果は `tuning.accentPhrases` と別のオブジェクト（書き換えても `tuning` が変わらない）
  - `resolveTuning` が同じ声なら `moraData` を呼ばず `refreshed: false`
  - 違う声なら `moraData` を新しい `styleId` で1回呼び、返った高さ・長さを使い、`accent`・区切り・`pitchScale` などは元のまま、`refreshed: true`
  - `moraData` が失敗したら reject（握りつぶさない）
  - `isTuningStale` は文が1文字でも違えば true
- [ ] **Step 2: 失敗を確認** — `npx vitest run tests/core/voicevox` → FAIL
- [ ] **Step 3: 実装**。`client.test.ts` に `accentPhrases`（クエリ文字列に `is_kana=true/false`）と `moraData`（POST 本文が JSON 配列、`speaker`）のテストを足す。応答が配列でなければ `invalid-response`
- [ ] **Step 4: 通過を確認** — `npx vitest run` → PASS、`npx tsc -b`・`npm run -s lint` も通る
- [ ] **Step 5: Commit** — `feat: store per-line tuning and build synthesis queries from it`

### Task 2: 合成キャッシュを作り込みに対応させ、単体ダウンロードの名前を変える（core）

**Files:**
- Modify: `src/core/voicevox/speechCache.ts`
- Modify: `src/core/export/naming.ts`
- Test: `tests/core/voicevox/speechCache.test.ts`、`tests/core/export/naming.test.ts`

**Interfaces:**
- Consumes: Task 1 の `queryFromTuning`・`resolveTuning`
- Produces:
  - `SpeechCache.speakQuery(query: AudioQuery, styleId: number): Promise<Speech>`：鍵は `JSON.stringify([styleId, query])`。`speak(text, styleId, speedScale)`（作り込みなしの行）はそのまま残す。両者は同じ容量上限・LRU を共有する
  - `speakLine(cache: SpeechCache, client: VoicevoxClient, line: ScriptLine, styleId: number): Promise<{ speech: Speech; tuning?: LineTuning }>`（`speechCache.ts` に置く）：`tuning` がなく、または `isTuningStale` なら `cache.speak(line.text, styleId, line.speedScale)`（`tuning` は返さない）。あれば `resolveTuning` → `cache.speakQuery(queryFromTuning(t, line.speedScale), styleId)`。取り直したときだけ `tuning` に新しい値を入れて返す（呼び出し側が保存する）
  - `singleFileName(text: string, id: string): string` → `<sanitize した先頭10文字>_<id の英数字だけの先頭8文字>.mp4`（`naming.ts`。`lineFileName` と同じ `sanitize`・`Array.from` を使う）

- [ ] **Step 1: 失敗するテストを書く**
  - `speakQuery` は同じクエリ・声なら合成1回、`accent_phrases[0].moras[0].pitch` を 0.01 変えただけで2回目の合成になる
  - `speakLine`：作り込みなしは `speak` 経由（`audio_query` を呼ぶ）、作り込みありは `audio_query` を呼ばない、声が違えば `tuning` が返る、`tuning.text` が文と違えば作り込みを使わない
  - `singleFileName('ずんだもんなのだ！ぼくは', '3f9a1c2e-1111-4…')` → `'ずんだもんなのだ！ぼく_3f9a1c2e.mp4'`、禁則文字は `_`、空白のトリム
- [ ] **Step 2: 失敗を確認** — `npx vitest run tests/core` → FAIL
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通過を確認** — `npx vitest run`・`npx tsc -b`・`npm run -s lint`
- [ ] **Step 5: Commit** — `feat: cache tuned synthesis by query and name single downloads with a fresh id`

### Task 3: セリフの状態を共有し、「セリフ」画面を作り込みに対応させる（UI）

**Files:**
- Create: `src/ui/script/ScriptContext.tsx`（`ScriptProvider`・`useScriptLines`）
- Create: `src/ui/script/lineText.ts`（文の変更規則。純関数）
- Modify: `src/ui/script/ScriptPage.tsx`、`src/ui/script/LineRow.tsx`、`src/ui/script/lineJobs.ts`、`src/ui/App.tsx`
- Test: `tests/ui/script/lineText.test.ts`

**Interfaces:**
- Consumes: Task 2 の `speakLine`・`singleFileName`
- Produces:
  - `ScriptProvider`（`AppProvider` の内側、両画面の外側に置く）が持つもの：`lines: ScriptLine[] | null`・`error`・`update(fn)`（今の `useScript` をそのまま移す。300ms まとめ保存・離脱時の保存も維持）・`frameCache: MouthFrameCache`（今 `ScriptPage` の中にあるものを移す）・`editingLineId: string | null` と `openLineEditor(lineId: string): void`（1行編集タブへ切り替えてその行を開く）
  - `useScriptLines()` フック
  - `applyTextChange(line: ScriptLine, text: string): ScriptLine`：`tuning` があっても文だけ変える（`tuning` は残す。捨てるのは確定時）
  - `commitText(line: ScriptLine): { line: ScriptLine; needsConfirm: boolean }`：`tuning` があり `isTuningStale` なら `needsConfirm: true`（確認後に `dropTuning(line)` を呼ぶ）
  - `dropTuning(line: ScriptLine): ScriptLine`
- 振る舞い：
  - タブは「キャラ設定」「セリフ」「1行編集」の3つ（`App.tsx`。1行編集のページ本体は Task 4。ここでは空のページでよい）
  - `LineRow`：文の欄は打つたびに `applyTextChange`。フォーカスを外したとき（または Enter）に `commitText`、`needsConfirm` なら `confirm('この行の作り込み（アクセント・高さ・長さなど）が消えます。よろしいですか？')`。OK で `dropTuning`、取りやめなら文を `tuning.text` に戻す
  - `LineRow` の行の操作に「1行編集で開く」を足す（`RowMenu` を使い、削除もその中へ移す）。作り込みのある行には小さな印（lucide `SlidersHorizontal`、`aria-label="作り込み済み"`）
  - 試聴・プレビュー・行ごとの書き出し・全行書き出しは `speakLine` を通す。`tuning` が返ったら `update` で保存する
  - 行ごとの書き出しのファイル名は `singleFileName(line.text, newId())`。全行書き出しの zip の中身は `lineFileName` のまま

- [ ] **Step 1: 失敗するテストを書く**（`lineText.test.ts`）：`commitText` が `tuning` なしでは確認不要、`tuning.text` と同じ文に戻したら確認不要、違えば確認が要る。`dropTuning` は `tuning` だけ消し `speedScale` は残す
- [ ] **Step 2: 失敗を確認** — `npx vitest run tests/ui/script` → FAIL
- [ ] **Step 3: 実装**（`ScriptPage` から状態とキャッシュを `ScriptProvider` へ移し、`ScriptPage` は `useScriptLines()` を使う）
- [ ] **Step 4: 通過を確認** — `npx vitest run`・`npx tsc -b`・`npm run -s lint`。ブラウザ（playwright-core、`http://localhost:5173`）で：行の追加・文の入力・再読み込みで残る／作り込みのある行（IndexedDB に直接入れてよい）の文を変えて確定すると確認が出て、取りやめで元に戻る
- [ ] **Step 5: Commit** — `feat: share script lines across pages and honour per-line tuning`

### Task 4: 1行編集画面の骨組み（一覧・文と声・プレビュー・全体の数値・書き出し）

**Files:**
- Create: `src/ui/lineEditor/LineEditorPage.tsx`、`src/ui/lineEditor/GlobalParams.tsx`
- Create: `src/ui/lineEditor/editTuning.ts`（作り込みを作る・全体の数値を変える。純関数）
- Modify: `src/ui/App.tsx`、`src/ui/app.css`
- Test: `tests/ui/lineEditor/editTuning.test.ts`

**Interfaces:**
- Consumes: Task 3 の `useScriptLines`（`lines`・`update`・`frameCache`・`editingLineId`）、Task 2 の `speakLine`・`singleFileName`、既存の `LinePreview`・`startSamplePlayback`・`renderLineMp4`
- Produces:
  - `type GlobalParam = 'pitchScale' | 'intonationScale' | 'volumeScale' | 'pauseLengthScale' | 'prePhonemeLength' | 'postPhonemeLength'`
  - `GLOBAL_PARAM_RANGES: Record<GlobalParam | 'speedScale', { min: number; max: number; step: number; label: string }>`（範囲は Global Constraints の値。ラベルは 音高・抑揚・音量・間の倍率・開始の無音・終了の無音・話速）
  - `setGlobalParam(t: LineTuning, key: GlobalParam, value: number): LineTuning`（範囲に丸める）
  - `ensureTuning(client, line, styleId): Promise<LineTuning>`：`tuning` があり古くなければ `resolveTuning`、なければ `audio_query` から `tuningFromQuery`
- 振る舞い（設計書 4.1・4.2・4.4・4.5）：
  - 3列：左に行の一覧（番号と先頭の文。作り込みの印。「行を追加」）、中央に文の欄・キャラ・スタイル・プレビュー・編集欄の置き場（Task 5 で中身）・再生・「この行を書き出し」・「元に戻す」、右に全体の数値（話速は `line.speedScale`、それ以外は `tuning`。`tuning` がないうちは `/audio_query` の値を表示）
  - 最初に数値を動かした時点で `ensureTuning` して保存する（開いただけでは作らない）
  - 声が変わって取り直したら「声が変わったので高さと長さを取り直しました」を1行出す
  - 文の欄の確定ルールは Task 3 の `commitText` と同じ
  - 再生：`speakLine` で合成し、`LinePreview` で口パク付きで鳴らす。合成中は「合成中…」
  - 書き出し：`renderLineMp4` → `downloadBlob(blob, singleFileName(line.text, newId()))`、終わったらクレジットを表示
  - 「元に戻す」：`dropTuning`
  - 開いている行が消えた・未選択：「左の一覧から行を選んでください」。行に問題（`lineProblem`）があれば、その文言を出して再生・書き出しを止める
  - タブを離れたら再生を止める（「セリフ」画面と同じ）

- [ ] **Step 1: 失敗するテストを書く**（`editTuning.test.ts`）：`setGlobalParam` の丸め（範囲外・NaN）、`ensureTuning` が `tuning` なしで `audio_query` から作る／あれば `audio_query` を呼ばない／古い（文が違う）なら作り直す
- [ ] **Step 2: 失敗を確認**
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通過を確認** — `npx vitest run`・`npx tsc -b`・`npm run -s lint`。ブラウザで（エンジンは `http://127.0.0.1:50121` の本物。`page.route` で `localhost:50021` を転送してよい）：行を開く → 抑揚を 0 にして再生 → 再読み込みしても抑揚 0 のまま → 「セリフ」画面の試聴でも抑揚 0 で鳴る（`/synthesis` の本文で確認）→ 書き出しで `…_xxxxxxxx.mp4` がダウンロードされる
- [ ] **Step 5: Commit** — `feat: add the line editor page with global parameters, preview and export`

### Task 5: アクセント句の編集（アクセント・区切り・読み・高さ・長さ）

**Files:**
- Create: `src/core/voicevox/phraseEdit.ts`
- Create: `src/ui/lineEditor/PhraseEditor.tsx`
- Modify: `src/ui/lineEditor/LineEditorPage.tsx`、`src/ui/app.css`
- Test: `tests/core/voicevox/phraseEdit.test.ts`

**Interfaces:**
- Consumes: Task 1 の `LineTuning`・`moraData`・`accentPhrases`
- Produces（`phraseEdit.ts`。すべて新しい配列を返す純関数と、エンジンを呼ぶ非同期関数）：
  - `setAccent(phrases, phraseIndex, accent: number): AccentPhrase[]`（1〜モーラ数に丸める）
  - `splitPhrase(phrases, phraseIndex, moraIndex: number): AccentPhrase[]`（`moraIndex` の前で分ける。前半の `pause_mora` は null、後半が元の `pause_mora` を持つ。アクセントはそれぞれのモーラ数に丸める。`is_interrogative` は後半が引き継ぎ前半は false）
  - `joinPhrases(phrases, phraseIndex): AccentPhrase[]`（`phraseIndex` と次の句をつなぐ。`pause_mora` と `is_interrogative` は後ろの句のもの。アクセントは前の句のもの）
  - `setMoraPitch(phrases, phraseIndex, moraIndex, pitch)`・`setMoraLength(phrases, phraseIndex, moraIndex, part: 'consonant' | 'vowel', seconds)`・`setPauseLength(phrases, phraseIndex, seconds)`（Global Constraints の範囲に丸める。`pitch` が 0 のモーラは変えない。子音のないモーラの子音長は変えない）
  - `refetchPhrases(client, phrases, changed: number[], styleId): Promise<AccentPhrase[]>`：`moraData(phrases 全体, styleId)` を呼び、`changed` に入っている句だけ結果で置き換える（前後の文脈を保つため全体を送る）
  - `kanaWithAccent(phrase: AccentPhrase, reading: string): string`：カタカナ `reading` のモーラ数を数え、元の `accent`（モーラ数を超えたら最後）の位置に `'` を入れる。疑問形なら末尾に `？`
  - `replaceReading(client, phrases, phraseIndex, reading, styleId): Promise<AccentPhrase[]>`：`accentPhrases(kanaWithAccent(...), styleId, true)` の結果（複数の句でもよい）で差し替え、差し替えた句を `refetchPhrases` する。エンジンのエラーはそのまま投げる（呼び出し側が文言を出し、元のまま）
- 振る舞い（設計書 4.3）：タブ「アクセント」「高さ」「長さ」。アクセント：句ごとにモーラを並べ、下がる位置をクリックで選ぶ。モーラの間をクリックで分割、句の境目のボタンで結合。句をダブルクリックで読みの欄を開く。高さ：モーラごとの縦のつまみ（無声のモーラは無効）。長さ：子音と母音の長さ、句の後ろの無音。数値入力も併用してよい。句が多いときは横スクロール
- アクセント・区切り・読みの変更後は変わった句だけ `refetchPhrases`（取り直し中は編集欄を一時的に無効にし、失敗したら元のまま＋エラー文）

- [ ] **Step 1: 失敗するテストを書く**（`phraseEdit.test.ts`）
  - `splitPhrase`/`joinPhrases` の往復でモーラ列が変わらず、`pause_mora` が正しい側に付く
  - `setAccent` の丸め、`setMoraPitch` が無声モーラを変えない、`setMoraLength` の丸め
  - `refetchPhrases` が全体を送り、`changed` 以外の句（手で変えた高さを含む）を保つ
  - `kanaWithAccent('ズンダモン', accent 3)` → `"ズンダ'モン"`、モーラ数を超えるアクセントは最後、拗音（キャ等）を1モーラに数える、疑問形で `？`
  - `replaceReading`：返りが2句なら2句に置き換わる／エンジンが 400 を返したら reject して元の配列は変わらない
- [ ] **Step 2: 失敗を確認**
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通過を確認** — `npx vitest run`・`npx tsc -b`・`npm run -s lint`。ブラウザ（本物のエンジン）で：アクセント位置を変えると高さが変わる／句を分けてつなぐ／読みを「ズンダモン」→「ズンダモオン」に直す／高さと長さを動かして再生し、`/synthesis` の本文に反映される
- [ ] **Step 5: Commit** — `feat: edit accents, phrase splits, readings, pitch and length in the line editor`

### Task 6: 取り消しとやり直し

**Files:**
- Create: `src/ui/lineEditor/history.ts`（純関数）
- Modify: `src/ui/lineEditor/LineEditorPage.tsx`
- Test: `tests/ui/lineEditor/history.test.ts`

**Interfaces:**
- Produces：`interface History { past: Snapshot[]; future: Snapshot[] }`、`Snapshot = Pick<ScriptLine, 'text' | 'speedScale' | 'tuning'>`。`record(h, before: Snapshot): History`（`future` を空にする。上限 100 件で古いものから捨てる）・`undo(h, current): { history; snapshot } | null`・`redo(h, current): { history; snapshot } | null`
- 振る舞い：開いている行ごとに履歴を持ち（ページを開いている間だけ）、文の確定・キャラ/スタイルの変更・全体の数値・アクセント句の編集・「元に戻す」を1操作として記録する。スライダーのドラッグは離したときに1件。Ctrl/Cmd+Z で取り消し、Ctrl/Cmd+Shift+Z と Ctrl+Y でやり直し。文の欄などの入力中はブラウザ標準の取り消しに任せる（フォーカスが入力欄にあるときは横取りしない）。取り消しボタン・やり直しボタンも置く
- [ ] **Step 1: 失敗するテストを書く**：記録→取り消し→やり直しの往復、取り消し後に記録すると `future` が消える、上限
- [ ] **Step 2: 失敗を確認**
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通過を確認** — `npx vitest run`・`npx tsc -b`・`npm run -s lint`。ブラウザで：作り込んだ行の文を変えて確認で OK → Ctrl+Z で作り込みごと戻る
- [ ] **Step 5: Commit** — `feat: undo and redo edits in the line editor`

### Task 7: 実エンジンでの照合とドキュメント

**Files:**
- Modify: `scripts/check-timeline.ts`、`README.md`、`docs/manual-check.md`

- [ ] **Step 1:** `check-timeline.ts` に、`audio_query` の結果を手で変えた例を足す：子音・母音の長さを変える、`pause_mora` を伸ばす、`prePhonemeLength`/`postPhonemeLength` を変える、`pauseLengthScale` を 0.5 と 2.0、句を分割して `mora_data` で取り直したもの。いずれも WAV の長さとタイムラインの差を表示し、1/30 秒以上なら失敗にする
- [ ] **Step 2:** `VOICEVOX_URL=http://127.0.0.1:50121 npx tsx scripts/check-timeline.ts` を実行し、全件 OK を確認。結果を `docs/manual-check.md` の実施済みに日付・エンジン版つきで書く
- [ ] **Step 3:** README の使い方に「1行編集」を足す（作り込みは行に保存される・文を変えると消える・単体ダウンロードの名前）。`docs/manual-check.md` に人が確かめる項目（VOICEVOX エディタと同じ読みで同じ音になるか、など）を足す
- [ ] **Step 4: Commit** — `docs: cover the line editor and check tuned queries against a real engine`
