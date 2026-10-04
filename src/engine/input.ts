/**
 * v0.1 設計 7.1: 入力の正規化。
 * 画面クリック、PC キーボード、外部 MIDI はすべて同じ NoteOn / NoteOff にする。
 * 画面側は装置を知らない。
 */
import { allNotesOff } from './audio'

export type NoteSourceDevice = 'screen' | 'computer' | 'midi'

export interface NoteEventInput {
  midi: number
  velocity: number
  device: NoteSourceDevice
}

type Handler = (event: NoteEventInput) => void

/** 88 鍵の两端。 */
export const MIDI_LOW = 21
export const MIDI_HIGH = 108
/** 既定の見える範囲は C2 から C6。 */
export const DEFAULT_VIEW_LOW = 36
export const DEFAULT_VIEW_HIGH = 84

/** A = C4 の固定マップ。2 行。 */
export const KEY_MAP: Record<string, number> = {
  z: 48, s: 49, x: 50, d: 51, c: 52, v: 53, g: 54, b: 55, h: 56, n: 57, j: 58, m: 59,
  ',': 60, l: 61, '.': 62, ';': 63, '/': 64,
  q: 60, '2': 61, w: 62, '3': 63, e: 64, r: 65, '5': 66, t: 67, '6': 68, y: 69, '7': 70,
  u: 71, i: 72, '9': 73, o: 74, '0': 75, p: 76,
}
const REVERSE_KEY_MAP = new Map<number, string>(
  Object.entries(KEY_MAP).map(([key, midi]) => [midi, key]),
)

export type MidiStatus = 'idle' | 'requesting' | 'ready' | 'unsupported' | 'denied'

class InputRouter {
  private held = new Map<number, NoteSourceDevice>()
  private onNoteOnHandlers = new Set<Handler>()
  private onNoteOffHandlers = new Set<Handler>()
  private midiAccess: MIDIAccess | null = null
  private deviceNames: string[] = []
  private status: MidiStatus = 'idle'
  private statusHandlers = new Set<(status: MidiStatus, names: string[]) => void>()

  get midiStatus(): MidiStatus {
    return this.status
  }

  get midiDevices(): string[] {
    return this.deviceNames
  }

  get heldCount(): number {
    return this.held.size
  }

  onNoteOn(handler: Handler): () => void {
    this.onNoteOnHandlers.add(handler)
    return () => this.onNoteOnHandlers.delete(handler)
  }

  onNoteOff(handler: Handler): () => void {
    this.onNoteOffHandlers.add(handler)
    return () => this.onNoteOffHandlers.delete(handler)
  }

  onMidiStatus(handler: (status: MidiStatus, names: string[]) => void): () => void {
    this.statusHandlers.add(handler)
    handler(this.status, this.deviceNames)
    return () => this.statusHandlers.delete(handler)
  }

  private emitStatus(status: MidiStatus, names: string[]): void {
    this.status = status
    this.deviceNames = names
    for (const handler of this.statusHandlers) handler(status, names)
  }

  /** 画面鍵盤 / PC キーボードからの入口。device を normalisation する。 */
  press(midi: number, device: NoteSourceDevice, velocity = 100): boolean {
    if (midi < MIDI_LOW || midi > MIDI_HIGH) return false
    if (this.held.has(midi)) return false
    this.held.set(midi, device)
    for (const handler of this.onNoteOnHandlers) handler({ midi, velocity, device })
    return true
  }

  release(midi: number, device: NoteSourceDevice = 'screen'): boolean {
    const source = this.held.get(midi)
    if (!source) return false
    this.held.delete(midi)
    for (const handler of this.onNoteOffHandlers) handler({ midi, velocity: 0, device })
    return true
  }

  /** NoteOff が来ない装置向け。Transport 停止時などに呼ぶ。 */
  allOff(): void {
    if (this.held.size === 0) return
    const wasHeld = [...this.held.keys()]
    this.held.clear()
    for (const midi of wasHeld) {
      for (const handler of this.onNoteOffHandlers) handler({ midi, velocity: 0, device: 'screen' })
    }
    allNotesOff()
  }

  heldMidis(): number[] {
    return [...this.held.keys()].sort((a, b) => a - b)
  }

  /** PC キーボード。真下敷の keydown を見る。 */
  handleComputerKeyDown(event: KeyboardEvent): number | null {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return null
    const midi = KEY_MAP[event.key.toLowerCase()]
    if (midi === undefined) return null
    if (this.press(midi, 'computer', 100)) return midi
    return null
  }

  handleComputerKeyUp(event: KeyboardEvent): number | null {
    const midi = KEY_MAP[event.key.toLowerCase()]
    if (midi === undefined) return null
    if (this.release(midi, 'computer')) return midi
    return null
  }

  labelForMidi(midi: number): string | undefined {
    return REVERSE_KEY_MAP.get(midi)
  }

  /** Web MIDI。権限が取れなければ画面鍵盤へ落ちる。 */
  async requestMidi(): Promise<MidiStatus> {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      this.emitStatus('unsupported', [])
      return 'unsupported'
    }
    this.emitStatus('requesting', this.deviceNames)
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false })
      this.midiAccess = access
      this.bindInputs()
      access.onstatechange = () => this.bindInputs()
      this.emitStatus('ready', this.deviceNames)
      return 'ready'
    } catch {
      this.emitStatus('denied', [])
      return 'denied'
    }
  }

  private bindInputs(): void {
    if (!this.midiAccess) return
    const names: string[] = []
    for (const input of this.midiAccess.inputs.values()) {
      names.push(input.name ?? 'MIDI in')
      input.onmidimessage = (event) => this.handleMidiMessage(event)
    }
    this.emitStatus(this.status === 'ready' ? 'ready' : this.status, names)
  }

  private handleMidiMessage(event: MIDIMessageEvent): void {
    const data = event.data
    if (!data || data.length < 2) return
    const status = data[0] & 0xf0
    const midi = data[1]
    const velocity = data.length > 2 ? data[2] : 0

    if (status === 0x90 && velocity > 0) {
      this.press(midi, 'midi', velocity)
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      this.release(midi, 'midi')
    } else if (status === 0xb0 && midi === 123) {
      // All Notes Off
      this.allOff()
    } else if (status === 0xb0 && midi === 120) {
      this.allOff()
    }
  }
}

export const inputRouter = new InputRouter()