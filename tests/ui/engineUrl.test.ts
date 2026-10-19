import { describe, expect, it } from 'vitest'
import { normalizeEngineUrl } from '../../src/ui/engineUrl'

describe('normalizeEngineUrl', () => {
  it('accepts http(s) URLs and drops trailing slashes', () => {
    expect(normalizeEngineUrl(' http://localhost:50021/ ')).toBe('http://localhost:50021')
    expect(normalizeEngineUrl('https://example.test/voicevox/')).toBe('https://example.test/voicevox')
  })

  it('rejects other schemes, query strings and non-URLs', () => {
    expect(normalizeEngineUrl('localhost:50021')).toBeNull()
    expect(normalizeEngineUrl('ftp://localhost:50021')).toBeNull()
    expect(normalizeEngineUrl('http://localhost:50021/?x=1')).toBeNull()
    expect(normalizeEngineUrl('')).toBeNull()
  })
})
