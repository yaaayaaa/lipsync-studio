import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { LineTuning, ScriptLine } from '../../core/character/types'
import { isTuningStale, tuningFromQuery } from '../../core/voicevox/tuning'
import type { AccentPhrase, AudioQuery } from '../../core/voicevox/types'
import { useApp } from '../useApp'
import { errorMessage, saveRefreshedTuning } from '../script/lineJobs'
import { useScriptLines } from '../script/useScriptLines'
import { applyTuningEdit, ensureTuning, usableTuning } from './editTuning'

/** 打っている最中に1文字ごとに /audio_query を呼ばないための待ち */
const QUERY_DEBOUNCE_MS = 300

export type EditLine = (lineId: string, fn: (line: ScriptLine) => ScriptLine) => void

const queryKey = (text: string, styleId: number) => JSON.stringify([styleId, text])

interface Args {
  /** 開いている行（未選択なら null） */
  line: ScriptLine | null
  /** 今の声。キャラに声がなければ null */
  styleId: number | null
  /** 書き出し中は取り直しも保存もしない */
  locked: boolean
  editLine: EditLine
}

/**
 * 1行編集の作り込み。開いただけでは作らず、最初に数値を動かしたときに作って保存する。
 * 作るまでの間は、/audio_query の値（このページを開いている間だけ覚える）を表示に使う。
 */
export function useLineTuning({ line, styleId, locked, editLine }: Args) {
  const { client } = useApp()
  const { update } = useScriptLines()
  // エラーと取り直しの知らせは出た行を覚えておき、その行を開いている間だけ見せる（非同期で遅れて届くため）
  const [errorState, setErrorState] = useState<{ lineId: string; message: string } | null>(null)
  // 声が変わって高さと長さを取り直した行
  const [refreshedLineId, setRefreshedLineId] = useState<string | null>(null)

  // 表示用の /audio_query の結果。エンジン（client）が変われば捨てる
  const queries = useMemo(() => {
    void client
    return new Map<string, AudioQuery>()
  }, [client])
  const [, queryArrived] = useReducer((n: number) => n + 1, 0)

  const lineId = line?.id ?? null
  // 別の行を開いたら、前の行の知らせとエラーは消す（戻ってきても出さない）
  const [shownLineId, setShownLineId] = useState(lineId)
  if (shownLineId !== lineId) {
    setShownLineId(lineId)
    setRefreshedLineId(null)
    setErrorState(null)
  }
  const setError = useCallback(
    (message: string | null) => setErrorState(message === null || lineId === null ? null : { lineId, message }),
    [lineId],
  )

  const tuning = usableTuning(line)
  const text = line?.text ?? ''
  const needsQuery = !tuning && styleId !== null && text.trim() !== ''
  const key = styleId === null ? null : queryKey(text, styleId)

  useEffect(() => {
    if (!needsQuery || key === null || styleId === null || queries.has(key)) return
    let cancelled = false
    const timer = setTimeout(() => {
      client.audioQuery(text, styleId).then(
        (q) => {
          queries.set(key, q)
          if (!cancelled) {
            setError(null)
            queryArrived()
          }
        },
        (e: unknown) => !cancelled && setError(`数値を取得できませんでした: ${errorMessage(e)}`),
      )
    }, QUERY_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [needsQuery, key, text, styleId, client, queries, setError])

  // 開いた行の作り込みが別の声のものなら、高さと長さをすぐ取り直して保存する
  const resolving = useRef<LineTuning | null>(null)
  useEffect(() => {
    if (!line || !tuning || styleId === null || tuning.styleId === styleId || locked) return
    if (resolving.current === tuning) return
    resolving.current = tuning
    const id = line.id
    ensureTuning(client, line, styleId).then(
      (refreshed) => {
        update((prev) => saveRefreshedTuning(prev, id, tuning, refreshed))
        setRefreshedLineId(id)
      },
      (e: unknown) => setError(`声に合わせて取り直せませんでした: ${errorMessage(e)}`),
    ).finally(() => {
      if (resolving.current === tuning) resolving.current = null
    })
  }, [line, tuning, styleId, locked, client, update, setError])

  /** 表示する全体の数値。作り込みがなければ /audio_query の値（取得中・失敗は null） */
  const query = key !== null ? queries.get(key) : undefined
  const shown = useMemo<LineTuning | null>(() => {
    if (tuning) return tuning
    if (!query || styleId === null) return null
    return tuningFromQuery(query, text, styleId)
  }, [tuning, query, text, styleId])

  /**
   * 変更の元にする作り込み。すぐ分かればその値、エンジンに作ってもらう必要があれば Promise、
   * 変えられない（行がない・声がない・書き出し中・文を打ち替えて確定前）なら null。
   */
  const baseTuning = useCallback((): LineTuning | Promise<LineTuning> | null => {
    if (!line || styleId === null || locked) return null
    // 古い作り込みは、文の確定で捨てる確認を出すまで残す。ここで作り直すと確認を飛ばしてしまう
    if (line.tuning && isTuningStale(line.tuning, line.text)) return null
    if (tuning && tuning.styleId === styleId) return tuning
    if (!tuning && shown) return shown
    const id = line.id
    return ensureTuning(client, line, styleId).then((made) => {
      if (tuning && made !== tuning) setRefreshedLineId(id)
      setError(null)
      return made
    })
  }, [line, styleId, locked, tuning, shown, client, setError])

  /** どの変更も editLine を通す（取り消しの履歴をそこで取る） */
  const apply = useCallback(
    (lineId: string, base: LineTuning, fn: (t: LineTuning) => LineTuning | null) =>
      editLine(lineId, (current) => applyTuningEdit(current, base, fn)),
    [editLine],
  )

  /**
   * 作り込みを変える（なければ作ってから変える）。
   * 作るのにエンジンを待つ間に文が変わったら、その変更は捨てる。
   */
  const changeTuning = useCallback(
    (fn: (t: LineTuning) => LineTuning) => {
      const id = line?.id
      const base = baseTuning()
      if (id === undefined || base === null) return
      if (!(base instanceof Promise)) return apply(id, base, fn)
      base.then(
        (made) => apply(id, made, fn),
        (e: unknown) => setError(`数値を変えられませんでした: ${errorMessage(e)}`),
      )
    },
    [line, baseTuning, apply, setError],
  )

  /**
   * エンジンを呼んでアクセント句を変える（取り直し・読みの変更）。失敗したら行は変えずに投げる。
   * 待つ間にアクセント句が別の変更で変わっていたら、結果は捨てる（古い句から作った結果なので）。
   */
  const changePhrases = useCallback(
    async (compute: (phrases: AccentPhrase[], styleId: number) => Promise<AccentPhrase[]>) => {
      const id = line?.id
      const pending = baseTuning()
      if (id === undefined || pending === null) return
      const base = await pending
      const next = await compute(base.accentPhrases, base.styleId)
      apply(id, base, (t) => (t.accentPhrases === base.accentPhrases ? { ...t, accentPhrases: next } : null))
    },
    [line, baseTuning, apply],
  )

  return {
    /** 表示する作り込み（全体の数値）。読み込み中は null */
    shown,
    /** この行に作り込みがあるか */
    tuned: tuning !== null,
    error: errorState !== null && errorState.lineId === lineId ? errorState.message : null,
    refreshed: lineId !== null && refreshedLineId === lineId && line?.tuning !== undefined,
    markRefreshed: setRefreshedLineId,
    changeTuning,
    changePhrases,
  }
}
