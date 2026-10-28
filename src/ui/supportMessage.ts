import type { EncodeSupport } from '../core/export/encode'

/**
 * 書き出せないときの案内文。映像（H.264）が通らないのは解像度が大きすぎるだけのことがあるので、
 * そのときは今の解像度を示して「設定」で小さくするよう勧める。音声（AAC）は解像度と関係がない。
 * cause が分からない（確かめる処理自体が失敗した）ときは、両方の手当てを並べる
 */
export function encodeSupportMessage(
  support: Pick<EncodeSupport, 'cause'>,
  size: { width: number; height: number },
): string {
  const resolution = `${size.width}×${size.height}`
  switch (support.cause) {
    case 'video':
      return `このパソコンでは今の解像度（${resolution}）の mp4 を書き出せません。「設定」の「解像度」で小さい大きさを選ぶか、グラフィックドライバーを更新してください`
    case 'audio':
      return 'このパソコンでは mp4 の音声を書き出せません。アプリと OS を最新にしてください'
    default:
      return `このパソコンでは mp4 を書き出せません。「設定」の「解像度」（今は ${resolution}）を小さくするか、アプリとグラフィックドライバーを最新にしてください`
  }
}
