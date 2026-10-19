import { useState } from 'react'
import type { Expression } from '../../core/character/types'
import type { LayerNode, VisibilityState } from '../../core/psd/types'
import { newId } from '../../core/id'
import { importPfv, nextExpressionName, pfvImportMessage } from './expressions'
import { InlineName } from './InlineName'

interface Props {
  tree: LayerNode[]
  expressions: Expression[]
  /** いまツリーに読み込まれている表情（なければ null） */
  selectedId: string | null
  visibility: VisibilityState
  onChange(expressions: Expression[]): void
  onSelect(expression: Expression): void
}

export function ExpressionPanel({ tree, expressions, selectedId, visibility, onChange, onSelect }: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const saveNew = () => {
    const expression = { id: newId(), name: nextExpressionName(expressions), visibility }
    onChange([...expressions, expression])
    onSelect(expression)
    setRenamingId(expression.id)
  }

  const overwrite = (target: Expression) => {
    const updated = { ...target, visibility }
    onChange(expressions.map((e) => (e.id === target.id ? updated : e)))
    onSelect(updated)
  }

  const rename = (id: string, name: string) => {
    onChange(expressions.map((e) => (e.id === id ? { ...e, name } : e)))
    setRenamingId(null)
  }

  const remove = (expression: Expression) => {
    if (!confirm(`表情「${expression.name}」を削除しますか？`)) return
    onChange(expressions.filter((e) => e.id !== expression.id))
  }

  const loadPfv = async (file: File) => {
    try {
      const result = importPfv(tree, await file.text(), newId)
      onChange([...expressions, ...result.expressions])
      setMessage({ text: pfvImportMessage(result), error: false })
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      setMessage({ text: `.pfv を読み込めませんでした: ${reason}`, error: true })
    }
  }

  return (
    <section className="panel">
      <h2>表情</h2>
      {expressions.length === 0 ? (
        <p className="hint">まだ表情がありません。ツリーで組み合わせを作って保存してください。</p>
      ) : (
        <ul className="expression-list">
          {expressions.map((e) => (
            <li key={e.id} className={e.id === selectedId ? 'selected' : undefined}>
              {renamingId === e.id ? (
                <InlineName name={e.name} onRename={(name) => rename(e.id, name)} onCancel={() => setRenamingId(null)} />
              ) : (
                <button type="button" className="expression-name" onClick={() => onSelect(e)} title="ツリーに読み込む">
                  {e.name}
                </button>
              )}
              <span className="row-actions">
                <button type="button" onClick={() => overwrite(e)} title="現在の状態で上書き">
                  上書き
                </button>
                <button type="button" onClick={() => setRenamingId(e.id)}>
                  名前
                </button>
                <button type="button" className="danger" onClick={() => remove(e)}>
                  削除
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="button-row">
        <button type="button" className="primary" onClick={saveNew}>
          現在の状態を保存
        </button>
        <label className="button">
          .pfv を読み込む
          <input
            type="file"
            accept=".pfv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void loadPfv(file)
            }}
          />
        </label>
      </div>
      {message && <p className={`notice${message.error ? ' error' : ''}`}>{message.text}</p>}
    </section>
  )
}
