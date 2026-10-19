// アイコンは Lucide（ISC）。名前ごとに読み込むので、使った分だけが書き出しに入る。
// 色は文字色（currentColor）を継ぐので、白黒・ダークモードは文字と同じに切り替わる。
// 読み上げはボタン側のラベルに任せ、アイコン自体は読ませない。

/** ボタンの中で使うアイコンの共通設定 */
export const iconProps = { size: 16, 'aria-hidden': true } as const
