import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const MAX_RECENT = 12

function recentFilePath(): string {
  return join(app.getPath('userData'), 'recent.json')
}

/**  最近使ったファイル。Renderer からは IPC でしか触らない。 */
export async function listRecentFiles(): Promise<string[]> {
  try {
    const raw = await readFile(recentFilePath(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export async function addRecentFile(path: string): Promise<string[]> {
  const current = await listRecentFiles()
  const next = [path, ...current.filter((x) => x !== path)].slice(0, MAX_RECENT)
  const file = recentFilePath()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(next, null, 2), 'utf8')
  return next
}