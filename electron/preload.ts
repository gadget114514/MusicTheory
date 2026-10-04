import { contextBridge, ipcRenderer } from 'electron'
import type {
  ElectronBridgeApi,
  PickedBinaryFile,
  PickedTextFile,
  RuntimeInfo,
} from '../src/platform/bridge'

/**
 * v0.1 設計 4.2: Preload は contextBridge で開く/保存/MIDI 権限の薄い API だけを開く。
 * ビジネスロジックは書かない。Renderer は src/platform/bridge.ts の形だけを知ればよく、
 * Web 版 (GitHub Pages) も同じ形を file input / download で実装できる。
 */
const api: ElectronBridgeApi = {
  runtime: 'electron',
  info: (): Promise<RuntimeInfo> => ipcRenderer.invoke('td:info'),
  openMidi: (): Promise<PickedBinaryFile | null> => ipcRenderer.invoke('td:open-midi'),
  openProject: (): Promise<PickedTextFile | null> => ipcRenderer.invoke('td:open-project'),
  saveProject: (payload: { name: string; text: string }): Promise<string | null> =>
    ipcRenderer.invoke('td:save-project', payload),
  readMidi: (path: string): Promise<PickedBinaryFile | null> =>
    ipcRenderer.invoke('td:read-midi', path),
  listRecent: (): Promise<string[]> => ipcRenderer.invoke('td:recent'),
  addRecent: (path: string): Promise<string[]> => ipcRenderer.invoke('td:add-recent', path),
}

contextBridge.exposeInMainWorld('theoryDesk', api)