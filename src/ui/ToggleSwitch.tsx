interface Props {
  /** 読み上げ用の名前（見た目の見出しとは別に付ける） */
  label: string
  checked: boolean
  disabled?: boolean
  onChange(checked: boolean): void
}

/** オン／オフを切り替えるスイッチ。押した時点で切り替わる（確定ボタンはない） */
export function ToggleSwitch({ label, checked, disabled, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      className="toggle-switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-switch-thumb" aria-hidden />
    </button>
  )
}
