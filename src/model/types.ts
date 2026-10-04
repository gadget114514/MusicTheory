/**
 * v0.1 設計 5: 保存単位は ScoreDocument。
 * 時間の正は拍 (beat) である。BPM を変えてもイベントを書き換えない。
 */

export type NoteSource = 'user' | 'sample' | 'import'

export interface NoteEvent {
  id: string
  /** 拍。秒ではない。 */
  time: number
  /** 拍。 */
  duration: number
  midi: number
  velocity: number
  source: NoteSource
}

/** v0.1 設計 7.2 / v0.2 3.1: コードレール 1 セル = 1 ChordEvent。 */
export interface ChordEvent {
  id: string
  /** 拍 */
  time: number
  /** 拍 */
  duration: number
  /** tonal が返す "Cmaj7" など */
  symbol: string
  /** 複数候補。隠さない。 */
  candidates: string[]
  roman?: string
  confidence: number
  /** 解析窓の位置。推定値から手動で選び直したときの復元に使う。 */
  windowTime?: number
  windowDuration?: number
  /** 解析窓 itself が宣言していた拍子。拍子変化の旗に使う。 */
  timeSig?: [number, number]
}

/** v0.3: 転調・借用・終止などの「出来事」。コードでもノートでもない第三のデータ。 */
export type ScoreEventKind =
  | 'modulation'
  | 'tonicization'
  | 'cadence'
  | 'meter'
  | 'author'

export interface ScoreEvent {
  id: string
  /** 拍 */
  time: number
  kind: ScoreEventKind
  label: string
  fromKey?: string
  toKey?: string
  /** 共通コードのシンボル */
  pivot?: string
  /** 推定旗は点線、作者旗は実線。 */
  source: 'detected' | 'author'
  confidence: number
  /** 拍つき。旗の幅になる。省略時は 0（縦線のみ）。 */
  duration?: number
  /** meter イベント用 */
  timeSig?: [number, number]
  /** 設定すれば、この旗で Transport を止める。 */
  pauseOnPass?: boolean
  /** 確認演出（v0.3 4 章） */
  memo?: string
}

export interface ScoreMeta {
  title: string
  tonic: string
  scale: string
  bpm: number
  timeSig: [number, number]
}

export interface ScoreDocument {
  version: 1
  meta: ScoreMeta
  /** ユーザー演奏、自動プレイ、サンプルが共存する。 */
  notes: NoteEvent[]
  /** 手入力または解析結果。 */
  chords: ChordEvent[]
  /** v0.3 で追加。 */
  events: ScoreEvent[]
  tutorial?: TutorialScript
}

/** v0.1 設計 8: シナリオはコードではなくデータ。 */
export type Expect =
  | { kind: 'notes'; pitchClasses: string[] }
  | { kind: 'chord'; symbol: string }
  | { kind: 'inScale'; scale: string }
  | { kind: 'listen' }

export interface Step {
  id: string
  prompt: string
  expect: Expect
  /** 模範。自動プレイと同じ再生経路 (NoteEvent[]) を通す。 */
  sample?: { notes: NoteEvent[] }
  /** ユーザーが弾いたらサンプルを止める。 */
  pauseSampleOnInput: boolean
  advanceOn: 'match' | 'manual'
  /** 「聞く」で頭から鳴らす拍位置。省略時は現在のNash位置。 */
  fromBeat?: number
  /** この拍でTransport を止める（旗と連動させるため）。 */
  stopAtBeat?: number
  /** 外したときの短い注意書き。 */
  nudge?: string
}

export interface TutorialScript {
  id: string
  title: string
  /** 開始トニック。例: "C" */
  tonic: string
  /** 表示用の開始キー。例: "C major" */
  keyName: string
  /** レッスン全体の伴奏。コードレールと旗はここから出る。 */
  score: {
    meta: ScoreMeta
    notes: NoteEvent[]
    chords: ChordEvent[]
    events: ScoreEvent[]
  }
  steps: Step[]
}

/** v0.2 5 章: 手引き欄の状態。拍では変えず、判定と操作だけで変わる。 */
export type MatchState = 'idle' | 'listening' | 'trying' | 'matched' | 'missed'

export type AppMode = 'tutorial' | 'play' | 'record' | 'analyze'

export type Quantize = 'off' | '1/8' | '1/16'

export type UpperView = 'chords' | 'chords+staff' | 'staff'

export const DEFAULT_TIME_SIG: [number, number] = [4, 4]

let counter = 0
export function makeId(prefix: string): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`
}

/** 拍/小節の換算。4 分の 4 拍を 4 拍とする、4 分音符単位の拍。 */
export function beatsPerBar(timeSig: [number, number] = DEFAULT_TIME_SIG): number {
  return (timeSig[0] * 4) / timeSig[1]
}

export function createEmptyScore(meta?: Partial<ScoreMeta>): ScoreDocument {
  return {
    version: 1,
    meta: {
      title: '無題',
      tonic: 'C',
      scale: 'major',
      bpm: 100,
      timeSig: [...DEFAULT_TIME_SIG],
      ...meta,
    },
    notes: [],
    chords: [],
    events: [],
  }
}