/**
 * プラットフォーム抽象化。
 *
 * Electron 版は preload が開いた contextBridge を、GitHub Pages 版は
 * file input / download を使う。Renderer の他の部分は差し替えを意識しない。
 */

export interface PickedBinaryFile {
  name: string
  path: string | null
  data: Uint8Array
}

export interface PickedTextFile {
  name: string
  path: string | null
  text: string
}

export interface RuntimeInfo {
  version: string
  electron?: string
  chrome?: string
  node?: string
  platform: string
}

export interface PlatformBridge {
  readonly runtime: 'electron' | 'web'
  readonly label: string
  info(): Promise<RuntimeInfo>
  openMidi(): Promise<PickedBinaryFile | null>
  openProject(): Promise<PickedTextFile | null>
  /** 保存先。无ければ null（Web 版はダウンロードなので常に null）。 */
  saveProject(name: string, text: string): Promise<string | null>
  /** 最近使ったファイル。Web 版では常に空。 */
  listRecent(): Promise<string[]>
  /** 既知のパスから読み直す。Web 版では常に null。 */
  readByPath(path: string): Promise<PickedBinaryFile | null>
}

/** preload が contextBridge に出す形。bridge.ts と同じ形を保つ。 */
export interface ElectronBridgeApi {
  runtime: 'electron'
  info(): Promise<RuntimeInfo>
  openMidi(): Promise<PickedBinaryFile | null>
  openProject(): Promise<PickedTextFile | null>
  saveProject(payload: { name: string; text: string }): Promise<string | null>
  readMidi(path: string): Promise<PickedBinaryFile | null>
  listRecent(): Promise<string[]>
  addRecent(path: string): Promise<string[]>
}

declare global {
  interface Window {
    theoryDesk?: ElectronBridgeApi
  }
}