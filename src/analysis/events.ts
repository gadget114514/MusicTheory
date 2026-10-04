/**
 * v0.3 4 章: tonal に転調検出はない。窓のピッチクラスをキー候補と比べ、
 * アプリ側で旗を立てる。音響推定はしない。MIDI とサンプル JSON だけ。
 */
import { Chord } from 'tonal'
import type { ChordEvent, NoteEvent, ScoreEvent, ScoreMeta } from '@/model/types'
import { beatsPerBar, makeId } from '@/model/types'
import {
  chordKey,
  isDiatonicChord,
  isDominantOf,
  isSecondaryDominant,
  makeKeyRef,
  modulationSentence,
  pitchClassOf,
  relatedKeys,
  scaleCoverage,
  type KeyRef,
} from '@/theory'

export interface EventDetectOptions {
  /** この値以上入れば「新しいキーらしい」と見る。 */
  threshold?: number
  /** 現キーよりこれ以上良ければ新しいキーとする。 */
  margin?: number
  /** 新しいキーが何小節続いたら modulation か。 */
  holdBars?: number
  /** 低信頼度の旗は手引きを出さない。 */
  guideConfidence?: number
  /** 2小節窓でメロディ最高音を外すか。 */
  excludeMelody?: boolean
}

/** v0.3 1 章: これより弱い旗は手引きを出さない。レールには残す。 */
export const EVENT_GUIDE_CONFIDENCE = 0.45

/**
 * 検出の既定値。
 *
 * v0.3 6 章の正直な評価: 2 小節ルールだけでは I-V-vi-IV の 2 小節区切りと
 * 本当の転調を区別できない。ここでは取りこぼしと誤検出の両方を避ける側に倒し、
 * 合わなかった手は作者旗で上書きする運用を前提にしている。
 *
 * そのため検出は既定で無効 (autoEvents = false)。
 * v0.3 6 章「先に作者旗。検出は最後」そのまま。
 */
export const DEFAULT_EVENT_OPTIONS: Required<EventDetectOptions> = {
  // 主音が現れ、かつ音と和音がそのキーに合っていれば候補になる。
  threshold: 0.8,
  // 現キーを明確に上回る差がないと「転調ではない」とみなす。
  margin: 0.2,
  holdBars: 2,
  guideConfidence: EVENT_GUIDE_CONFIDENCE,
  excludeMelody: true,
}

interface BarProfile {
  index: number
  start: number
  pitchClasses: string[]
  chords: ChordEvent[]
}

function buildBars(
  notes: NoteEvent[],
  chords: ChordEvent[],
  barBeats: number,
  excludeMelody: boolean,
): BarProfile[] {
  const lastBeat = Math.max(
    notes.reduce((m, n) => Math.max(m, n.time + n.duration), 0),
    chords.reduce((m, c) => Math.max(m, c.time + c.duration), 0),
  )
  const count = Math.max(1, Math.ceil(lastBeat / barBeats))
  const bars: BarProfile[] = []

  for (let i = 0; i < count; i += 1) {
    const start = i * barBeats
    const end = start + barBeats
    const inBar = notes.filter((n) => n.time < end && n.time + n.duration > start)
    let pcs: string[]
    if (excludeMelody && inBar.length > 3) {
      const top = Math.max(...inBar.map((n) => n.midi))
      pcs = [...new Set(inBar.filter((n) => n.midi <= top - 2).map((n) => pitchClassOf(n.midi)))]
    } else {
      pcs = [...new Set(inBar.map((n) => pitchClassOf(n.midi)))]
    }
    bars.push({
      index: i,
      start,
      pitchClasses: pcs,
      chords: chords.filter((c) => c.time < end && c.time + c.duration > start),
    })
  }
  return bars
}

/** 転調が見つかった区間。fromKey はその区間に入る前のキー。 */
interface KeyRun {
  barIndex: number
  key: KeyRef
  fromKey: KeyRef
  length: number
  score: number
}

/**
 * 「1 つ出ただけでキーバッジを変えない」をここで作る。
 *
 * v0.3 4 章的做法:
 *  1. 近親調だけを候補にする (全 24 キーは回さない)
 *  2. 各小節について「新しいキーの方が現キーより明確に合う」小節を拾う
 *  3. 連続した区間をまとめる。2 小節以上なら modulation、1 小節なら tonicization
 *
 * 1 小節だけの vi は「現キーにも合う」ので、単小節のスコア差では
 * vi -> i の共通を見落とす。連続区間を先に取ってから modulation を決める。
 */
