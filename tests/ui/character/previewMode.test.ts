import { describe, expect, it } from 'vitest'
import { previewModeAfter, previewMouthLayer } from '../../../src/ui/character/previewMode'

describe('previewModeAfter', () => {
  it('follows the vowel whose dropdown was opened', () => {
    expect(previewModeAfter({ type: 'vowelOpened', vowel: 'u' })).toBe('u')
    expect(previewModeAfter({ type: 'vowelOpened', vowel: 'closed' })).toBe('closed')
  })

  it('returns to the tree when layers are toggled in the tree', () => {
    expect(previewModeAfter({ type: 'treeToggled' })).toBeNull()
  })

  it('keeps manual choices', () => {
    expect(previewModeAfter({ type: 'manual', mode: 'o' })).toBe('o')
    expect(previewModeAfter({ type: 'manual', mode: null })).toBeNull()
  })

  describe('after the mouth group changes', () => {
    it('shows 閉じ when it is assigned', () => {
      expect(previewModeAfter({ type: 'groupChanged', mouthGroupId: '1', mouthMap: { a: '1/0', closed: '1/2' } })).toBe('closed')
    })

    it('falls back to the first assigned vowel in あいうえお order', () => {
      expect(previewModeAfter({ type: 'groupChanged', mouthGroupId: '1', mouthMap: { o: '1/1', i: '1/0' } })).toBe('i')
    })

    it('shows the tree when nothing is assigned or no group is set', () => {
      expect(previewModeAfter({ type: 'groupChanged', mouthGroupId: '1', mouthMap: {} })).toBeNull()
      expect(previewModeAfter({ type: 'groupChanged', mouthGroupId: null, mouthMap: { closed: '1/2' } })).toBeNull()
    })
  })
})

describe('previewMouthLayer', () => {
  const map = { a: '1/0', closed: '1/2' }

  it('uses the saved mouth (with the 閉じ fallback) when nothing is highlighted', () => {
    expect(previewMouthLayer(map, 'a', null)).toBe('1/0')
    expect(previewMouthLayer(map, 'u', null)).toBe('1/2')
  })

  it('shows the highlighted option of the open dropdown for that vowel', () => {
    expect(previewMouthLayer(map, 'a', { vowel: 'a', layerId: '1/3' })).toBe('1/3')
  })

  it('treats a highlighted 未設定 as what saving it would show (the 閉じ fallback)', () => {
    expect(previewMouthLayer(map, 'a', { vowel: 'a', layerId: null })).toBe('1/2')
    expect(previewMouthLayer({ a: '1/0' }, 'a', { vowel: 'a', layerId: null })).toBeNull()
  })

  it('ignores a highlight for a different vowel', () => {
    expect(previewMouthLayer(map, 'a', { vowel: 'u', layerId: '1/3' })).toBe('1/0')
  })
})
