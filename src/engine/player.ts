/**
 * v0.1 設計 7.3: ScoreDocument.notes を Tone.Part に展開する。
 * sample と user と import で別 Part にするのは、「Tutorial は sample だけ、
 * Playback は両方を鳴らせる」ため。止まるのも Part の start/stop だけ。
 */
import * as Tone from 'tone'
import type { NoteEvent, NoteSource } from '@/model/types'
import { playNoteAt } from './audio'
import { transport } from './transport'

type Lane = NoteSource

const LANES: Lane[] = ['sample', 'user', 'import']

class Player {
  private parts = new Map<Lane, Tone.Part>()
  private laneMuted = new Set<Lane>()
  private notes: NoteEvent[] = []
  private bpm = 100
  /** Tutorial は sample だけ。 */
  private sampleOnly = false

  private build(): void {
    this.disposeParts()
    for (const lane of LANES) {
      const laneNotes = this.notes.filter((n) => n.source === lane)
      if (laneNotes.length === 0) continue
      const events = laneNotes.map((n) => ({
        midi: n.midi,
        velocity: n.velocity,
        duration: Math.max(0.06, (n.duration * 60) / this.bpm),
        time: (n.time * 60) / this.bpm,
      }))
      const part = new Tone.Part((time, event) => {
        const e = event as { midi: number; velocity: number; duration: number }
        playNoteAt(e.midi, e.velocity, time, e.duration)
      }, events)
      part.start(0)
      this.parts.set(lane, part)
    }
  }

  private disposeParts(): void {
    for (const part of this.parts.values()) {
      try {
        part.stop()
        part.dispose()
      } catch {
        // 二重 dispose は無視
      }
    }
    this.parts.clear()
  }

  /** 拍 -> 秒 の変換は Part を組み立て直すときだけ行う。イベント自体は書き換えない。 */
  load(notes: NoteEvent[], bpm: number): void {
    this.notes = notes
    this.bpm = bpm
    this.build()
  }

  setBpm(bpm: number): void {
    this.bpm = bpm
    this.build()
  }

  setSampleOnly(sampleOnly: boolean): void {
    this.sampleOnly = sampleOnly
  }

  setLaneMuted(lane: Lane, muted: boolean): void {
    if (muted) this.laneMuted.add(lane)
    else this.laneMuted.delete(lane)
  }

  isLaneMuted(lane: Lane): boolean {
    return this.laneMuted.has(lane)
  }

  activeLanes(): Lane[] {
    const source: Lane[] = this.sampleOnly ? ['sample'] : [...LANES]
    return source.filter((lane) => this.parts.has(lane) && !this.laneMuted.has(lane))
  }

  hasLane(lane: Lane): boolean {
    return this.parts.has(lane)
  }

  /** 再生 길을 1 つに揃える。ここだけが変われば「サンプルも同じ経路で鳴る」が成立する。 */
  refresh(): void {
    const lanes = new Set(this.activeLanes())
    for (const [lane, part] of this.parts) {
      const shouldRun = lanes.has(lane)
      const isRunning = part.state === 'started'
      if (shouldRun && !isRunning) part.start(0)
      if (!shouldRun && isRunning) part.stop(0)
    }
  }

  /** 矩形だけ止める。哪一种バスも切らない。 */
  stopParts(): void {
    for (const part of this.parts.values()) {
      try {
        part.stop(0)
      } catch {
        // 未開始なら何もしない
      }
    }
  }

  startParts(): void {
    for (const lane of this.activeLanes()) {
      const part = this.parts.get(lane)
      if (part && part.state !== 'started') part.start(0)
    }
  }

  /** シーンの開始拍。sample のみを鳴らしたいとき便捷。 */
  seek(beat: number): void {
    transport.seek(beat)
  }
}

export const player = new Player()