import { describe, expect, test } from 'vitest'
import { resolveAppPath, decideNavigation } from '../../electron/appProtocol'

const root = '/opt/app/dist'

describe('resolveAppPath', () => {
  test('/ と空は index.html', () => {
    expect(resolveAppPath('/', root)).toBe('/opt/app/dist/index.html')
    expect(resolveAppPath('', root)).toBe('/opt/app/dist/index.html')
  })
  test('通常のファイルとパーセントエンコード', () => {
    expect(resolveAppPath('/assets/index-abc.js', root)).toBe('/opt/app/dist/assets/index-abc.js')
    expect(resolveAppPath('/%E3%81%82.png', root)).toBe('/opt/app/dist/あ.png')
  })
  test('root の外へ出るパスは null', () => {
    expect(resolveAppPath('/../secret.txt', root)).toBeNull()
    expect(resolveAppPath('/assets/%2E%2E/%2E%2E/secret.txt', root)).toBeNull()
  })
  test('不正なエンコードは null', () => {
    expect(resolveAppPath('/%E3%81', root)).toBeNull()
  })
})

describe('decideNavigation', () => {
  test('https だけ外部ブラウザで開く', () => {
    expect(decideNavigation('https://example.com/a')).toBe('external')
    expect(decideNavigation('http://example.com/a')).toBe('ignore')
    expect(decideNavigation('file:///etc/passwd')).toBe('ignore')
    expect(decideNavigation('javascript:alert(1)')).toBe('ignore')
    expect(decideNavigation('not a url')).toBe('ignore')
  })
})