function findKeyRuns(
  bars: BarProfile[],
  currentKey: KeyRef,
  options: Required<EventDetectOptions>,
): KeyRun[] {
  /**
 * 1 小節窓がキーを識別できるとは限らない。
 *
 * 例: ハ長調の I である C は、F major の V でもある。pitch class 3 個と
 * ダイアトニック率だけでは「どちらのキーか」が決まらない。
 * そのため検出は「主音が現れて初めて」候補になる。
 */
const scoreFor = (bar: BarProfile, key: KeyRef): number => {
    if (key.pitchClasses.length === 0) return 0
    const symbols = bar.chords.map((c) => c.symbol).filter((s): s is string => !!s)

    // 窓の音と、そのキーのスケールとの一致。
    const coverage = scaleCoverage(bar.pitchClasses, key)

    const diatonicHits = symbols.filter((s) => isDiatonicChord(s, key)).length
    const chordRatio = symbols.length > 0 ? diatonicHits / symbols.length : coverage

    // そのキーの主音が窓に現れているか。これが無いと V と I を区別できない。
    const tonicEvidence = symbols.some((s) => Chord.get(s).tonic === key.tonic) ? 1 : 0

    // 調性 V も出ているなら、そのキーの Grab 内にいる。
    const dominantEvidence = symbols.some((s) => isDominantOf(s, key)) ? 1 : 0

    return coverage * 0.4 + chordRatio * 0.2 + tonicEvidence * 0.25 + dominantEvidence * 0.15
  }

  /** その小節の和音がすべて現キーのダイアトニックなら「度数が鳴っている」だけ。 */
  const isDiatonicBar = (bar: BarProfile, key: KeyRef): boolean => {
    const symbols = bar.chords.map((c) => c.symbol).filter((s): s is string => !!s)
    if (symbols.length === 0) return false
    return symbols.every((s) => isDiatonicChord(s, key))
  }

  const out: KeyRun[] = []
  let i = 0

  while (i < bars.length) {
    // キーが変わったら候補も作り直す。固定のまま回すと平行調へ戻れない。
    const candidates = relatedKeys(currentKey)
    if (candidates.length === 0) break

    // この小節で最も合う近親調と、その適合度。
    let best: { key: KeyRef; score: number } | null = null
    for (const key of candidates) {
      const score = scoreFor(bars[i], key)
      if (!best || score > best.score) best = { key, score }
    }
    if (!best) {
      i += 1
      continue
    }

    // 「新キーが合う」小節だけ拾う。現キーにも同程度に合うものは除く。
    const stayScore = scoreFor(bars[i], currentKey)
    const isShift =
      best.score >= options.threshold && best.score - stayScore >= options.margin

    if (!isShift) {
      i += 1
      continue
    }

    // 現キーのダイアトニックなら 只是そのキーの和音ucherているだけ。
    // I-V-vi-IV の vi で転調旗を立てない。
    // 現キーのダイアトニックな和音は「そのキーの度数が鳴っている」だけなので、
    // 旗を立てない。I-V-vi-IV の vi で転調扱いしない。
    // ここで候補になるのは、Ui/vi の借用か二次ドミナントを含む小節だけ。
    if (isDiatonicBar(bars[i], currentKey)) {
      i += 1
      continue
    }

    // 同じ新キーが続く小節をまとめる。
    // I-V-vi-IV の vi は 1 小節だけ、本当の転調は 2 小節以上続く。
    // この長さの違いが modulation と tonicization の区別になる。
    const key = best.key
    let length = 0
    let total = 0
    for (let j = i; j < bars.length; j += 1) {
      const score = scoreFor(bars[j], key)
      if (score < options.threshold) break
      const stay = scoreFor(bars[j], currentKey)
      if (score - stay < options.margin) break
      length += 1
      total += score
    }

    if (length === 0) {
      i += 1
      continue
    }
    out.push({ barIndex: i, key, fromKey: currentKey, length, score: total / length })
    i += length
    // v0.3 1 章: 1 小節だけの借用ではキーバッジを変えない。
    // holdBars 未満なら現キーのまま続けて探す。
    if (length >= options.holdBars) currentKey = key
  }
  return out
}

