import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // 一度開けば、次からはネットにつながっていなくても開けるようにする（アプリのファイルをまるごとブラウザに保存する）。
    // 新しい版は、開いているタブを全部閉じたあと次に開いたときに入れ替わる。開いている途中では入れ替えない
    // （書き出しの途中や編集中にページの中身が変わらないように）。新しい版の知らせは出さない
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'script',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'lipsync-studio',
        short_name: 'lipsync-studio',
        description: 'PSD の立ち絵を VOICEVOX の音声にリップシンクさせ、mp4 として書き出すブラウザアプリ',
        lang: 'ja',
        display: 'standalone',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // 既定の上限（2MB）を超えたファイルは黙って保存から外れ、オフラインで開けなくなる。
        // 今の本体は約1.3MBなので、育っても外れないよう余裕を持たせる
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
