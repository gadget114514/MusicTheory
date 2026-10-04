/**
 * v0.1 設計 4.3: ScoreStore は単一の ScoreDocument (Zustand)。
 * Transport と Tutorial が同じストアを購読する。
 *
 * v0.2 6 章: playheadBeat はここに入れない。拍は Tone.Transport だけが作る。
 */
import { create } from 'zustand'
import type {
  AppMode,
  ChordEvent,
  MatchState,
  Quantize,
  ScoreDocument,
  ScoreEvent,
  UpperView,
} from '@/model/types'
import { createEmptyScore, makeId } from '@/model/types'
import type { KeyRef } from '@/theory'
import { makeKeyRef, pitchClassOf } from '@/theory'

export interface GuideLine {
  text: string
  tone: 'info' | 'good' | 'bad'
  /** 拍-independent。経過時間だけで消える。 */
  bornAt: number
  key?: string
}

export interface AnalyzeSettings {
  windowBeats: number
  sustainRatio: number
  excludeMelody: boolean
  assumePerfectFifth: boolean
  keyHint: string
  /**
   * 転調旗の自動推定。
   * v0.3 6 章「検出は最後」のとおり既定は無効。
   * 検出出来的なものは作者旗で上書きする前提。
   */
  autoEvents: boolean
}

export interface AppState {
  mode: AppMode
  score: ScoreDocument
  projectName: string | null
  filePath: string | null
  dirty: boolean

  /** 押鍵 + 再生中の Part。拍ではなく音符イベントでだけ変わる。 */
  activeMidis: number[]
  /** 今押しているelján。判定と点灯に使う。 */
  pressedMidis: number[]
  /** Tutorial の現在のステップが期待するピッチクラス。無ければ現在コードの構成音。 */
  expectedPitchClasses: string[]
  /** 手引きに出す 1 行。拍では変えない。 */
  guideLine: GuideLine | null
  matchState: MatchState
  stepIndex: number
  stepTotal: number
  missCount: number
  /** 再生中の旗の案内中か。 */
  awaitingNextAtEvent: boolean

  /** v0.3: 上バーのキーバッジ。旗を通過すると変わる。 */
  displayKey: KeyRef
  /** 旧主音の残光。1 小節で消える。 */
  afterglowPitchClass: string | null
  afterglowUntilBeat: number
  /** v0.2: 期待と違う押鍵。200ms で消す。 */
  wrongMidis: number[]
  wrongStamp: Record<number, number>

  recording: boolean
  quantize: Quantize
  metronome: boolean

  guideOpen: boolean
  upperView: UpperView
  seekLocked: boolean
  railZoom: number

  analyze: AnalyzeSettings
  status: string | null
  midiDevices: string[]
  midiStatus: string
  runtimeLabel: string
}

export interface AppActions {
  setMode(mode: AppMode): void
  setScore(score: ScoreDocument, name?: string | null, path?: string | null): void
  patchMeta(patch: Partial<ScoreDocument['meta']>): void
  setBpm(bpm: number): void
  setProjectName(name: string | null): void
  setFilePath(path: string | null): void
  markClean(): void

  setPressedMidis(midis: number[]): void
  setActiveMidis(midis: number[]): void
  setExpectedPitchClasses(pcs: string[]): void
  flashWrong(midis: number[]): void
  clearWrong(): void

  setGuideLine(line: GuideLine | null): void
  setMatchState(state: MatchState): void
  setStep(index: number, total: number): void
  bumpMiss(): void
  setAwaitingNext(value: boolean): void

  setDisplayKey(key: KeyRef): void
  setAfterglow(pc: string | null, untilBeat: number): void

  setRecording(value: boolean): void
  setQuantize(value: Quantize): void
  setMetronome(value: boolean): void

  toggleGuide(): void
  setUpperView(view: UpperView): void
  setSeekLocked(value: boolean): void
  setRailZoom(value: number): void

  patchAnalyze(patch: Partial<AnalyzeSettings>): void
  setStatus(message: string | null): void
  setMidiInfo(status: string, devices: string[]): void
  setRuntimeLabel(label: string): void

  addNotes(notes: ScoreDocument['notes']): void
  replaceNotes(notes: ScoreDocument['notes']): void
  clearUserNotes(): void
  setChords(chords: ChordEvent[]): void
  updateChord(id: string, patch: Partial<ChordEvent>): void
  selectChordSymbol(id: string, symbol: string): void
  setEvents(events: ScoreEvent[]): void
  updateEvent(id: string, patch: Partial<ScoreEvent>): void
  removeEvent(id: string): void
}

function initialKey(): KeyRef {
  return makeKeyRef('C', 'major')
}

