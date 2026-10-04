/**
 * scripts/sample-data.mjs の定義を JSON に落とす。
 *
 * 手で JSON を書かずに済むように生成する。生成物だけがコミット対象で、
 * スクリプトも残して来歴と構造が読めるようにしている。
 *
 *   node scripts/gen-samples.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { outputs } from './sample-data.mjs'

let written = 0
for (const [relativePath, data] of Object.entries(outputs)) {
  const target = join(process.cwd(), relativePath)
  mkdirSync(dirname(target), { recursive: true })
  const json = `${JSON.stringify(data, null, 2)}\n`
  writeFileSync(target, json, 'utf8')
  written += 1
  console.log(`wrote ${relativePath} (${json.length} bytes)`)
}

console.log(`${written} files generated.`)