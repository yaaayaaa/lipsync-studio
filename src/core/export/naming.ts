const FORBIDDEN_IN_FILE_NAME = /[/\\:*?"<>|\r\n]/g
const TITLE_LENGTH = 10

function sanitize(s: string): string {
  return s.replace(FORBIDDEN_IN_FILE_NAME, '_').trim()
}

/** 禁則文字を置換してから先頭 TITLE_LENGTH 文字を取る（Array.from でサロゲートペアを割らない）。 */
function titleOf(text: string): string {
  return sanitize(Array.from(sanitize(text)).slice(0, TITLE_LENGTH).join(''))
}

const ID_LENGTH = 8

/** 単体ダウンロード: `本文先頭10文字_ID英数字8文字.mp4`。ID は書き出すたびに作り直して渡す。 */
export function singleFileName(text: string, id: string): string {
  return `${titleOf(text)}_${id.replace(/[^A-Za-z0-9]/g, '').slice(0, ID_LENGTH)}.mp4`
}

/** VOICEVOX の利用規約に沿ったクレジット表記。重複は除き、出現順。 */
export function creditText(speakerNames: string[]): string {
  return [...new Set(speakerNames)].map((name) => `VOICEVOX:${name}`).join('、')
}
