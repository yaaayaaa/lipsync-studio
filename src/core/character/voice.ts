import type { Character, ScriptLine, VoiceRef } from './types'

/** 行で使う声。行が自分の声を持っていればそれ、なければキャラの声。どちらもなければ null */
export function lineVoice(
  line: Pick<ScriptLine, 'voice'>,
  character: Pick<Character, 'voice'> | undefined,
): VoiceRef | null {
  return line.voice ?? character?.voice ?? null
}
