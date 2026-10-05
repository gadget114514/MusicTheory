/**
 * v0.1 設計 10: tonal は音を出さない、Tone.js はコード名を知らない。
 * この境界を崩さない。tonal の純関数を包むだけにして、
 * 「候補の順位」と「一致判定」だけをアプリ側で持つ。
 *
 * 実際に tonal 6 の返り値を確認して決めた箇所_visually_:
 *  - Chord.get(x).name は "C major seventh" のような長い英語名。識別子には使わない。
 *  - Chord.get(x).bass / root は 根音位置なら空文字。
 *  - Pcset.chroma() は「文字列」で返る。配列ではない。
 *  - Key.majorKey().chords は 7th、.triads が三和音。
 */
import { Chord, Key, Note, Pcset } from 'tonal'
import type { ScoreEvent, Step } from '@/model/types'

/** tonal の KeyChord。tonal 6 の barrel から型が消えているので自前で持つ。 */
interface KeyChordEntry {
  name: string
  roles: string[]
}

export type KeyMode = 'major' | 'minor'

export interface KeyRef {
  /** "C major" のような表示名 */
  name: string
  tonic: string
  mode: KeyMode
  /** スケール音。ピッチクラス名の配列。 */
  pitchClasses: string[]
  /** ダイアトニック三和音。I-V-... の順に並ぶ。 */
  triads: string[]
  /** ダイアトニックの 7th。substitute / secondary の判定に使う。 */
  chords: string[]
  /** 属和音 ("G")。二次ドミナントの除外に使う。 */
  dominantRoot: string
}

const OTHER_MODE: Record<KeyMode, KeyMode> = { major: 'minor', minor: 'major' }

/** メジャーとマイナーで同じ自然音degree。 */
const DEGREE_LABELS_MAJOR = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7']
/** 自然マイナー: b3, b6, b7 が基本。 */
const DEGREE_LABELS_MINOR = ['1', 'b2', 'b3', '3', '4', '#4', '5', '6', '7', '2', 'b7', '#5']

const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']

export interface ExpectResult {
  matched: boolean
  inversionMatched: boolean
}

// ---------------------------------------------------------------- notes

export function midiToName(midi: number): string {
  return Note.fromMidi(midi)
}

export function pitchClassOf(midi: number): string {
  return Note.pitchClass(Note.fromMidi(midi))
}

export function chromaOf(name: string): number {
  return Note.chroma(name)
}

