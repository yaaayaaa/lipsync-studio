/**
 * つまみの下に出す音素の名前（VOICEVOX の表記）。無声化した母音（A・I・U）と ン（N）も小文字で揃える。
 * 例：カ → k / a、ン → n、ッ → cl
 */
export function phonemeLabel(phoneme: string): string {
  return phoneme.toLowerCase()
}