/** 境界のコードが両方のダイアトニックに入れば pivot として旗に書く。 */
function findPivot(bars: BarProfile[], barIndex: number, from: KeyRef, to: KeyRef): string | undefined {
  const candidates = [
    ...(bars.find((b) => b.index === barIndex)?.chords ?? []),
    ...(bars.find((b) => b.index === barIndex - 1)?.chords ?? []),
  ]
  for (const chord of candidates) {
    if (!chord.symbol) continue
    if (isDiatonicChord(chord.symbol, from) && isDiatonicChord(chord.symbol, to)) {
      return chord.symbol
    }
  }
  return undefined
}

/**
 * v0.3 1 章: カデンツは「セルの下に短い括弧」程度。Tutorial がそのステップなら止める。
 * 検出は弱く，做到は強くしない。confidence は中程度に留める。
 */
function findCadences(bars: BarProfile[], key: KeyRef): ScoreEvent[] {
  const out: ScoreEvent[] = []
  const tonic = key.triads[0] ?? key.tonic
  const dominant = key.triads[4] ?? ''

  for (let i = 1; i < bars.length; i += 1) {
    const first = bars[i].chords[0]
    if (!first?.symbol) continue
    const prevSymbols = bars[i - 1].chords.map((c) => chordKey(c.symbol))
    const resolvesTonic = chordKey(first.symbol) === chordKey(tonic)
    const fromDominant = dominant ? prevSymbols.includes(chordKey(dominant)) : false
    if (!resolvesTonic || !fromDominant) continue
    out.push({
      id: makeId('ev'),
      time: bars[i].start,
      kind: 'cadence',
      label: `カデンツ (${dominant} → ${first.symbol})`,
      fromKey: key.name,
      toKey: key.name,
      source: 'detected',
      confidence: 0.6,
      memo: '終止。ドミナントから主音へ解決した。',
    })
  }
  return out
}

/** v0.3 1 章: 二次ドミナントはセル上の小さな印。キーバッジは変えない。 */
function findSecondaryDominants(chords: ChordEvent[], key: KeyRef): ScoreEvent[] {
  const out: ScoreEvent[] = []
  for (const chord of chords) {
    if (!chord.symbol || !isSecondaryDominant(chord.symbol, key)) continue
    out.push({
      id: makeId('ev'),
      time: chord.time,
      kind: 'tonicization',
      label: `${chord.symbol} (一時的な借用)`,
      fromKey: key.name,
      toKey: key.name,
      source: 'detected',
      confidence: 0.4,
      memo: 'キーバッジは変えない。旗だけ残す。',
    })
  }
  return out
}

/**
 * 拍子の変化は「セル長が変わる」だけでは決められない。
 * 解析の窓を変えただけで疑似的に変わるため、timeSig が明示されたイベントだけ採用する。
 */
function findMeterEvents(chords: ChordEvent[], meta: ScoreMeta): ScoreEvent[] {
  const declared = chords.filter((c) => c.timeSig !== undefined)
  if (declared.length === 0) return []
  const initial = beatsPerBar(meta.timeSig)
  return declared
    .filter((chord) => chord.timeSig && beatsOfTimeSig(chord.timeSig) !== initial)
    .map((chord) => ({
      id: makeId('ev'),
      time: chord.time,
      kind: 'meter' as const,
      label: `拍子 ${chord.timeSig![0]}/${chord.timeSig![1]}`,
      source: 'detected' as const,
      confidence: 0.5,
      timeSig: chord.timeSig,
      duration: chord.duration,
    }))
}

function beatsOfTimeSig(sig: [number, number]): number {
  return (sig[0] * 4) / sig[1]
}

