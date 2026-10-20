import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXPORT_SETTINGS } from '../../../src/core/character/types'
import type { Character, ScriptLine } from '../../../src/core/character/types'
import { lineProblem, openStore } from '../../../src/core/storage/db'
import { tuningFromQuery } from '../../../src/core/voicevox/tuning'
import { konnichiwaQuery } from '../../fixtures/audioQuery'

let counter = 0
const dbName = () => `test-db-${++counter}`
const freshStore = () => openStore(dbName())

const character = (over: Partial<Character> = {}): Character => ({
  id: 'c1',
  name: 'Zunda',
  psdFileName: 'zunda.psd',
  voice: { styleId: 3, speakerName: 'ずんだもん', styleName: 'ノーマル' },
  mouthGroupId: 'g',
  mouthMap: { closed: 'g/0' },
  expressions: [{ id: 'e1', name: 'normal', visibility: {} }],
  ...over,
})

const line = (over: Partial<ScriptLine> = {}): ScriptLine => ({
  id: 'l1',
  text: 'こんにちは',
  characterId: 'c1',
  expressionId: 'e1',
  speedScale: 1,
  ...over,
})

describe('Store characters', () => {
  it('lists saved characters and reads the PSD back', async () => {
    const store = await freshStore()
    const bytes = new Uint8Array([1, 2, 3, 4])
    await store.saveCharacter(character(), new Blob([bytes], { type: 'image/vnd.adobe.photoshop' }))
    expect(await store.listCharacters()).toEqual([character()])
    const psd = await store.loadPsd('c1')
    expect(psd).toBeInstanceOf(Blob)
    expect(psd?.type).toBe('image/vnd.adobe.photoshop')
    expect(new Uint8Array(await psd!.arrayBuffer())).toEqual(bytes)
  })

  it('keeps the stored PSD when saving a character without one', async () => {
    const store = await freshStore()
    await store.saveCharacter(character(), new Blob([new Uint8Array([9])]))
    await store.saveCharacter(character({ name: 'Renamed' }))
    expect((await store.listCharacters())[0].name).toBe('Renamed')
    expect(await store.loadPsd('c1')).toBeDefined()
  })

  it('replaces the PSD when a new one is given', async () => {
    const store = await freshStore()
    await store.saveCharacter(character(), new Blob([new Uint8Array([1])]))
    await store.saveCharacter(character(), new Blob([new Uint8Array([2, 2])]))
    expect((await store.loadPsd('c1'))?.size).toBe(2)
  })

  it('deletes the character and its PSD', async () => {
    const store = await freshStore()
    await store.saveCharacter(character(), new Blob([new Uint8Array([1])]))
    await store.deleteCharacter('c1')
    expect(await store.listCharacters()).toEqual([])
    expect(await store.loadPsd('c1')).toBeUndefined()
  })

  it('returns undefined for an unknown PSD', async () => {
    const store = await freshStore()
    expect(await store.loadPsd('nope')).toBeUndefined()
  })
})

