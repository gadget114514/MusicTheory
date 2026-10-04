import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { createRendererConfig } from './vite.shared'

/**
 * GitHub Pages 用の設定。Electron には一切依存しない。
 * `npm run build:web` の出力 (dist-web/) をそのまま Pages に載せられる。
 */
export default defineConfig(({ command }) => {
  const base = createRendererConfig(command === 'build' ? 'build' : 'serve')
  return {
    ...base,
    build: {
      ...base.build,
      outDir: resolve(process.cwd(), 'dist-web'),
      emptyOutDir: true,
    },
  }
})