export const useStore = create<AppState & AppActions>((set) => ({
  mode: 'play',
  score: createEmptyScore(),
  projectName: null,
  filePath: null,
  dirty: false,

  activeMidis: [],
  pressedMidis: [],
  expectedPitchClasses: [],
  guideLine: null,
  matchState: 'idle',
  stepIndex: 0,
  stepTotal: 0,
  missCount: 0,
  awaitingNextAtEvent: false,

  displayKey: initialKey(),
  afterglowPitchClass: null,
  afterglowUntilBeat: 0,
  wrongMidis: [],
  wrongStamp: {},

  recording: false,
  quantize: 'off',
  metronome: false,

  guideOpen: true,
  upperView: 'chords',
  seekLocked: false,
  railZoom: 56,

  analyze: {
    windowBeats: 0,
    sustainRatio: 0.3,
    excludeMelody: true,
    assumePerfectFifth: true,
    keyHint: '',
    autoEvents: false,
  },
  status: null,
  midiDevices: [],
  midiStatus: '未要求',
  runtimeLabel: '...',

  setMode: (mode) => set({ mode, recording: false }),
  setScore: (score, name = null, path = null) =>
    set((state) => ({
      score,
      projectName: name ?? state.projectName,
      filePath: path ?? null,
      dirty: false,
      pressedMidis: [],
      activeMidis: [],
      expectedPitchClasses: [],
      matchState: 'idle',
      stepIndex: 0,
      stepTotal: score.tutorial?.steps.length ?? 0,
      displayKey: makeKeyRef(score.meta.tonic, score.meta.scale === 'minor' ? 'minor' : 'major'),
      afterglowPitchClass: null,
      wrongMidis: [],
      wrongStamp: {},
      recording: false,
    })),
  patchMeta: (patch) =>
    set((state) => ({ score: { ...state.score, meta: { ...state.score.meta, ...patch } }, dirty: true })),
  setBpm: (bpm) =>
    set((state) => ({ score: { ...state.score, meta: { ...state.score.meta, bpm } }, dirty: true })),
  setProjectName: (projectName) => set({ projectName, dirty: true }),
  setFilePath: (filePath) => set({ filePath }),
  markClean: () => set({ dirty: false }),

  setPressedMidis: (pressedMidis) => set({ pressedMidis }),
  setActiveMidis: (activeMidis) => set({ activeMidis }),
  setExpectedPitchClasses: (expectedPitchClasses) => set({ expectedPitchClasses }),
  flashWrong: (mids) =>
    set((state) => {
      const stamp = { ...state.wrongStamp }
      const now = performance.now()
      for (const midi of mids) stamp[midi] = now
      return { wrongMidis: mids, wrongStamp: stamp }
    }),
  clearWrong: () => set({ wrongMidis: [], wrongStamp: {} }),

  setGuideLine: (guideLine) => set({ guideLine }),
  setMatchState: (matchState) => set({ matchState }),
  setStep: (stepIndex, stepTotal) => set({ stepIndex, stepTotal, missCount: 0 }),
  bumpMiss: () => set((state) => ({ missCount: state.missCount + 1 })),
  setAwaitingNext: (awaitingNextAtEvent) => set({ awaitingNextAtEvent }),

  setDisplayKey: (displayKey) => set({ displayKey }),
  setAfterglow: (afterglowPitchClass, afterglowUntilBeat) =>
    set({ afterglowPitchClass, afterglowUntilBeat }),

  setRecording: (recording) => set({ recording }),
  setQuantize: (quantize) => set({ quantize }),
  setMetronome: (metronome) => set({ metronome }),

  toggleGuide: () => set((state) => ({ guideOpen: !state.guideOpen })),
  setUpperView: (upperView) => set({ upperView }),
  setSeekLocked: (seekLocked) => set({ seekLocked }),
  setRailZoom: (railZoom) => set({ railZoom }),

  patchAnalyze: (patch) => set((state) => ({ analyze: { ...state.analyze, ...patch } })),
  setStatus: (status) => set({ status }),
  setMidiInfo: (midiStatus, midiDevices) => set({ midiStatus, midiDevices }),
  setRuntimeLabel: (runtimeLabel) => set({ runtimeLabel }),

  addNotes: (notes) =>
    set((state) => ({
      score: { ...state.score, notes: [...state.score.notes, ...notes] },
      dirty: true,
    })),
  replaceNotes: (notes) => set((state) => ({ score: { ...state.score, notes }, dirty: true })),
  clearUserNotes: () =>
    set((state) => ({
      score: { ...state.score, notes: state.score.notes.filter((n) => n.source !== 'user') },
      dirty: true,
    })),
  setChords: (chords) => set((state) => ({ score: { ...state.score, chords }, dirty: true })),
  updateChord: (id, patch) =>
    set((state) => ({
      score: {
        ...state.score,
        chords: state.score.chords.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
      dirty: true,
    })),
  selectChordSymbol: (id, symbol) =>
    set((state) => ({
      score: {
        ...state.score,
        chords: state.score.chords.map((c) =>
          c.id === id
            ? { ...c, symbol, candidates: [symbol, ...c.candidates.filter((x) => x !== symbol)] }
            : c,
        ),
      },
      dirty: true,
    })),
  setEvents: (events) => set((state) => ({ score: { ...state.score, events }, dirty: true })),
  updateEvent: (id, patch) =>
    set((state) => ({
      score: {
        ...state.score,
        events: state.score.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      },
      dirty: true,
    })),
  removeEvent: (id) =>
    set((state) => ({
      score: { ...state.score, events: state.score.events.filter((e) => e.id !== id) },
      dirty: true,
    })),
}))

/** 判定に使う、押している鍵のピッチクラス。 */
export function pressedPitchClasses(midis: number[]): string[] {
  const out: string[] = []
  for (const midi of midis) {
    const pc = pitchClassOf(midi)
    if (!out.includes(pc)) out.push(pc)
  }
  return out
}

export function newChordEvent(time: number, duration: number, symbol = ''): ChordEvent {
  return {
    id: makeId('c'),
    time,
    duration,
    symbol,
    candidates: symbol ? [symbol] : [],
    confidence: symbol ? 1 : 0,
  }
}