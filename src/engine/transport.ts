/**
 * v0.1 設計 4.3: Transport は Tone.Transport の薄いラッパ。
 * v0.2 6 章: 再生ヘッドの位置だけが唯一の時刻。
 */
import * as Tone from 'tone'

export type TransportState = 'stopped' | 'started' | 'paused'

type TickListener = (beat: number) => void

type ToneTransport = ReturnType<typeof Tone.getTransport>

class Transport {
  private bpm = 100
  private state: TransportState = 'stopped'
  private tickListeners = new Set<TickListener>()
  private scheduled = new Map<string, number>()
  private tickId: number | null = null

  private get raw(): ToneTransport {
    return Tone.getTransport()
  }

  get tempo(): number {
    return this.bpm
  }

  get transportState(): TransportState {
    return this.state
  }

  /** 現在の拍。画面側の唯一の時刻。 */
  get beat(): number {
    return this.raw.ticks / this.raw.PPQ
  }

  /** 拍 -> 秒。BPM を変えてもイベントは書き換えない。 */
  beatToSeconds(beat: number): number {
    return (beat * 60) / this.bpm
  }

  secondsToBeat(seconds: number): number {
    return (seconds * this.bpm) / 60
  }

  get contextState(): string {
    return Tone.getContext().state
  }

  /** AudioContext はユーザーの最初のクリックで resume する。起動時に鳴らさない。 */
  async unlock(): Promise<void> {
    if (Tone.getContext().state !== 'running') await Tone.start()
  }

  setTempo(bpm: number): void {
    const next = Math.min(300, Math.max(20, Math.round(bpm * 10) / 10))
    if (next === this.bpm) return
    this.bpm = next
    this.raw.bpm.value = next
  }

  async play(): Promise<void> {
    await this.unlock()
    this.ensureTickPump()
    this.raw.start()
    this.state = 'started'
  }

  pause(): void {
    this.raw.pause()
    this.state = 'paused'
  }

  stop(): void {
    this.raw.stop()
    this.state = 'stopped'
    this.clearScheduled()
  }

  seek(beat: number): void {
    const seconds = this.beatToSeconds(Math.max(0, beat))
    this.raw.seconds = seconds
    for (const listener of this.tickListeners) listener(this.beat)
  }

  setLoop(startBeat: number | null, endBeat: number | null): void {
    if (startBeat === null || endBeat === null || endBeat <= startBeat) {
      this.raw.loop = false
      return
    }
    this.raw.loopStart = this.beatToSeconds(startBeat)
    this.raw.loopEnd = this.beatToSeconds(endBeat)
    this.raw.loop = true
  }

  get looping(): boolean {
    return this.raw.loop === true
  }

  onTick(listener: TickListener): () => void {
    this.tickListeners.add(listener)
    return () => this.tickListeners.delete(listener)
  }

  /** 再生中にだけ通知する。描画は rAF 側で行うので軽量に保つ。 */
  private ensureTickPump(): void {
    if (this.tickId !== null) return
    this.tickId = this.raw.scheduleRepeat(() => {
      const beat = this.beat
      for (const listener of this.tickListeners) listener(beat)
    }, '32n') as unknown as number
  }

  private clearScheduled(): void {
    for (const id of this.scheduled.values()) {
      try {
        this.raw.clear(id)
      } catch {
        // 既に消えている場合は無視
      }
    }
    this.scheduled.clear()
  }

  dispose(): void {
    this.clearScheduled()
    this.tickListeners.clear()
  }
}

export const transport = new Transport()

export const audioReady = async (): Promise<boolean> => {
  await transport.unlock()
  return transport.contextState === 'running'
}