/**
 * コード進行の試聴。和音をコード進行に従って鳴らす。
 *
 * 音は inputRouter.press/release を通す。App が購読している onNoteOn/onNoteOff
 * 経由で audio.noteOn/noteOff が鳴り、鍵盤の琥珀点灯も同じ経路で付く。
 * ここではシンセを直接触らない。
 */
import { inputRouter } from './input'
import { transport } from './transport'
import { chordPitchClasses, voiceChord } from '@/theory'
import type { ChordEvent } from '@/model/types'

let timers: ReturnType<typeof setTimeout>[] = []
let held: number[] = []
let auditionId = 0

function clearTimers(): void {
  for (const t of timers) clearTimeout(t)
  timers = []
}

function releaseMidis(midis: number[]): void {
  for (const midi of midis) {
    try {
      inputRouter.release(midi, 'screen')
    } catch {
      // 解放済みは無視
    }
  }
  held = held.filter((m) => !midis.includes(m))
}

function releaseHeld(): void {
  releaseMidis([...held])
}

/** シンボルから発音する MIDI 群。ルートの1オクターブ下のベースを足して厚みを出す。 */
export function midisForSymbol(symbol: string, centerMidi = 60): number[] {
  if (!symbol) return []
  const pcs = chordPitchClasses(symbol)
  if (pcs.length === 0) return []
  const voiced = voiceChord(pcs, centerMidi)
  if (voiced.length === 0) return []
  const root = Math.min(...voiced)
  const bass = root - 12
  if (bass >= 21 && !voiced.includes(bass)) return [bass, ...voiced]
  return voiced
}

export function isAuditioning(): boolean {
  return timers.length > 0 || held.length > 0
}

/** 試聴を止める。押さえた鍵はすべて離す。 */
export function stopAudition(): void {
  auditionId += 1
  clearTimers()
  releaseHeld()
}

function pressMidis(midis: number[]): void {
  releaseHeld()
  for (const midi of midis) {
    if (inputRouter.press(midi, 'screen', 96)) held.push(midi)
  }
}

/** 単発の和音プレビュー。レールのセルをダブルクリックしたときなどに使う。 */
export function auditionChord(symbol: string, seconds = 1.1): void {
  stopAudition()
  const myId = auditionId
  const midis = midisForSymbol(symbol)
  if (midis.length === 0) return
  void transport.unlock().then(() => {
    if (myId !== auditionId) return
    pressMidis(midis)
    const t = setTimeout(() => {
      if (myId !== auditionId) return
      releaseHeld()
      clearTimers()
    }, Math.max(200, seconds * 1000))
    timers.push(t)
  })
}

export interface ProgressionOptions {
  /** 各コードの発音秒に掛ける係数。1.0 でコード長ちょうど。 */
  legato?: number
  /** コードが短いときの最低秒。 */
  minSeconds?: number
}

/**
 * コード進行を通しで鳴らす。各コードの拍長を BPM で秒換算する。
 * onChord でレールの追従 (transport.seek) や表示更新ができる。
 */
export function auditionProgression(
  chords: ChordEvent[],
  bpm: number,
  callbacks: {
    onChord?: (chord: ChordEvent, index: number) => void
    onDone?: () => void
  } = {},
  options: ProgressionOptions = {},
): void {
  stopAudition()
  const myId = auditionId
  const usable = chords.filter((c) => c.symbol)
  if (usable.length === 0) {
    callbacks.onDone?.()
    return
  }
  const safeBpm = Math.min(300, Math.max(20, bpm || 100))
  const legato = options.legato ?? 0.92
  const minSeconds = options.minSeconds ?? 0.28

  void transport.unlock().then(() => {
    if (myId !== auditionId) return
    let delayMs = 0
    usable.forEach((chord, index) => {
      const seconds = Math.max(minSeconds, (chord.duration * 60) / safeBpm)
      const holdMs = Math.max(180, seconds * 1000 * legato)
      const midis = midisForSymbol(chord.symbol)
      const t = setTimeout(() => {
        if (myId !== auditionId) return
        pressMidis(midis)
        callbacks.onChord?.(chord, index)
        // 次のコードまで隙間を空けて離す。次の press が来れば二重解放は無害。
        const r = setTimeout(() => {
          if (myId !== auditionId) return
          releaseMidis(midis)
        }, holdMs)
        timers.push(r)
      }, delayMs)
      timers.push(t)
      delayMs += seconds * 1000
    })
    const end = setTimeout(() => {
      if (myId !== auditionId) return
      releaseHeld()
      clearTimers()
      callbacks.onDone?.()
    }, delayMs + 120)
    timers.push(end)
  })
}