/** 順序を保った重複除去。Chord.detect にはこれで渡す。 */
export function uniquePcs(names: readonly string[]): string[] {
  const out: string[] = []
  for (const name of names) {
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

// ---------------------------------------------------------------- chords

/**
 * コード名の識別子。転回を無視した "Aminor" のような形を返す。
 * 長い英語名 (Chord.get().name) は使わない。同じコードでも文字列が変わるため。
 */
export function chordKey(symbol: string): string {
  const chord = Chord.get(symbol)
  if (chord.empty || !chord.tonic) return symbol
  return `${chord.tonic}${chord.type ?? ''}`
}

/** 転回を落とした「コード名」。C と Cmaj7 は別物として扱う。 */
export function normalizeChord(symbol: string): string {
  return chordKey(symbol)
}

export function chordBass(symbol: string): string | undefined {
  const chord = Chord.get(symbol)
  if (chord.empty) return undefined
  // 根音位置では bass が空文字になる。空は「転回ではない」。
  return chord.bass ? chord.bass : undefined
}

export function chordNotes(symbol: string): string[] {
  const chord = Chord.get(symbol)
  return chord.empty ? [] : [...chord.notes]
}

/** 構成音をピッチクラス名の配列で返す。Pcset.chroma は文字列なので使わない。 */
export function chordPitchClasses(symbol: string): string[] {
  return uniquePcs(chordNotes(symbol))
}

export type ChordQuality = 'maj' | 'min' | 'dim' | 'aug' | 'dom' | 'half-dim' | 'other'

/** intervals は "1P","3M","5d","7m" のような音程名。 */
export function chordQuality(symbol: string): ChordQuality {
  const chord = Chord.get(symbol)
  if (chord.empty) return 'other'
  const intervals: readonly string[] = chord.intervals ?? []
  const has = (i: string) => intervals.includes(i)
  if (has('5d') || has('3m') === false && has('b3')) return 'dim'
  if (has('5A')) return 'aug'
  if (has('7m') && has('3M')) return 'dom'
  if (has('3m')) return has('7M') ? 'min' : 'min'
  if (has('7M') && has('5d')) return 'half-dim'
  return has('3M') ? 'maj' : 'other'
}

/**
 * v0.1 設計 7.2: 戻り値は配列。先頭が「今のコード」、残りが候補。
 * 空なら「コードなし」。順位だけアプリが決める。
 */
export function detectChordSymbols(
  pitchClasses: readonly string[],
  options: { assumePerfectFifth?: boolean; key?: KeyRef | null } = {},
): string[] {
  const pcs = uniquePcs(pitchClasses)
  if (pcs.length === 0) return []

  let found = Chord.detect(pcs, { assumePerfectFifth: options.assumePerfectFifth ?? false })
  if (found.length === 0 && options.assumePerfectFifth === false) {
    found = Chord.detect(pcs, { assumePerfectFifth: true })
  }
  if (found.length === 0) return []

  const key = options.key ?? null
  if (!key) return found

  // キーが決まっている練習では、そのキーのダイアトニックを先に並べる。
  const diatonic = new Set([...key.triads, ...key.chords].map(chordKey))
  return [...found].sort((a, b) => {
    const da = diatonic.has(chordKey(a)) ? 0 : 1
    const db = diatonic.has(chordKey(b)) ? 0 : 1
    return da - db
  })
}

// ---------------------------------------------------------------- keys

/**
 * "C major" / "A minor" / "Am" / "Eb" を KeyRef に落とす。
 * Key.get() は tonal 6 に無いので、表記だけ自前で解釈する。
 */
export function resolveKey(keyNameOrTonic: string | null | undefined): KeyRef | null {
  const raw = keyNameOrTonic?.trim()
  if (!raw) return null

  // tonal の "C: D minor" 表記も受ける。
  const split = /^([A-Ga-g][#b]?):\s*(.+)$/.exec(raw)
  const target = split ? split[2] : raw

  const named = /^([A-Ga-g][#b]?)\s*(major|minor|maj|min|mol)?$/i.exec(target)
  if (!named) return null
  const mode: KeyMode = named[2] && /min|mol/i.test(named[2]) ? 'minor' : 'major'
  return makeKeyRef(named[1], mode)
}

export function makeKeyRef(tonic: string, mode: KeyMode): KeyRef {
  const name = `${tonic} ${mode}`
  const empty: KeyRef = {
    name,
    tonic,
    mode,
    pitchClasses: [],
    triads: [],
    chords: [],
    dominantRoot: '',
  }
  if (tonic && Note.chroma(tonic) < 0) return empty

  let scale: string[] = []
  let triads: string[] = []
  let chords: string[] = []
  try {
    if (mode === 'major') {
      const key = Key.majorKey(tonic)
      scale = [...key.scale]
      triads = [...key.triads]
      chords = [...key.chords]
    } else {
      const key = Key.minorKey(tonic)
      scale = [...key.natural.scale]
      triads = [...key.natural.triads]
      chords = [...key.natural.chords]
    }
  } catch {
    return empty
  }
  if (scale.length === 0) return empty

  const dominantRoot = triads[4] ? (Chord.get(triads[4]).tonic ?? '') : ''
  return {
    name: scale.length > 0 ? `${tonic} ${mode}` : name,
    tonic,
    mode,
    pitchClasses: uniquePcs(scale),
    triads,
    chords,
    dominantRoot,
  }
}

export function scaleOfKey(key: KeyRef): string {
  return `${key.tonic} ${key.mode}`
}

/** キー名からスケール pitch class を引く。 */
export function scalePitchClasses(scaleName: string): string[] {
  const resolved = resolveKey(scaleName)
  if (resolved) return resolved.pitchClasses
  return []
}

export function isInScale(pitchClass: string, scaleName: string): boolean {
  return scalePitchClasses(scaleName).includes(pitchClass)
}

/** 鍵の上に載せる度数 (1, b3, 5 ...)。主音からの相対で求める。 */
export function degreesOfKey(key: KeyRef): Record<string, string> {
  const out: Record<string, string> = {}
  const tonicChroma = Note.chroma(key.tonic)
  if (tonicChroma < 0) return out
  const labels = key.mode === 'major' ? DEGREE_LABELS_MAJOR : DEGREE_LABELS_MINOR
  // 異名同音 (C#/Db など) でも引けるよう、クロマごとに全表記へ割り当てる。
  const spellings: Record<number, string[]> = {
    0: ['C'],
    1: ['C#', 'Db'],
    2: ['D'],
    3: ['D#', 'Eb'],
    4: ['E'],
    5: ['F'],
    6: ['F#', 'Gb'],
    7: ['G'],
    8: ['G#', 'Ab'],
    9: ['A'],
    10: ['A#', 'Bb'],
    11: ['B'],
  }
  for (let chroma = 0; chroma < 12; chroma += 1) {
    const degree = labels[(((chroma - tonicChroma) % 12) + 12) % 12] ?? ''
    for (const name of spellings[chroma] ?? []) out[name] = degree
  }
  // tonal の fromMidi が返す表記 ( flats 寄り ) も念のため入れる。
  for (let i = 0; i < 12; i += 1) {
    const pc = Note.pitchClass(Note.fromMidi(60 + i))
    const chroma = Note.chroma(pc)
    if (chroma >= 0 && out[pc] === undefined) {
      out[pc] = labels[(((chroma - tonicChroma) % 12) + 12) % 12] ?? ''
    }
  }
  return out
}

/**
 * v0.1 設計 9.1: ダイアトニック表と突き合わせる。
 * 付かないコードは undefined を返して、シンボルのまま残す。
 */
/**
 * v0.1 設計 9.1: ダイアトニック表と突き合わせる。
 * 三和音 (I-V-vi) と 7th (Imaj7-V7-vi7) の両方を照合する。
 * 付かないコードは undefined を返して、シンボルのまま残す。
 */
export function romanNumeral(symbol: string, key: KeyRef | null): string | undefined {
  if (!key || !symbol) return undefined
  const target = chordKey(symbol)
  const table = key.mode === 'major' ? ROMAN_MAJOR : ROMAN_MINOR

  // triads と chords は同じ次数順に並んでいるので、添字で合わせられる。
  const triadIndex = key.triads.findIndex((triad) => chordKey(triad) === target)
  if (triadIndex >= 0) return table[triadIndex]

  const chordIndex = key.chords.findIndex((chord) => chordKey(chord) === target)
  if (chordIndex >= 0) return table[chordIndex]

  // マイナーキーの調性 V (G# を含む) は自然音和音に無いので別で拾う。
  if (key.mode === 'minor') {
    const root = Chord.get(symbol).tonic
    if (root && root === key.dominantRoot) return 'V'
  }
  return undefined
}

/** そのコードがこのキーの 7th 和音か。IIm7 のような書き分けに使う。 */
export function isSeventhChord(symbol: string, key: KeyRef | null): boolean {
  if (!key) return false
  return key.chords.some((chord) => chordKey(chord) === chordKey(symbol))
}

/**
 * v0.3 4 章: 候補は現キーの近親調だけ。
 * 平行調・属調・下属調・平行調（リレイティブ）。全 24 キーは回さない。
 */
export function relatedKeys(key: KeyRef): KeyRef[] {
  if (Note.chroma(key.tonic) < 0) return []
  const shifted = (semitones: number, mode: KeyMode): KeyRef | null => {
    const chroma = Note.chroma(key.tonic)
    const midi = 60 + ((((chroma + semitones) % 12) + 12) % 12)
    // fromMidi は "G4" のようにオクターブ付きなので、拉丁名だけ取り出す。
    const tonic = Note.fromMidi(midi).replace(/\d+$/, '')
    return makeKeyRef(tonic, mode)
  }

  const out: KeyRef[] = []
  const push = (candidate: KeyRef | null) => {
    if (!candidate || candidate.pitchClasses.length === 0) return
    if (candidate.name === key.name) return
    if (out.some((k) => k.name === candidate.name)) return
    out.push(candidate)
  }

  push(makeKeyRef(key.tonic, OTHER_MODE[key.mode])) // 平行調
  push(shifted(7, 'major')) // 属調
  push(shifted(5, key.mode)) // 下属調
  push(shifted(9, 'minor')) // 平行調（リレイティブ）
  push(shifted(3, 'major')) // 平行調（リレイティブ）
  return out
}

/**
 * 窓の pitch class が、そのキーのスケールにいくつ入るか (0..1)。
 *
 * 名前の照合ではなく chroma (0-11) で照合する。
 * Ab と G# は同じ音なので、名前で比べる辗转调の判定が壊れる。
 */
export function scaleCoverage(pitchClasses: readonly string[], key: KeyRef): number {
  if (pitchClasses.length === 0 || key.pitchClasses.length === 0) return 0
  const scaleChroma = new Set(key.pitchClasses.map((pc) => Note.chroma(pc)).filter((c) => c >= 0))
  if (scaleChroma.size === 0) return 0
  let hits = 0
  for (const pc of pitchClasses) {
    const chroma = Note.chroma(pc)
    if (chroma >= 0 && scaleChroma.has(chroma)) hits += 1
  }
  return hits / pitchClasses.length
}

export function isDiatonicChord(symbol: string, key: KeyRef): boolean {
  // 転回を無視した root+quality で照合する。
  const target = chordKey(symbol)
  return [...key.triads, ...key.chords].some((c) => chordKey(c) === target)
}

/** そのキーの調性 V の和音か (転回を無視)。 */
export function isDominantOf(symbol: string, key: KeyRef): boolean {
  if (!key.dominantRoot) return false
  return Chord.get(symbol).tonic === key.dominantRoot
}

/** V/vi のような二次ドミナント。キーバッジは変えない。 */
export function isSecondaryDominant(symbol: string, key: KeyRef): boolean {
  if (chordQuality(symbol) !== 'dom') return false
  const root = Chord.get(symbol).tonic
  if (!root) return false
  // 根音がスケール外 (クロマティク) なら借用和音なので、二次ドミナント扱いしない。
  if (!key.pitchClasses.includes(root)) return false
  // MajorKey.majorKeyChords にある V/V などは。作者の意図を優先して true。
  if (key.mode === 'major') {
    const entries = Key.majorKeyChords(key.tonic) as KeyChordEntry[]
    const secondary = entries
      .filter((entry) => entry.roles.some((role) => role.startsWith('V/')))
      .map((entry) => entry.name)
    if (secondary.some((name) => chordKey(name) === chordKey(symbol))) return true
  }
  // 本来の属和音そのものは二次ドミナントではない。
  return root !== key.dominantRoot
}

// ---------------------------------------------------------------- matching

/** v0.1 設計 8: notes は Pcset の集合一致。順番は問わない。 */
export function matchNotes(heldPitchClasses: readonly string[], expected: readonly string[]): boolean {
  if (expected.length === 0) return false
  return Pcset.isEqual(uniquePcs(heldPitchClasses), uniquePcs(expected))
}

/** v0.1 設計 8: 転回形はベース音を別判定にする。 */
export function matchChord(
  candidates: readonly string[],
  expected: string,
): { matched: boolean; inversionMatched: boolean } {
  const expectedKey = chordKey(expected)
  const expectedBass = chordBass(expected)
  for (const candidate of candidates) {
    if (chordKey(candidate) !== expectedKey) continue
    if (!expectedBass) return { matched: true, inversionMatched: false }
    if (chordBass(candidate) === expectedBass) return { matched: true, inversionMatched: false }
    return { matched: true, inversionMatched: true }
  }
  return { matched: false, inversionMatched: false }
}

// ---------------------------------------------------------------- voicing

/** ルートを基準に、center 付近で上和音に積み直す。 */
export function voiceChord(pitchClasses: readonly string[], centerMidi = 60): number[] {
  const chromas = pitchClasses
    .map((pc) => Note.chroma(pc))
    .filter((c) => c >= 0)
    .sort((a, b) => a - b)
  if (chromas.length === 0) return []

  const root = chromas[0]
  let rootMidi = 60 + root
  // 根音が center から 6 半音以上離れているならオクターブを移す。
  while (rootMidi - centerMidi > 6) rootMidi -= 12
  while (centerMidi - rootMidi > 6) rootMidi += 12

  return chromas.map((c) => rootMidi + ((((c - root) % 12) + 12) % 12))
}

/**
 * v0.2 4 章: 期待する鍵の青緑は 1 つのボイシングだけ点ける。
 * ピッチクラス全体を光らせると画面がうるさくなるため。
 */
export function expectedMidis(
  pitchClasses: readonly string[],
  options: { centerMidi?: number } = {},
): number[] {
  return voiceChord(pitchClasses, options.centerMidi ?? 60)
}

// ---------------------------------------------------------------- steps

/** Step.expect の判定。TutorialRunner からはここだけを使う。 */
export function evaluateStep(
  step: Step,
  input: { pitchClasses: string[]; candidates: string[] },
): ExpectResult {
  const expect = step.expect
  switch (expect.kind) {
    case 'notes': {
      if (input.pitchClasses.length === 0) return { matched: false, inversionMatched: false }
      return {
        matched: matchNotes(input.pitchClasses, expect.pitchClasses),
        inversionMatched: false,
      }
    }
    case 'chord':
      return matchChord(input.candidates, expect.symbol)
    case 'inScale': {
      if (input.pitchClasses.length === 0) return { matched: false, inversionMatched: false }
      const scale = scalePitchClasses(expect.scale)
      return {
        matched: input.pitchClasses.every((pc) => scale.includes(pc)),
        inversionMatched: false,
      }
    }
    case 'listen':
    default:
      return { matched: false, inversionMatched: false }
  }
}

/** v0.3 2 章: 「C major から A minor へ。共通コードは Am」の文。 */
export function modulationSentence(event: ScoreEvent): string {
  const from = event.fromKey ?? '現在のキー'
  const to = event.toKey ?? ''
  const head = to ? `${from} から ${to} へ` : from
  return event.pivot ? `${head}。共通コードは ${event.pivot}` : `${head}。`
}

/** 構成音名の並び。導線の説明文に使う。 */
export function describeSymbol(symbol: string): string {
  if (!symbol) return 'なし'
  const pcs = chordPitchClasses(symbol)
  return pcs.length > 0 ? pcs.join(' ') : symbol
}