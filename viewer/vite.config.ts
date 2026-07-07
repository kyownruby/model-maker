import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages 配信時はサブパス配下になるため相対パスでビルドする
  base: './',
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
})
