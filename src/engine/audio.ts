/**
 * v0.1 設計 7.3 / 7.4: 再生と録音はどちらも同じ NoteEvent を通す。
 * 音源はこの 1 つだけ。sample と user で別のシンセは持たない。
 */
import * as Tone from 'tone'
import type { NoteEvent } from '@/model/types'
import { transport } from './transport'

let master: Tone.Volume | null = null
let synth: Tone.PolySynth<Tone.Synth> | null = null
let clickSynth: Tone.Synth | null = null
let metronomeLoop: Tone.Loop | null = null
let metronomeOn = false

function ensureGraph(): void {
  if (master && synth) return
  master = new Tone.Volume(-4).toDestination()
  synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle8' },
    envelope: { attack: 0.008, decay: 0.22, sustain: 0.35, release: 0.5 },
  })
  synth.volume.value = -6
  synth.connect(master)
}

function ensureClickGraph(): void {
  if (clickSynth) return
  ensureGraph()
  clickSynth = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
  })
  clickSynth.volume.value = -18
  clickSynth.connect(master!)
}

export function velocityToGain(velocity: number): number {
  return Math.min(1, Math.max(0.05, velocity / 127))
}

/** 押鍵。即時に鳴らす。 */
export function noteOn(midi: number, velocity = 100): void {
  ensureGraph()
  synth!.triggerAttack(midiToFreq(midi), undefined, velocityToGain(velocity))
}

export function noteOff(midi: number): void {
  if (!synth) return
  try {
    synth!.triggerRelease(midiToFreq(midi))
  } catch {
    // 既に解放済み
  }
}

export function allNotesOff(): void {
  if (!synth) return
  synth!.releaseAll()
}

/** Part からの鳴らし方。時刻は Tone の秒。 */
export function playNoteAt(
  midi: number,
  velocity: number,
  time: Tone.Unit.Time,
  durationSeconds: number,
): void {
  ensureGraph()
  const dur = Math.max(0.05, durationSeconds)
  synth!.triggerAttackRelease(midiToFreq(midi), dur, time, velocityToGain(velocity))
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function setMasterVolume(db: number): void {
  ensureGraph()
  master!.volume.rampTo(db, 0.1)
}

export function setMetronome(on: boolean): void {
  metronomeOn = on
  if (on) {
    ensureClickGraph()
    if (!metronomeLoop) {
      metronomeLoop = new Tone.Loop((time) => {
        if (!metronomeOn) return
        clickSynth!.triggerAttackRelease('C6', 0.03, time, 0.5)
      }, '4n')
      metronomeLoop.start(0)
    }
    return
  }
  if (metronomeLoop) {
    metronomeLoop.stop()
    metronomeLoop.dispose()
    metronomeLoop = null
  }
}

export function isMetronomeOn(): boolean {
  return metronomeOn
}

/** 録音の原点。AudioContext の時刻で持つので、Transport が止まっていてもbeats が出る。 */
export function nowSeconds(): number {
  return Tone.now()
}

export function beatNow(): number {
  return transport.secondsToBeat(Tone.now() - startContextTime)
}

let startContextTime = 0

/** 再生開始の瞬間に基準時刻を撮る。 */
export function markTransportOrigin(): void {
  startContextTime = Tone.now() - transport.beatToSeconds(transport.beat)
}

/** 現在の拍位置を AudioContext の時刻から逆算する。 */
export function beatFromContextTime(contextTime: number): number {
  return transport.secondsToBeat(contextTime - startContextTime)
}

/** 画面上の NoteEvent を鳴らすときに使う。 */
export function eventsToSeconds(
  notes: NoteEvent[],
  bpm: number,
): { midi: number; velocity: number; time: number; duration: number }[] {
  return notes.map((n) => ({
    midi: n.midi,
    velocity: n.velocity,
    time: (n.time * 60) / bpm,
    duration: Math.max(0.05, (n.duration * 60) / bpm),
  }))
}