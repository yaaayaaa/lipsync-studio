import { describe, expect, it } from 'vitest'
import { groupChoicePatch } from '../../../src/ui/character/mouthGroup'

describe('groupChoicePatch', () => {
  it('ignores re-choosing the saved group so assignments are kept', () => {
    expect(groupChoicePatch('1', '1')).toBeNull()
    expect(groupChoicePatch(null, null)).toBeNull()
  })

  it('switches group and clears the assignments', () => {
    expect(groupChoicePatch('1', '2')).toEqual({ mouthGroupId: '2', mouthMap: {} })
    expect(groupChoicePatch(null, '2')).toEqual({ mouthGroupId: '2', mouthMap: {} })
  })

  it('clears a dangling saved group (id no longer in the PSD) when 未設定 is chosen', () => {
    // 見つからないグループは画面上「未設定」に見えるが、保存値は残っているので消せなければならない
    expect(groupChoicePatch('9/9', null)).toEqual({ mouthGroupId: null, mouthMap: {} })
  })
})
