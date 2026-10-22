import { describe, expect, it } from 'vitest'
import { parseResolution, presetOf } from '../../../src/core/export/resolution'

describe('parseResolution', () => {
  it('accepts even sizes in range, ignoring spaces and full-width digits', () => {
    expect(parseResolution('1440', '1080')).toEqual({ width: 1440, height: 1080 })
    expect(parseResolution(' １０８０ ', '1920')).toEqual({ width: 1080, height: 1920 })
    expect(parseResolution('16', '3840')).toEqual({ width: 16, height: 3840 })
  })

  it('rejects non-numbers, odd sizes and sizes out of range, naming the side', () => {
    expect(parseResolution('abc', '1080')).toEqual({ error: '幅は数字で入力してください' })
    expect(parseResolution('1920', '')).toEqual({ error: '高さは数字で入力してください' })
    expect(parseResolution('12.5', '1080')).toEqual({ error: '幅は数字で入力してください' })
    expect(parseResolution('1921', '1080')).toEqual({ error: '幅は偶数にしてください（H.264 の決まり）' })
    expect(parseResolution('1920', '14')).toEqual({ error: '高さは 16〜3840 にしてください' })
    expect(parseResolution('3842', '1080')).toEqual({ error: '幅は 16〜3840 にしてください' })
  })
})

describe('presetOf', () => {
  it('finds the preset with the same size, or null for a custom size', () => {
    expect(presetOf({ width: 1080, height: 1920 })?.label).toBe('1080×1920（縦）')
    expect(presetOf({ width: 1440, height: 1080 })).toBeNull()
  })
})
