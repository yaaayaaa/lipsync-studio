// UI ライブラリ比較ページ（使い捨ての試作）。部品ごとに、各実装を同じ条件で並べて触り比べる。
// 表の値は scripts で実測した measurements.json から出す（各実装のメモの推測ではなく）。
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Impl } from './contract'
import { IMPLS } from './impls'
import { CHARACTER_MENU, MOUTH_OPTIONS } from './mockData'
import measurementsJson from './measurements.json'

/** 1つの実装の実測値。null は測れなかった（理由は errors） */
export interface ImplMeasurement {
  bundle: { jsGzip: number; jsRaw: number; cssGzip: number; note?: string } | null
  lines: { tsx: number; css: number; note?: string } | null
  behaviour: {
    menuSelect: boolean | null
    menuScroll: boolean | null
    menuOutsideClick: boolean | null
    previewAfterTwoDowns: string | null
    preview3rd: boolean | null
    escapeClears: boolean | null
    valueUnchanged: boolean | null
    oneClickSwitch: boolean | null
    listScroll: boolean | null
    listOutsideClick: boolean | null
    wraps: boolean | null
    jumpInsertText: boolean | null
    jumpKeyPress: boolean | null
    errors: string[]
    detail?: { menu?: OutsideDetail; list?: OutsideDetail }
  } | null
}

interface OutsideDetail {
  byScrollBy: boolean
  byWheel: boolean
  openAfterScroll: boolean
}

/** スクロールの内訳（scrollBy とホイールで結果が違う実装、スクロールで閉じる実装がある） */
function scrollNote(d: OutsideDetail | undefined): string {
  if (!d) return ''
  const parts: string[] = []
  if (d.byScrollBy !== d.byWheel) parts.push(`scrollBy ${d.byScrollBy ? '可' : '不可'}・ホイール ${d.byWheel ? '可' : '不可'}`)
  if ((d.byScrollBy || d.byWheel) && !d.openAfterScroll) parts.push('スクロールすると閉じる')
  return parts.length ? `（${parts.join('、')}）` : ''
}

interface Measurements {
  generatedAt: string | null
  impls: Record<string, ImplMeasurement>
}

const MEASUREMENTS = measurementsJson as Measurements

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

function Mark({ ok, yes = '○', no = '×' }: { ok: boolean | null | undefined; yes?: string; no?: string }) {
  if (ok === null || ok === undefined) return <span className="cmp-mark unknown">未計測</span>
  return <span className={`cmp-mark ${ok ? 'yes' : 'no'}`}>{ok ? yes : no}</span>
}

/** 開いている間に外側が操作できない＝モーダル。スクロールと外側のボタンの両方で判定する */
function modalOf(scroll: boolean | null | undefined, click: boolean | null | undefined): boolean | null {
  if (scroll == null || click == null) return null
  return !(scroll && click)
}

function ModalCell({ m }: { m: ImplMeasurement | undefined }) {
  const b = m?.behaviour
  const menu = modalOf(b?.menuScroll, b?.menuOutsideClick)
  const list = modalOf(b?.listScroll, b?.listOutsideClick)
  return (
    <span className="cmp-cell-lines">
      <span>
        メニュー: <Mark ok={menu === null ? null : !menu} yes="非モーダル" no="モーダル" />
      </span>
      <span>
        一覧: <Mark ok={list === null ? null : !list} yes="非モーダル" no="モーダル" />
        <span className="cmp-muted">{scrollNote(b?.detail?.list)}</span>
      </span>
    </span>
  )
}

function bundleText(impl: Impl, m: ImplMeasurement | undefined): ReactNode {
  if (!m?.bundle) return <span className="cmp-mark unknown">未計測</span>
  const { jsGzip, cssGzip } = m.bundle
  return (
    <span className="cmp-cell-lines">
      <span>
        JS {kb(jsGzip)}
        {impl.key === 'current' && '（既存）'}
      </span>
      <span className="cmp-muted">CSS {kb(cssGzip)}</span>
    </span>
  )
}

