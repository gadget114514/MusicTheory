/**
 * v0.1 設計 9.1: MIDI を窓切りし Chord.detect する。
 * 難しいのは検出関数ではなく、どの音を 1 つのコードとみなすかの窓切りである。
 */
import { Midi } from '@tonejs/midi'
import type { ChordEvent, NoteEvent, ScoreMeta } from '@/model/types'
import { beatsPerBar, makeId } from '@/model/types'
import {
  detectChordSymbols,
  makeKeyRef,
  normalizeChord,
  pitchClassOf,
  resolveKey,
  romanNumeral,
  scaleCoverage,
  type KeyRef,
} from '@/theory'

export interface AnalyzeOptions {
  /** 既定は 1 小節。v0.1 設計 12 章: 最初は 1 小節固定でよい。 */
  windowBeats?: number
  /** 窓の何 % 以上鳴っている音を残すか。既定 0.3。 */
  sustainRatio?: number
  /** 一番高い音をメロディ候補として外すか。 */
  excludeMelody?: boolean
  /** 外す音の個数。 */
  melodyCount?: number
  /** 空なら完全五度を仮定して試すか。 */
  assumePerfectFifth?: boolean
  /** ユーザー指定のキー。あれば推定より優先。 */
  keyHint?: string | null
}

export const DEFAULT_ANALYZE: Required<Omit<AnalyzeOptions, 'keyHint'>> = {
  windowBeats: 0, // 0 は小節長から決める
  sustainRatio: 0.3,
  excludeMelody: true,
  melodyCount: 1,
  assumePerfectFifth: true,
}

/** ticks は 4 分音符を 1 拍に直す。 */
export function midiToNotes(midi: Midi, trackIndex = 0): NoteEvent[] {
  const track = midi.tracks[trackIndex]
  if (!track) return []
  const ppq = midi.header.ppq || 480
  const out: NoteEvent[] = []
  for (const note of track.notes) {
    const start = note.ticks / ppq
    const duration = Math.max(0.05, note.durationTicks / ppq)
    out.push({
      id: makeId('n'),
      time: start,
      duration,
      midi: note.midi,
      velocity: note.velocity,
      source: 'import',
    })
  }
  return out.sort((a, b) => a.time - b.time)
}

export function readMidiBytes(data: Uint8Array): { midi: Midi; header: Midi['header'] } {
  const arrayBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer
  const midi = new Midi(arrayBuffer)
  return { midi, header: midi.header }
}

export function trackSummaries(midi: Midi): { index: number; name: string; notes: number }[] {
  return midi.tracks.map((track, index) => ({
    index,
    name: track.name || `Track ${index + 1}`,
    notes: track.notes.length,
  }))
}

/** 先頭小節の音からキーを仮置きする。 */
export function estimateKey(
  notes: NoteEvent[],
  options: { fromBeat?: number; toBeat?: number } = {},
): KeyRef | null {
  const from = options.fromBeat ?? 0
  const to = options.toBeat ?? Infinity
  const histogram = new Map<string, number>()
  let total = 0
  for (const note of notes) {
    if (note.time < from || note.time >= to) continue
    // 長さの偏见を避けるため、音的长度で重み付けはしない。拍数だけ数える。
    const pc = pitchClassOf(note.midi)
    histogram.set(pc, (histogram.get(pc) ?? 0) + 1)
    total += 1
  }
  if (total === 0) return null

  const pcs = [...histogram.keys()]
  let best: { key: KeyRef; score: number } | null = null
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const name = noteNameFromChroma(tonic)
    for (const mode of ['major', 'minor'] as const) {
      const key = makeKeyRef(name, mode)
      if (key.pitchClasses.length === 0) continue
      const coverage = scaleCoverage(pcs, key)
      // 主音が強く出ているキーを少し優先。
      const tonicShare = (histogram.get(name) ?? 0) / total
      const score = coverage + tonicShare * 0.35
      if (!best || score > best.score) best = { key, score }
    }
  }
  return best?.key ?? null
}

function noteNameFromChroma(chroma: number): string {
  const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
  return names[((chroma % 12) + 12) % 12]
}

export interface AnalysisResult {
  chords: ChordEvent[]
  key: KeyRef | null
}

