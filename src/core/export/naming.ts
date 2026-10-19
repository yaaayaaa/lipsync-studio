const FORBIDDEN_IN_FILE_NAME = /[/\\:*?"<>|\r\n]/g
const TITLE_LENGTH = 10

function sanitize(s: string): string {
  return s.replace(FORBIDDEN_IN_FILE_NAME, '_').trim()
}

/** `001_キャラ名_本文先頭10文字.mp4`。禁則文字を置換してから先頭を取る（Array.from でサロゲートペアを割らない）。 */
export function lineFileName(index: number, characterName: string, text: string): string {
  const number = String(index + 1).padStart(3, '0')
  const title = sanitize(Array.from(sanitize(text)).slice(0, TITLE_LENGTH).join(''))
  return `${number}_${sanitize(characterName)}_${title}.mp4`
}

/** VOICEVOX の利用規約に沿ったクレジット表記。重複は除き、出現順。 */
export function creditText(speakerNames: string[]): string {
  return [...new Set(speakerNames)].map((name) => `VOICEVOX:${name}`).join('、')
}