/** v0.3 4 章の入口。MIDI とサンプル JSON のどちらにも同じ関数を通す。 */
export function detectScoreEvents(
  notes: NoteEvent[],
  chords: ChordEvent[],
  meta: ScoreMeta,
  startKey: KeyRef,
  options: EventDetectOptions = {},
): ScoreEvent[] {
  const opts = { ...DEFAULT_EVENT_OPTIONS, ...options }
  const barBeats = beatsPerBar(meta.timeSig)
  const bars = buildBars(notes, chords, barBeats, opts.excludeMelody)
  const out: ScoreEvent[] = []

  // findKeyRuns 自身がキーを持ち歩くので、starting キーだけ渡せばよい。
  const runs = findKeyRuns(bars, startKey, opts)

  for (const run of runs) {
    // 新しいキーのダイアトニックが2小節以上続いたときだけ転調にする。
    const kind = run.length >= opts.holdBars ? 'modulation' : 'tonicization'
    // この区間に入る前のキー。findKeyRuns が内部で持ち歩いている。
    const from = run.fromKey
    const pivot = kind === 'modulation' ? findPivot(bars, run.barIndex, from, run.key) : undefined
    const sentence = modulationSentence({
      id: 'tmp',
      time: run.barIndex * barBeats,
      kind,
      label: `${from.name} → ${run.key.name}`,
      fromKey: from.name,
      toKey: run.key.name,
      pivot,
      source: 'detected',
      confidence: run.score,
    })
    out.push({
      id: makeId('ev'),
      time: run.barIndex * barBeats,
      kind,
      label: sentence,
      fromKey: from.name,
      toKey: run.key.name,
      pivot,
      source: 'detected',
      confidence: Number(run.score.toFixed(3)),
      duration: barBeats * (kind === 'modulation' ? run.length : 1),
      memo:
        kind === 'modulation'
          ? '転調。キーバッジと度数の点灯が新しいキーへ移る。'
          : '一時的な借用。旗だけ残し、キーは戻す。',
    })
  }

  // 終止と二次ドミナントは、最終的に到達したキーで判定する。
  const finalKey = runs.length > 0 && runs[runs.length - 1].length >= opts.holdBars
    ? runs[runs.length - 1].key
    : startKey

  out.push(...findCadences(bars, finalKey))
  out.push(...findSecondaryDominants(chords, finalKey))
  out.push(...findMeterEvents(chords, meta))
  return out.sort((a, b) => a.time - b.time)
}

export function eventBarIndex(time: number, barBeats: number): number {
  return Math.round(time / barBeats)
}

/** 作者旗を先に置く。同じ小節に推定旗があれば作者旗が勝つ。 */
export function mergeEvents(
  author: ScoreEvent[],
  detected: ScoreEvent[],
  barBeats: number,
): ScoreEvent[] {
  const authorBars = new Set(
    author.filter((e) => e.kind !== 'meter').map((e) => eventBarIndex(e.time, barBeats)),
  )
  const kept = detected.filter((e) => {
    if (e.kind === 'meter') return true
    return !authorBars.has(eventBarIndex(e.time, barBeats))
  })
  return [...author, ...kept].sort((a, b) => a.time - b.time)
}

/** 信頼度が低い旗はレールに残すが、通過時の手引きは出さない。 */
export function shouldGuide(event: ScoreEvent, options: EventDetectOptions = {}): boolean {
  const min = options.guideConfidence ?? EVENT_GUIDE_CONFIDENCE
  return event.confidence >= min
}

/** 推定旗は点線、作者旗は実線。 */
export function eventClassName(event: ScoreEvent): string {
  const weak = event.confidence < EVENT_GUIDE_CONFIDENCE ? ' flag-weak' : ''
  return `flag-${event.kind} flag-${event.source}${weak}`
}

export const EVENT_STRENGTH: Record<ScoreEvent['kind'], 'strong' | 'medium' | 'weak'> = {
  modulation: 'strong',
  cadence: 'medium',
  meter: 'medium',
  author: 'strong',
  tonicization: 'weak',
}

/**
 * 通過時に手引きに出す 1 文。
 * 作者旗は作者の文言をそのまま出す。推定旗は kind ごとに定型にする。
 */
export function eventSentence(event: ScoreEvent): string {
  // 作者が文言を書いているなら、それを最優先する。
  if (event.source === 'author' && event.label) return event.label
  switch (event.kind) {
    case 'modulation':
      return event.label || modulationSentence(event)
    case 'cadence':
      return event.label || '終止。ドミナントから主音へ解決した。'
    case 'meter':
      return `拍子が ${event.label} に変わる。`
    case 'tonicization':
    case 'author':
    default:
      return event.label
  }
}

export function resolveOrMakeKey(keyName: string): KeyRef {
  const match = keyName.match(/^[A-Ga-g][#b]?/)
  const tonic = match ? match[0] : 'C'
  const mode = /minor/i.test(keyName) ? 'minor' : 'major'
  return makeKeyRef(tonic, mode)
}