function SummaryTable() {
  return (
    <div className="cmp-table-wrap">
      <table className="cmp-table">
        <thead>
          <tr>
            <th>実装</th>
            <th>追加サイズ(gzip)</th>
            <th>モーダル（開いている間ほかが操作できない）</th>
            <th>別のプルダウンへ1クリックで移れるか</th>
            <th>指している候補のプレビュー</th>
            <th>端で折り返し</th>
            <th>先頭文字ジャンプ(日本語)</th>
            <th>コード量(行)</th>
          </tr>
        </thead>
        <tbody>
          {IMPLS.map((impl) => {
            const m = MEASUREMENTS.impls[impl.key]
            const b = m?.behaviour
            return (
              <tr key={impl.key}>
                <th scope="row">
                  <a href={`#menu-${impl.key}`}>{impl.name}</a>
                </th>
                <td>{bundleText(impl, m)}</td>
                <td>
                  <ModalCell m={m} />
                </td>
                <td>
                  <Mark ok={b?.oneClickSwitch} />
                </td>
                <td>
                  <Mark ok={b?.preview3rd == null ? null : b.preview3rd && !!b.escapeClears} />
                </td>
                <td>
                  <Mark ok={b?.wraps} yes="する" no="しない" />
                </td>
                <td>
                  <Mark ok={b?.jumpInsertText} />
                  {b?.jumpKeyPress != null && (
                    <span className="cmp-muted"> （キー直接: {b.jumpKeyPress ? '○' : '×'}）</span>
                  )}
                </td>
                <td>{m?.lines ? `${m.lines.tsx + m.lines.css}（tsx ${m.lines.tsx} + css ${m.lines.css}）` : '未計測'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Facts({ impl }: { impl: Impl }) {
  const m = MEASUREMENTS.impls[impl.key]
  const b = m?.behaviour
  if (!m) return <p className="cmp-muted">実測値なし</p>
  const yn = (v: boolean | null | undefined) => (v == null ? '未計測' : v ? 'はい' : 'いいえ')
  return (
    <dl className="cmp-facts">
      <dt>追加サイズ</dt>
      <dd>
        {m.bundle ? `JS ${kb(m.bundle.jsGzip)} gzip（未圧縮 ${kb(m.bundle.jsRaw)}）、CSS ${kb(m.bundle.cssGzip)} gzip` : '未計測'}
        {m.bundle?.note && <span className="cmp-muted"> — {m.bundle.note}</span>}
      </dd>
      <dt>コード量</dt>
      <dd>
        {m.lines ? `tsx ${m.lines.tsx} 行 + css ${m.lines.css} 行` : '未計測'}
        {m.lines?.note && <span className="cmp-muted"> — {m.lines.note}</span>}
      </dd>
      {b && (
        <>
          <dt>メニューで選ぶ</dt>
          <dd>{yn(b.menuSelect)}（記録欄が更新された）</dd>
          <dt>メニューを開いたまま</dt>
          <dd>
            スクロール {yn(b.menuScroll)}
            {scrollNote(b.detail?.menu)}・外のボタンが押せる {yn(b.menuOutsideClick)}
          </dd>
          <dt>一覧を開いたまま</dt>
          <dd>
            スクロール {yn(b.listScroll)}
            {scrollNote(b.detail?.list)}・外のボタンが押せる {yn(b.listOutsideClick)}
          </dd>
          <dt>↓↓ で指す候補</dt>
          <dd>
            {b.previewAfterTwoDowns === null ? '通知なし' : `「${MOUTH_OPTIONS.find((o) => o.id === b.previewAfterTwoDowns)?.name ?? b.previewAfterTwoDowns}」`}
            （3番目「んあー」なら正解）／Esc でプレビューが消える {yn(b.escapeClears)}・値は不変 {yn(b.valueUnchanged)}
          </dd>
          <dt>1クリックで い へ</dt>
          <dd>{yn(b.oneClickSwitch)}</dd>
          <dt>端で ↓</dt>
          <dd>{b.wraps == null ? '未計測' : b.wraps ? '先頭へ折り返す' : '止まる'}</dd>
          <dt>「ん」で んあー へ</dt>
          <dd>
            IME 相当（insertText）{yn(b.jumpInsertText)}・キー直接（keydown "ん"）{yn(b.jumpKeyPress)}
          </dd>
          {b.errors.length > 0 && (
            <>
              <dt>計測時の注意</dt>
              <dd>{b.errors.join(' / ')}</dd>
            </>
          )}
        </>
      )}
    </dl>
  )
}

function CardHead({ impl }: { impl: Impl }) {
  return (
    <header className="cmp-card-head">
      <h3>{impl.name}</h3>
      <p className="cmp-packages">{impl.packages}</p>
    </header>
  )
}

function CardFoot({ impl }: { impl: Impl }) {
  return (
    <details className="cmp-notes" open>
      <summary>メモと実測</summary>
      <ul>
        {impl.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <Facts impl={impl} />
    </details>
  )
}

function OutsideButton() {
  const [count, setCount] = useState(0)
  return (
    <button type="button" className="cmp-outside" data-testid="outside" data-count={count} onClick={() => setCount((c) => c + 1)}>
      外のボタン（押した回数 {count}）
    </button>
  )
}

function MenuCard({ impl }: { impl: Impl }) {
  const [log, setLog] = useState<{ id: string; at: string } | null>(null)
  const { RowMenuDemo } = impl
  const label = log ? CHARACTER_MENU.find((i) => i.id === log.id)?.label : undefined
  return (
    <article className="cmp-card" id={`menu-${impl.key}`} data-impl={impl.key} data-part="menu">
      <CardHead impl={impl} />
      <ul className="character-list cmp-mock-list">
        <li className="selected">
          <button type="button" className="character-name">
            ずんだもん
          </button>
          <RowMenuDemo label="キャラの操作" items={CHARACTER_MENU} onSelect={(id) => setLog({ id, at: new Date().toLocaleTimeString('ja-JP') })} />
        </li>
        <li>
          <button type="button" className="character-name">
            四国めたん
          </button>
        </li>
      </ul>
      <p className="cmp-log" data-testid="log" data-last={log?.id ?? ''}>
        最後に選んだ項目: {log ? `${label}（${log.at}）` : 'まだなし'}
      </p>
      <OutsideButton />
      <CardFoot impl={impl} />
    </article>
  )
}

type Vowel = 'あ' | 'い'

function SelectCard({ impl }: { impl: Impl }) {
  const { LayerSelectDemo } = impl
  const [values, setValues] = useState<Record<Vowel, string | null>>({ あ: null, い: null })
  const [activeA, setActiveA] = useState<string | null | undefined>(undefined)
  const [activeI, setActiveI] = useState<string | null | undefined>(undefined)
  const [last, setLast] = useState<Vowel>('あ')
  const active: [Vowel, string | null] | null =
    activeA !== undefined ? ['あ', activeA] : activeI !== undefined ? ['い', activeI] : null
  const shownVowel = active ? active[0] : last
  const shownId = active ? active[1] : values[last]
  const shown = MOUTH_OPTIONS.find((o) => o.id === shownId)

  const select = (vowel: Vowel, setActive: (id: string | null | undefined) => void) => (
    <div className="cmp-vowel" data-vowel={vowel}>
      <span className="cmp-vowel-label">{vowel}</span>
      <LayerSelectDemo
        label={vowel}
        options={MOUTH_OPTIONS}
        value={values[vowel]}
        onChange={(id) => {
          setLast(vowel)
          setValues((v) => ({ ...v, [vowel]: id }))
        }}
        onActiveChange={setActive}
      />
    </div>
  )

  return (
    <article className="cmp-card" id={`select-${impl.key}`} data-impl={impl.key} data-part="select">
      <CardHead impl={impl} />
      {/* 一覧は下へ開くので、外のボタンは上に置いて一覧に隠れないようにする */}
      <OutsideButton />
      <div className="cmp-select-row">
        <div className="cmp-vowels">
          {select('あ', setActiveA)}
          {select('い', setActiveI)}
        </div>
        <div
          className={`cmp-preview${active ? ' live' : ''}`}
          data-testid="preview"
          data-kind={active ? 'active' : 'value'}
          data-vowel={shownVowel}
          data-id={shownId ?? ''}
          aria-live="polite"
        >
          <span className="cmp-preview-thumb">{shown?.thumb && <img src={shown.thumb} alt="" />}</span>
          <span className="cmp-preview-text">
            <span className="cmp-muted">{active ? `指している（${shownVowel}）` : `選択中（${shownVowel}）`}</span>
            <span>{shown?.name ?? '未設定'}</span>
          </span>
        </div>
      </div>
      <p className="cmp-values cmp-muted" data-testid="values" data-a={values.あ ?? ''} data-i={values.い ?? ''}>
        値: あ＝{MOUTH_OPTIONS.find((o) => o.id === values.あ)?.name}、い＝{MOUTH_OPTIONS.find((o) => o.id === values.い)?.name}
      </p>
      <CardFoot impl={impl} />
    </article>
  )
}

function ThemeToggle() {
  const isDark = () => {
    const t = document.documentElement.dataset.theme
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  const [dark, setDark] = useState(isDark)
  return (
    <button
      type="button"
      className="cmp-theme"
      onClick={() => {
        const next = !dark
        document.documentElement.dataset.theme = next ? 'dark' : 'light'
        setDark(next)
      }}
    >
      {dark ? 'ライトにする' : 'ダークにする'}
    </button>
  )
}

export function ComparePage() {
  return (
    <main className="cmp-page">
      <header className="cmp-top">
        <div>
          <h1>UI ライブラリ比較（部品ごと）</h1>
          <p className="cmp-muted">
            同じ部品を各ライブラリで作って並べたもの。表は自動計測（esbuild・playwright）の結果
            {MEASUREMENTS.generatedAt ? `（${MEASUREMENTS.generatedAt}）` : '（未計測）'}。
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section className="cmp-section">
        <h2 className="cmp-h2">まとめ</h2>
        <SummaryTable />
        <p className="cmp-muted cmp-legend">
          追加サイズ: 各実装のファイルだけを react / react-dom / lucide-react を除いて esbuild で圧縮・束ねた大きさ（ライブラリ本体を含む）。
          「現在の自作」は既にアプリに入っているので実際の追加は 0。先頭文字ジャンプ(日本語)は IME 確定と同じく keydown を伴わない文字入力（insertText）で「ん」を入れて んあー に移るか。
        </p>
      </section>

      <section className="cmp-section">
        <h2 className="cmp-h2">行の ⋮ メニュー</h2>
        <div className="cmp-grid">
          {IMPLS.map((impl) => (
            <MenuCard key={impl.key} impl={impl} />
          ))}
        </div>
      </section>

      <section className="cmp-section">
        <h2 className="cmp-h2">サムネイル付きプルダウン（母音の口）</h2>
        <p className="cmp-muted">
          あ を開いたまま い を1回押して切り替えられるか、↓ で指した候補が右のプレビューにすぐ出るかを試せる。
        </p>
        <div className="cmp-grid">
          {IMPLS.map((impl) => (
            <SelectCard key={impl.key} impl={impl} />
          ))}
        </div>
      </section>

      <div className="cmp-spacer" aria-hidden>
        ここから下は余白（一覧を開いたままページがスクロールできるか試すため）
      </div>
    </main>
  )
}
