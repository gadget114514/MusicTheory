/**
 * v0.1 設計 8: シナリオはコードではなくデータ。ランナーだけが共通実装。
 * 介入は 3 つだけ。sample / user で再生エンジンを分岐させない。
 */
import type { MatchState, NoteEvent, ScoreEvent, Step, TutorialScript } from '@/model/types'
import { markTransportOrigin } from '@/engine/audio'
import { inputRouter } from '@/engine/input'
import { player } from '@/engine/player'
import { transport } from '@/engine/transport'
import { useStore } from '@/store/score'
import { eventSentence } from '@/analysis/events'
import {
  chordPitchClasses,
  describeSymbol,
  detectChordSymbols,
  evaluateStep,
  pitchClassOf,
  scalePitchClasses,
} from '@/theory'

const MISS_LIMIT = 3
const AUTO_ADVANCE_MS = 700

/** v0.3 5 章: 作者旗で止める位置。 */
interface Gate {
  event: ScoreEvent
  atBeat: number
}

export class TutorialRunner {
  private script: TutorialScript | null = null
  private index = 0
  private pressed = new Set<number>()
  private state: MatchState = 'idle'
  private misses = 0
  private unsubs: (() => void)[] = []
  private gate: Gate | null = null

  constructor() {
    this.unsubs.push(
      inputRouter.onNoteOn(({ midi }) => {
        this.pressed.add(midi)
        this.onUserInput(midi)
      }),
      inputRouter.onNoteOff(({ midi }) => {
        this.pressed.delete(midi)
      }),
    )
  }

  dispose(): void {
    for (const off of this.unsubs) off()
    this.unsubs = []
  }

  load(script: TutorialScript | null): void {
    this.script = script
    this.index = 0
    this.pressed.clear()
    this.state = 'idle'
    this.misses = 0
    this.gate = null
    const store = useStore.getState()
    store.setAwaitingNext(false)
    store.setStep(0, script?.steps.length ?? 0)
    store.setMatchState('idle')
    this.applyExpectation()
  }

  get currentStep(): Step | null {
    return this.script?.steps[this.index] ?? null
  }

  get isFinished(): boolean {
    return this.script !== null && this.index >= this.script.steps.length
  }

  get gateEvent(): ScoreEvent | null {
    return this.gate?.event ?? null
  }

  /** 「聞く」: サンプルを頭から鳴らす。上のセルと下の鍵が追従する。 */
  async listen(): Promise<void> {
    const step = this.currentStep
    if (!step) return
    const from = step.fromBeat ?? 0
    this.gate = this.findGate(step, from)
    this.setState('listening')
    await this.playSample(step, from)
  }

  /** 「弾く」: サンプルを止め、期待鍵を青緑にする。 */
  tryIt(): void {
    player.stopParts()
    this.gate = null
    useStore.getState().setAwaitingNext(false)
    this.setState('trying')
    this.applyExpectation()
  }

  /** 次へ。旗で停止中なら、まず停止を解除する。 */
  async next(): Promise<void> {
    if (this.isFinished) return
    if (this.gate && !useStore.getState().awaitingNextAtEvent) {
      // まだ停止 하지ずに聞いている状態。ここで「次へ」はそのままステップ送り。
      this.gate = null
      useStore.getState().setAwaitingNext(false)
      this.advance()
      return
    }
    if (useStore.getState().awaitingNextAtEvent) {
      useStore.getState().setAwaitingNext(false)
      const from = (this.gate?.atBeat ?? 0) + 0.01
      this.gate = null
      const step = this.currentStep
      if (step?.sample) {
        this.setState('listening')
        await this.playSample(step, from)
        return
      }
    }
    this.advance()
  }

  /** 選択中のステップのサンプルだけ鳴らす。自動プレイと同じ経路。 */
  private async playSample(step: Step, fromBeat: number): Promise<void> {
    await transport.unlock()
    const notes = step.sample?.notes ?? this.script?.score.notes ?? []
    player.setSampleOnly(true)
    player.load(notes, transport.tempo)
    player.startParts()
    markTransportOrigin()
    transport.seek(fromBeat)
    await transport.play()
  }

  private advance(): void {
    if (!this.script) return
    this.index += 1
    this.misses = 0
    this.pressed.clear()
    this.gate = null
    const store = useStore.getState()
    store.setAwaitingNext(false)
    store.setStep(Math.min(this.index, this.script.steps.length), this.script.steps.length)
    if (this.isFinished) {
      this.setState('matched')
      store.setExpectedPitchClasses([])
      store.setGuideLine({
        text: 'おつかれさま。最後まで終えた。',
        tone: 'good',
        bornAt: performance.now(),
      })
      player.stopParts()
      transport.stop()
      return
    }
    this.setState('idle')
    this.applyExpectation()
    const next = this.currentStep
    if (next?.sample) void this.playSample(next, next.fromBeat ?? 0)
  }

