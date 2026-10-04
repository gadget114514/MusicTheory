import type {
  PickedBinaryFile,
  PickedTextFile,
  PlatformBridge,
  RuntimeInfo,
} from './bridge'

function pickFile(accept: string, as: 'text' | 'binary'): Promise<
  { name: string; text: string } | { name: string; data: Uint8Array } | null
> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)

    const cleanup = () => {
      window.removeEventListener('focus', onFocus)
      input.remove()
    }
    // キャンセル時は change が来ない。フォーカスが戻ったことを手掛かりに打ち切る。
    let done = false
    const finish = (
      value: null | { name: string; text: string } | { name: string; data: Uint8Array },
    ) => {
      if (done) return
      done = true
      cleanup()
      resolve(value)
    }
    const onFocus = () => {
      window.setTimeout(() => finish(null), 800)
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return finish(null)
      void (as === 'text'
        ? file.text().then((text) => finish({ name: file.name, text }))
        : file
            .arrayBuffer()
            .then((buf) => finish({ name: file.name, data: new Uint8Array(buf) })))
    })
    window.addEventListener('focus', onFocus, { once: true })
    input.click()
  })
}

/** GitHub Pages 版。Node なし、ファイルはメモリ上のまま。 */
class WebBridge implements PlatformBridge {
  readonly runtime = 'web' as const
  readonly label = 'Web (GitHub Pages)'

  async info(): Promise<RuntimeInfo> {
    return {
      version: import.meta.env.VITE_APP_VERSION ?? '0.3.0',
      platform: navigator.platform || 'web',
    }
  }

  async openMidi(): Promise<PickedBinaryFile | null> {
    const picked = await pickFile('.mid,.midi,audio/midi,audio/x-midi', 'binary')
    if (!picked || !('data' in picked)) return null
    return { name: picked.name, path: null, data: picked.data }
  }

  async openProject(): Promise<PickedTextFile | null> {
    const picked = await pickFile('.json,application/json', 'text')
    if (!picked || !('text' in picked)) return null
    return { name: picked.name, path: null, text: picked.text }
  }

  async saveProject(name: string, text: string): Promise<string | null> {
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name.endsWith('.json') ? name : `${name}.tdesk.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    return null
  }

  async listRecent(): Promise<string[]> {
    return []
  }

  async readByPath(): Promise<PickedBinaryFile | null> {
    return null
  }
}

const electronBridge: PlatformBridge = {
  runtime: 'electron',
  label: 'Electron',
  info: () => window.theoryDesk!.info(),
  openMidi: () => window.theoryDesk!.openMidi(),
  openProject: () => window.theoryDesk!.openProject(),
  saveProject: (name, text) => window.theoryDesk!.saveProject({ name, text }),
  listRecent: () => window.theoryDesk!.listRecent(),
  readByPath: (path) => window.theoryDesk!.readMidi(path),
}

export const platform: PlatformBridge = window.theoryDesk ? electronBridge : new WebBridge()

export const isElectron = platform.runtime === 'electron'