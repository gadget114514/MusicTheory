import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { addRecentFile, listRecentFiles } from './projectIO'

/** v0.1 設計 4.2: Main はウィンドウ、dialog、プロジェクトの read/write だけを持つ。 */
function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#12131a',
    title: 'Theory Desk',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // v0.1 設計 4.2: contextIsolation は true、nodeIntegration は false。
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => win.show())

  // 外部リンクは OS のブラウザへ。Renderer には window.open を出さない。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/** Web MIDI は Chromium 側の権限 popup を出さず、そのまま通す。 */
function grantWebMidi(): void {
  const allowed = new Set(['midi', 'midiSysex', 'midi-sysex'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowed.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    allowed.has(permission),
  )
}

function registerIpc(): void {
  ipcMain.handle('td:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
  }))

  ipcMain.handle('td:open-midi', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'MIDI を開く',
          properties: ['openFile'],
          filters: [
            { name: 'MIDI', extensions: ['mid', 'midi', 'smf', 'rmi'] },
            { name: 'すべてのファイル', extensions: ['*'] },
          ],
        })
      : await dialog.showOpenDialog({
          title: 'MIDI を開く',
          properties: ['openFile'],
          filters: [
            { name: 'MIDI', extensions: ['mid', 'midi', 'smf', 'rmi'] },
            { name: 'すべてのファイル', extensions: ['*'] },
          ],
        })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    const data = await readFile(path)
    void addRecentFile(path)
    return { name: basename(path), path, data: new Uint8Array(data) }
  })

  ipcMain.handle('td:open-project', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'プロジェクトを開く',
      properties: ['openFile' as const],
      filters: [
        { name: 'Theory Desk プロジェクト', extensions: ['json'] },
        { name: 'すべてのファイル', extensions: ['*'] },
      ],
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    const text = await readFile(path, 'utf8')
    void addRecentFile(path)
    return { name: basename(path), path, text }
  })

  ipcMain.handle('td:save-project', async (event, payload: unknown) => {
    const { name, text } = (payload ?? {}) as { name?: string; text?: string }
    if (typeof text !== 'string') return null
    const stem = basename(name ?? 'score.tdesk.json').replace(/\.tdesk(\.json)?$/i, '')
    const suggested = `${stem}.tdesk.json`
    const options = {
      title: 'プロジェクトを保存',
      defaultPath: join(app.getPath('documents'), suggested),
      filters: [{ name: 'Theory Desk プロジェクト', extensions: ['json'] }],
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, text, 'utf8')
    void addRecentFile(result.filePath)
    return result.filePath
  })

  ipcMain.handle('td:read-midi', async (_event, path: unknown) => {
    if (typeof path !== 'string' || !existsSync(path)) return null
    const data = await readFile(path)
    return { name: basename(path), path, data: new Uint8Array(data) }
  })

  ipcMain.handle('td:recent', () => listRecentFiles())
  ipcMain.handle('td:add-recent', (_event, path: unknown) =>
    typeof path === 'string' ? addRecentFile(path) : undefined,
  )
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  grantWebMidi()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})