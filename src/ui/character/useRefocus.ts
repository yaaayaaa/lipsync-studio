import { useEffect, useRef } from 'react'

/**
 * 名前の編集を終えたあと、その行の名前ボタンへフォーカスを戻すための仕掛け。
 * 戻すのは編集欄が消えてフォーカスが行き場を失ったとき（body）だけ。
 * 編集欄の外をクリックして確定した場合は、クリックした先のフォーカスを奪わない。
 */
export function useRefocus(): (elementId: string) => void {
  const pending = useRef<string | null>(null)
  // 依存なし：編集を終えたことで起きる再描画の後に、名前ボタンが戻ってから実行される
  useEffect(() => {
    const id = pending.current
    if (id === null) return
    pending.current = null
    // 外側のクリックで確定したときは、blur の処理中にここへ来る（まだクリック先にフォーカスが移っていない）。
    // フォーカスの移動が済んでから判断するため、1つ後のタスクで確かめる
    // 取り消さない：保存による再描画がすぐ続いても実行させる。要素が消えていれば何もしない
    setTimeout(() => {
      const active = document.activeElement
      if (active === null || active === document.body) document.getElementById(id)?.focus()
    }, 0)
  })
  return (elementId) => {
    pending.current = elementId
  }
}
