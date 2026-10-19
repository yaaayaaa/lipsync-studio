import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // 比較ページ（使い捨ての試作）も一緒に書き出す
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        compare: resolve(import.meta.dirname, 'compare.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