/** v0.1 設計 9.1 の窓切り。1 窓 = 1 セル。 */
export function analyzeNotes(
  notes: NoteEvent[],
  meta: ScoreMeta,
  options: AnalyzeOptions = {},
): AnalysisResult {
  const barBeats = beatsPerBar(meta.timeSig)
  const windowBeats = options.windowBeats && options.windowBeats > 0 ? options.windowBeats : barBeats
  const sustainRatio = options.sustainRatio ?? DEFAULT_ANALYZE.sustainRatio
  const excludeMelody = options.excludeMelody ?? true
  const melodyCount = options.melodyCount ?? DEFAULT_ANALYZE.melodyCount
  const assumePerfectFifth = options.assumePerfectFifth ?? true

  const key =
    (options.keyHint ? resolveKey(options.keyHint) : null) ??
    estimateKey(notes, { toBeat: barBeats * 4 })

  const chords: ChordEvent[] = []
  if (notes.length === 0) return { chords, key }

  const lastBeat = notes.reduce((max, n) => Math.max(max, n.time + n.duration), 0)
  const windows = Math.max(1, Math.ceil(lastBeat / windowBeats))

  // 解析窓が宣言する拍子。既定は meta のもの。
  const currentTimeSig: [number, number] = meta.timeSig

  for (let w = 0; w < windows; w += 1) {
    const start = w * windowBeats
    const end = start + windowBeats

    // 窓が重なる音を、それだけ重なった長さで集める。
    const inWindow = notes
      .map((note) => ({
        note,
        overlap: Math.min(note.time + note.duration, end) - Math.max(note.time, start),
      }))
      .filter((x) => x.overlap > 0 && x.overlap >= windowBeats * sustainRatio)

    // まず窓全体を Chord.detect にかける。
    // 決まらなければ「高い音をメロディと仮定して外す」ことを試す。
    let considered = inWindow
    let candidates = detectChordSymbols(pcsOf(inWindow), { assumePerfectFifth, key })

    if (candidates.length === 0 && excludeMelody && inWindow.length > melodyCount + 1) {
      considered = dropMelody(inWindow, melodyCount)
      candidates = detectChordSymbols(pcsOf(considered), { assumePerfectFifth, key })
    }

    const pcs = pcsOf(considered)
    const symbol = candidates[0] ?? ''

    // 候補が多いほど信頼度は落とす。候補は隠さないが、旗の演出には使う。
    const ambiguity = Math.min(0.4, Math.max(0, candidates.length - 1) * 0.1)
    const confidence =
      symbol === ''
        ? 0
        : Math.max(
            0.1,
            Math.min(1, (0.55 + 0.45 * (pcs.length >= 3 ? 1 : pcs.length / 3)) - ambiguity),
          )

    chords.push({
      id: makeId('c'),
      time: start,
      duration: windowBeats,
      symbol,
      candidates,
      roman: romanNumeral(symbol, key),
      confidence: Number(confidence.toFixed(3)),
      windowTime: start,
      windowDuration: windowBeats,
      // MIDI が拍子変更を宣言していた場合だけ。这里 differs from meta。
      ...(currentTimeSig[0] !== meta.timeSig[0] || currentTimeSig[1] !== meta.timeSig[1]
        ? { timeSig: currentTimeSig }
        : {}),
    })
  }

  // v0.2 3.1: 1 セル = 1 ChordEvent。解析の窓と表示の窓を同じにする。
  // 窓をまたいで続いているコードは表示側 (ChordRail) が折り返す。
  return { chords, key }
}

interface WindowNote {
  note: NoteEvent
  overlap: number
}

function pcsOf(list: readonly WindowNote[]): string[] {
  const out: string[] = []
  for (const item of list) {
    const pc = pitchClassOf(item.note.midi)
    if (!out.includes(pc)) out.push(pc)
  }
  return out
}

/**
 * 高い方から count 個の音だけ落とす。纯粹に「一番上をaneityとみなす」。
 * コードの構成音を根から全部落とすのは避けていない。
 */
function dropMelody(list: readonly WindowNote[], count: number): WindowNote[] {
  const sorted = [...list].sort((a, b) => b.note.midi - a.note.midi)
  const drop = new Set<number>()
  let dropped = 0
  for (const item of sorted) {
    if (dropped >= count) break
    if (drop.has(item.note.midi)) continue
    drop.add(item.note.midi)
    dropped += 1
  }
  return list.filter((item) => !drop.has(item.note.midi))
}

/** v0.2 3.1: クリックでシークする拍を返す。セル境界を丸める役。 */
export function seekTargetOf(chords: ChordEvent[], beat: number): number {
  let best = 0
  for (const chord of chords) {
    if (chord.time <= beat + 1e-6) best = chord.time
    else break
  }
  return best
}

/** v0.1 設計 6: 解析画面でも DOM には 「今どの窓か」だけを書く。 */
/** 拍が属するセルの index。範囲外は -1。 */
export function chordIndexAt(chords: ChordEvent[], beat: number): number {
  for (let i = 0; i < chords.length; i += 1) {
    const c = chords[i]
    if (beat >= c.time && beat < c.time + c.duration) return i
  }
  return -1
}

/** 解析結果からキーを表示名だけ取り出す。 */
export function keyLabel(key: KeyRef | null, fallback: ScoreMeta): string {
  return key?.name ?? `${fallback.tonic} ${fallback.scale}`
}

/** 二つのコードが同じかどうか（転回を無視）。 */
export function sameChord(a: string, b: string): boolean {
  return normalizeChord(a) === normalizeChord(b)
}