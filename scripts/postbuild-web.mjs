// npm run build:web の後処理。
// GitHub Pages は _* で始まるファイルを Jekyll が削除するため .nojekyll を置く。
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const outDir = join(process.cwd(), 'dist-web')

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, base, out)
    else out.push(full.slice(base.length + 1))
  }
  return out
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, '.nojekyll'), '')

console.log(`web build -> ${outDir}`)
for (const file of walk(outDir).sort()) {
  console.log(`  ${file.padEnd(28)} ${humanSize(statSync(join(outDir, file)).size)}`)
}