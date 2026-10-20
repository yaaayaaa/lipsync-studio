import { describe, expect, it } from 'vitest'
import { eyeGroupChoicePatch, groupChoicePatch } from '../../../src/ui/character/mouthGroup'

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

describe('eyeGroupChoicePatch', () => {
  it('assigns a group to a character saved without eyes', () => {
    expect(eyeGroupChoicePatch(undefined, 'g')).toEqual({ eyeGroupId: 'g', eyeMap: {} })
  })

  it('ignores re-choosing the saved group so assignments are kept', () => {
    expect(eyeGroupChoicePatch('g', 'g')).toBeNull()
    expect(eyeGroupChoicePatch(undefined, null)).toBeNull()
    expect(eyeGroupChoicePatch(null, null)).toBeNull()
  })

  it('clears the assignments when the group is unset or changed', () => {
    expect(eyeGroupChoicePatch('g', null)).toEqual({ eyeGroupId: null, eyeMap: {} })
    expect(eyeGroupChoicePatch('g', 'h')).toEqual({ eyeGroupId: 'h', eyeMap: {} })
  })
})
