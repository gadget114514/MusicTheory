/**
 * v0.1 設計 7.4: 録音開始時の Transport 位置を原点に、NoteOn/Off の差分を拍へ量子化する。
 * 既定は量子化なし。既存の notes は消さず、source:user のレーンに追加する。
 */
import type { NoteEvent, Quantize } from '@/model/types'
import { makeId } from '@/model/types'
import { markTransportOrigin, beatFromContextTime, nowSeconds } from './audio'
import { transport } from './transport'

const MIN_DURATION = 0.25

export class Recorder {
  private originBeat = 0
  private active = new Map<number, number>()
  private finished: NoteEvent[] = []

  start(): void {
    markTransportOrigin()
    this.originBeat = transport.beat
    this.active.clear()
    this.finished = []
  }

  noteOn(midi: number, velocity: number): void {
    const beat = beatFromContextTime(nowSeconds())
    this.active.set(midi, Math.max(beat, this.originBeat))
    void velocity
  }

  noteOff(midi: number, quantize: Quantize, barBeats: number): NoteEvent | null {
    const start = this.active.get(midi)
    if (start === undefined) return null
    this.active.delete(midi)
    const offBeat = Math.max(start + MIN_DURATION, beatFromContextTime(nowSeconds()))
    return this.build(midi, start, offBeat, quantize, barBeats)
  }

  /** Transport 停止時に開いたままの音を閉じる。 */
  flush(quantize: Quantize, barBeats: number): NoteEvent[] {
    const out = [...this.finished]
    this.finished = []
    for (const [midi, start] of this.active) {
      const note = this.build(midi, start, start + MIN_DURATION, quantize, barBeats)
      if (note) out.push(note)
    }
    this.active.clear()
    return out
  }

  get hasOpenNotes(): boolean {
    return this.active.size > 0
  }

  private build(
    midi: number,
    rawStart: number,
    rawEnd: number,
    quantize: Quantize,
    barBeats: number,
  ): NoteEvent | null {
    const grid = gridFor(quantize, barBeats)
    const start = quantizeBeat(rawStart - this.originBeat, grid) + this.originBeat
    const end = quantizeBeat(rawEnd - this.originBeat, grid) + this.originBeat
    const duration = Math.max(MIN_DURATION, end - start)
    return {
      id: makeId('n'),
      time: Number(start.toFixed(4)),
      duration: Number(duration.toFixed(4)),
      midi,
      velocity: 100,
      source: 'user',
    }
  }
}

function gridFor(quantize: Quantize, barBeats: number): number | null {
  if (quantize === 'off') return null
  return quantize === '1/8' ? barBeats / 2 : barBeats / 4
}

function quantizeBeat(beat: number, grid: number | null): number {
  if (!grid) return beat
  return Math.round(beat / grid) * grid
}

export const recorder = new Recorder()