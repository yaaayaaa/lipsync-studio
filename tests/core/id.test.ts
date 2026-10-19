import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from '../../src/core/id'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a v4 UUID', () => {
    expect(newId()).toMatch(UUID_V4)
  })

  it('works without crypto.randomUUID (non-secure context such as http://<LAN IP>)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const ids = new Set(Array.from({ length: 100 }, () => newId()))
    expect(ids.size).toBe(100)
    for (const id of ids) expect(id).toMatch(UUID_V4)
  })
})
