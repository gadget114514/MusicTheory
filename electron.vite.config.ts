import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { createRendererConfig } from './vite.shared'

const src = resolve(process.cwd(), 'src')
const electronDir = resolve(process.cwd(), 'electron')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@electron': electronDir },
    },
    build: {
      outDir: resolve(process.cwd(), 'out/main'),
      emptyOutDir: true,
      rollupOptions: {
        input: { index: resolve(electronDir, 'main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@electron': electronDir },
    },
    build: {
      outDir: resolve(process.cwd(), 'out/preload'),
      emptyOutDir: true,
      rollupOptions: {
        input: { index: resolve(electronDir, 'preload.ts') },
      },
    },
  },
  renderer: {
    ...createRendererConfig('build'),
    root: src,
    resolve: {
      alias: {
        '@': src,
        '@electron': electronDir,
      },
    },
    build: {
      outDir: resolve(process.cwd(), 'out/renderer'),
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 2048,
      rollupOptions: {
        input: resolve(src, 'index.html'),
      },
    },
  },
})