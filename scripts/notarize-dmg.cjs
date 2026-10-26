// electron-builder の artifactBuildCompleted フック。
// electron-builder が公証するのは .app だけで、dmg そのものは公証しない。
// ダウンロードした dmg を開いたときにも Gatekeeper が通るよう、署名済みの dmg を公証して票を貼る。
// このフックは publish（アップロード）より前に待たれるので、上がるのは票を貼った後の dmg になる。
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

// 公証は数分かかる。同期呼び出しで electron-builder の他の作業を止めないよう非同期で待つ
const run = promisify(execFile)

module.exports = async function notarizeDmg(event) {
  if (!event.file.endsWith('.dmg')) return

  const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env
  if (!APPLE_API_KEY || !APPLE_API_KEY_ID || !APPLE_API_ISSUER) {
    // 署名なしで試しに作るとき（electron-builder を直接呼んだとき）は公証しない。
    // scripts/dist-mac.sh は資格情報を必ず渡し、最後に stapler で票の有無を確かめる
    console.log(`  • skipped dmg notarization (APPLE_API_* not set)  file=${event.file}`)
    return
  }

  console.log(`  • notarizing dmg  file=${event.file}`)
  const { stdout } = await run('xcrun', [
    'notarytool',
    'submit',
    event.file,
    '--key',
    APPLE_API_KEY,
    '--key-id',
    APPLE_API_KEY_ID,
    '--issuer',
    APPLE_API_ISSUER,
    '--wait',
    '--output-format',
    'json',
  ])
  const result = JSON.parse(stdout)
  console.log(`  • dmg notarization finished  id=${result.id} status=${result.status}`)
  if (result.status !== 'Accepted') {
    throw new Error(
      `dmg の公証が通りませんでした (status=${result.status})。` +
        `理由は xcrun notarytool log ${result.id} --key ... --key-id ... --issuer ... で見られます`,
    )
  }
  await run('xcrun', ['stapler', 'staple', event.file])
}
