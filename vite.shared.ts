import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import type { UserConfig } from 'vite'

const root = resolve(process.cwd(), 'src')

/**
 * Renderer 用の設定。Electron 版 (`electron.vite.config.ts`) と
 * GitHub Pages 版 (`vite.config.ts`) が同じものを共有する。
 *
 * `base` はビルド時のみ `'./'` にする。GitHub Pages では
 * `/<repo>/` の階層に配置されるため、相対パスでないとアセットが 404 になる。
 * Electron は file:// で読むので、ここでも相対パスが正解。
 */
export function createRendererConfig(command: 'serve' | 'build'): UserConfig {
  return {
    root,
    base: command === 'build' ? './' : '/',
    publicDir: resolve(root, 'public'),
    plugins: [react()],
    resolve: {
      alias: {
        '@': root,
      },
    },
    server: {
      port: 5173,
      strictPort: false,
    },
    build: {
      target: 'es2022',
      sourcemap: command === 'build' ? false : true,
      chunkSizeWarningLimit: 2048,
    },
  }
}