describe('Store script and settings', () => {
  it('round-trips the script and defaults to empty', async () => {
    const store = await freshStore()
    expect(await store.loadScript()).toEqual([])
    await store.saveScript([line(), line({ id: 'l2', text: 'b' })])
    expect(await store.loadScript()).toEqual([line(), line({ id: 'l2', text: 'b' })])
  })

  // 作り込み（句の null の子音長・pause_mora・手で変えた数値を含む）が、開き直した後もそのまま読めること。
  // 作り込みのない行は tuning の項目を持たないまま読めること（古い保存データと同じ形）
  it('round-trips a line with tuning and a line without across a reopen', async () => {
    const name = dbName()
    const tuning = { ...tuningFromQuery(konnichiwaQuery(), 'こんにちは', 3), pitchScale: 0.12, pauseLengthScale: 1.5 }
    const tuned = line({ tuning, speedScale: 1.4 })
    const plain = line({ id: 'l2', text: 'b' })
    await (await openStore(name)).saveScript([tuned, plain])

    const loaded = await (await openStore(name)).loadScript()
    expect(loaded).toEqual([tuned, plain])
    expect(loaded[0]!.tuning!.accentPhrases[0]!.moras[1]!.consonant_length).toBeNull()
    expect(loaded[0]!.tuning!.accentPhrases[0]!.pause_mora?.vowel_length).toBe(0.3)
    expect('tuning' in loaded[1]!).toBe(false)
  })

  it('returns defaults when settings were never saved, as a fresh copy', async () => {
    const store = await freshStore()
    const s = await store.loadSettings()
    expect(s).toEqual({ engineUrl: 'http://localhost:50021', export: DEFAULT_EXPORT_SETTINGS })
    s.export.width = 1
    expect(DEFAULT_EXPORT_SETTINGS.width).toBe(1920)
    expect((await store.loadSettings()).export.width).toBe(1920)
  })

  it('round-trips saved settings and fills missing fields with defaults', async () => {
    const dbName = `test-db-${++counter}`
    const store = await openStore(dbName)
    await store.saveSettings({
      engineUrl: 'http://x:1',
      export: { ...DEFAULT_EXPORT_SETTINGS, background: '#000000' },
    })
    const again = await openStore(dbName)
    const s = await again.loadSettings()
    expect(s.engineUrl).toBe('http://x:1')
    expect(s.export.background).toBe('#000000')
    expect(s.export.scale).toBe(0.9)
  })

  it('merges partially stored settings over defaults', async () => {
    const dbName = `test-db-${++counter}`
    const store = await openStore(dbName)
    // simulates data saved by an older version lacking newer fields
    await store.saveSettings({ engineUrl: 'http://y', export: { width: 1280 } } as never)
    const s = await store.loadSettings()
    expect(s.export).toEqual({ ...DEFAULT_EXPORT_SETTINGS, width: 1280 })
  })
})

describe('lineProblem', () => {
  const chars = [character()]
  it('is null for a valid line', () => {
    expect(lineProblem(line(), chars)).toBeNull()
  })
  it('detects a deleted or unset character', () => {
    expect(lineProblem(line({ characterId: 'gone' }), chars)).toBe('no-character')
    expect(lineProblem(line({ characterId: null }), chars)).toBe('no-character')
  })
  it('detects a deleted or unset expression', () => {
    expect(lineProblem(line({ expressionId: 'gone' }), chars)).toBe('no-expression')
    expect(lineProblem(line({ expressionId: null }), chars)).toBe('no-expression')
  })
  it('detects a character without voice', () => {
    expect(lineProblem(line(), [character({ voice: null })])).toBe('no-voice')
  })
  it('detects a character without a mouth group or assignment', () => {
    expect(lineProblem(line(), [character({ mouthGroupId: null })])).toBe('no-mouth')
    expect(lineProblem(line(), [character({ mouthMap: {} })])).toBe('no-mouth')
  })
  it('accepts a mouth map that resolves at least one vowel', () => {
    expect(lineProblem(line(), [character({ mouthMap: { a: 'g/1' } })])).toBeNull()
  })
  it('detects whitespace-only text', () => {
    expect(lineProblem(line({ text: ' \n　 ' }), chars)).toBe('empty-text')
  })
  it('reports no-voice before no-mouth, and no-mouth before empty text', () => {
    const bare = { voice: null, mouthGroupId: null }
    expect(lineProblem(line({ text: '' }), [character(bare)])).toBe('no-voice')
    expect(lineProblem(line({ text: '' }), [character({ mouthGroupId: null })])).toBe('no-mouth')
  })
  it('applies precedence: character, expression, voice, text', () => {
    const bad = line({ text: '', expressionId: 'gone' })
    expect(lineProblem(bad, [character({ voice: null })])).toBe('no-expression')
    expect(lineProblem({ ...bad, characterId: 'gone' }, chars)).toBe('no-character')
    expect(lineProblem({ ...bad, expressionId: 'e1' }, [character({ voice: null })])).toBe('no-voice')
  })
})
