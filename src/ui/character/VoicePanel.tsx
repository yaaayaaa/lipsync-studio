import type { VoiceRef } from '../../core/character/types'
import { VoicePicker } from '../VoicePicker'

interface Props {
  voice: VoiceRef | null
  onChange(voice: VoiceRef | null): void
}

export function VoicePanel({ voice, onChange }: Props) {
  return (
    <section className="panel">
      <h2>声</h2>
      <VoicePicker voice={voice} onChange={onChange} noneLabel="未設定" />
    </section>
  )
}