  /** v0.1 設計 8 の介入 1: サンプル再生中に NoteOn したら sample Part を stop し、用户音優先。 */
  private onUserInput(midi: number): void {
    const step = this.currentStep
    if (!step) return

    if (this.state === 'listening') {
      if (step.pauseSampleOnInput) {
        player.stopParts()
        this.setState('trying')
        this.applyExpectation()
      }
    }

    if (step.expect.kind === 'listen') return

    const pitchClasses = this.pressedPitchClasses()
    const candidates = detectChordSymbols(pitchClasses, { key: useStore.getState().displayKey })
    const result = evaluateStep(step, { pitchClasses, candidates })

    if (!result.matched) {
      this.registerMiss(midi)
      return
    }

    this.setState('matched')
    useStore.getState().setGuideLine({
      text: result.inversionMatched ? '一致（転回形）。次は根音で。' : '一致。次のステップへ。',
      tone: 'good',
      bornAt: performance.now(),
    })
    if (step.advanceOn === 'match') {
      window.setTimeout(() => {
        void this.next()
      }, AUTO_ADVANCE_MS)
    }
  }

  private registerMiss(midi: number): void {
    const store = useStore.getState()
    const step = this.currentStep
    const pressing = this.pressed.size > 1
    store.flashWrong(pressing ? [...this.pressed] : [midi])
    this.misses += 1
    store.bumpMiss()
    if (!step) return
    const nudge = step.nudge ?? `次は ${describeExpectation(step)} の鍵だけ。`
    store.setGuideLine({
      text: this.misses >= MISS_LIMIT ? `${nudge} まず「聞く」を。` : nudge,
      tone: 'bad',
      bornAt: performance.now(),
    })
  }

  private pressedPitchClasses(): string[] {
    const out: string[] = []
    for (const midi of this.pressed) {
      const pc = pitchClassOf(midi)
      if (!out.includes(pc)) out.push(pc)
    }
    return out
  }

  /** 期待鍵の青緑はここで決める。拍では変えない。 */
  private applyExpectation(): void {
    const store = useStore.getState()
    const step = this.currentStep
    store.setExpectedPitchClasses(step ? expectedPitchClassesFor(step) : [])
    if (step) {
      store.setGuideLine({ text: step.prompt, tone: 'info', bornAt: performance.now() })
    }
  }

  /**
   * v0.3 5 章: 作者旗はステップに紐づけられる。
   * stopAtBeat が指定されていれば「その拍の旗」だけに-DFEし、無ければ
   * 「それより後の一本」に fallback する。stopAtBeat 指定があるのに
   * 該当が無い場合は停止しない。
   */
  private findGate(step: Step, fromBeat: number): Gate | null {
    const stopping = useStore.getState().score.events.filter((e) => e.pauseOnPass)
    if (stopping.length === 0) return null
    const target = step.stopAtBeat
    if (target !== undefined) {
      const exact = stopping.find((e) => Math.abs(e.time - target) < 1e-6)
      return exact ? { event: exact, atBeat: exact.time } : null
    }
    const after = stopping.find((e) => e.time > fromBeat)
    return after ? { event: after, atBeat: after.time } : null
  }

  /** 再生ヘッドが作者旗の拍に来た瞬間。App の rAF から呼ばれる。 */
  notifyEventPass(event: ScoreEvent): void {
    if (!this.gate || this.gate.event.id !== event.id) return
    transport.pause()
    player.stopParts()
    useStore.getState().setAwaitingNext(true)
    this.setState('trying')
    useStore.getState().setGuideLine({
      text: `${eventSentence(event)} 「次へ」で先に進む。`,
      tone: 'info',
      bornAt: performance.now(),
      key: event.id,
    })
  }

  private setState(next: MatchState): void {
    this.state = next
    useStore.getState().setMatchState(next)
  }
}

export function expectedPitchClassesFor(step: Step): string[] {
  switch (step.expect.kind) {
    case 'notes':
      return step.expect.pitchClasses
    case 'chord':
      return chordPitchClasses(step.expect.symbol)
    case 'inScale':
      return scalePitchClasses(step.expect.scale)
    case 'listen':
    default:
      return []
  }
}

export function describeExpectation(step: Step): string {
  switch (step.expect.kind) {
    case 'notes':
      return step.expect.pitchClasses.join(' ')
    case 'chord':
      return describeSymbol(step.expect.symbol)
    case 'inScale':
      return step.expect.scale
    case 'listen':
    default:
      return 'なし'
  }
}

export function sampleNotesOf(step: Step): NoteEvent[] {
  return step.sample?.notes ?? []
}

export const tutorialRunner = new TutorialRunner()

/** v0.2 5 章: 手引きの 3 状態。 */
export function listeningLabel(state: MatchState): string {
  switch (state) {
    case 'listening':
      return '聞いている'
    case 'trying':
      return '弾いている'
    case 'matched':
      return '一致'
    case 'missed':
      return '不一致'
    default:
      return '準備'
  }
}