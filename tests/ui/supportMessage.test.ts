import { describe, expect, test } from 'vitest'
import { encodeSupportMessage } from '../../src/ui/supportMessage'

const size = { width: 3840, height: 2160 }

describe('encodeSupportMessage', () => {
  test('映像が通らないときは今の解像度を示し、設定で小さくするよう勧める', () => {
    const m = encodeSupportMessage({ cause: 'video' }, size)
    expect(m).toContain('3840×2160')
    expect(m).toContain('「設定」の「解像度」')
  })
  test('音声が通らないときは解像度を勧めない', () => {
    const m = encodeSupportMessage({ cause: 'audio' }, size)
    expect(m).not.toContain('解像度')
  })
  test('原因が分からないときも解像度を試す案内を出す', () => {
    expect(encodeSupportMessage({}, size)).toContain('解像度')
  })
  test('ブラウザを前提にした言い方をしない', () => {
    for (const cause of ['video', 'audio', undefined] as const) {
      expect(encodeSupportMessage({ cause }, size)).not.toMatch(/ブラウザ|Chrome|Edge/)
    }
  })
})
