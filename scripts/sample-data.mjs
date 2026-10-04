/**
 * 内蔵サンプルのデータ定義。
 *
 * v0.1 設計 9.3: 内蔵サンプルは MIDI ではなく ScoreDocument JSON で持つ。
 * ライセンスが明確な自作進行のみ。既存の市販曲の MIDI は同梱しない。
 * 出力は scripts/gen-samples.mjs が JSON に落とす。
 */

// C4 = 60
const N = {
  C2: 36, D2: 38, E2: 40, F2: 41, G2: 43, A2: 45, B2: 47,
  C3: 48, D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59,
  C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71,
  C5: 72, D5: 74, E5: 76, F5: 77, G5: 79,
}

/**
 * コード名 -> ビットクラス名 -> MIDI。tonal を Node から呼べないため、
 * 生成スクリプト側では小さな表在这里 持つ。
 */
const TRIAD = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  dom: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
}

const PC = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** "Cmaj7" のようなシンボルからピチクラス名を引く。 */
function chordPitchClasses(symbol) {
  const match = /^([A-G][#b]?)(.*)$/.exec(symbol)
  if (!match) return []
  const root = PC[match[1]]
  if (root === undefined) return []
  const quality = TRIAD[match[2]] ? match[2] : 'maj'
  return TRIAD[quality].map((iv) => PC_NAMES[(root + iv) % 12])
}

/**
 * 転回と音名を無視した同一判定。
 * Cmaj7 と Cmaj7/E は同じ。Cmaj7 と C は違う。
 */
function sameChord(a, b) {
  return chordIdentity(a) === chordIdentity(b)
}

function chordIdentity(symbol) {
  const m = /^([A-G][#b]?)([^/]*)/.exec(symbol)
  if (!m) return symbol
  const suffix = m[2]
  // 未知の修飾はそのまま残す。既知のものだけ正規化する。
  const quality = TRIAD[suffix] ? suffix : suffix === '' ? 'maj' : suffix
  return `${m[1]}${quality}`
}

// 7 度和音も triad の root/quality で照合する。
const SEVENTH_QUALITY = {
  maj: 'maj7', min: 'min7', dim: 'm7b5',
}

/** Cmaj7 と C は違う和音として扱うので、三和音と 7 度和音を別々に持つ。 */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
/** 各字母での♯/♭ の基準 (C=0, F=1, ほかは 0)。 */
const NATURAL_CHROMA = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** "Eb" を { letter: 'E', alter: -1, chroma: 3 } に分解。 */
function parseNoteName(name) {
  const m = /^([A-G])([#b]?)$/.exec(name)
  if (!m) return null
  const alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  const letter = m[1]
  return {
    letter,
    alter,
    chroma: (NATURAL_CHROMA[letter] + alter + 12) % 12,
    name: `${letter}${m[2] ?? ''}`,
  }
}

/** 自然音テーブル。major: I ii iii IV V vi vii° / minor: i ii° III iv v VI VII */
function diatonicTable(tonic, mode) {
  const SUFFIX = {
    major: ['', 'm', 'm', '', '', 'm', 'dim'],
    minor: ['m', 'dim', '', 'm', 'm', '', ''],
  }
  const parsed = parseNoteName(tonic)
  if (!parsed) return []
  const suffix = SUFFIX[mode]
  const startIndex = LETTERS.indexOf(parsed.letter)

  return LETTERS.map((_, i) => {
    const letter = LETTERS[(startIndex + i) % 7]
    const target = (parsed.chroma + MAJOR_STEPS[i]) % 12
    // 字母の naturals から target までの差だけ ♯ か ♭ を付ける。
    let alter = ((target - NATURAL_CHROMA[letter] + 18) % 12) - 6
    // enharmonic は最低限に留める (♯♭ の二重♯を避ける)。
    while (alter > 1) alter -= 12
    while (alter < -2) alter += 12
    return `${letter}${alter === 0 ? '' : alter > 0 ? '#' : 'b'}${suffix[i]}`
  })
}

/** メジャースケールの半音パターン (度数順)。 */
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]

/**
 * 7度和音のテーブル。トリアッド表と同じ度数に揃える。
 * 5 度は下属和音 (dominant 7th) になる。tonal の Key.majorKey().chords と同じ約束。
 */
function seventhTable(tonic, mode) {
  return diatonicTable(tonic, mode).map((triad, i) => {
    const m = /^([A-G][#b]?)(.*)$/.exec(triad)
    if (!m) return triad
    if (i === 4) return `${m[1]}7`
    // 長三和音は空文字で表されるので maj7 に読み替える。
    const quality = m[2] === '' ? 'maj' : m[2]
    return `${m[1]}${SEVENTH_QUALITY[quality] ?? `${quality}7`}`
  })
}

const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']

/**
 * コードにローマ数字を付ける。
 * triads / seventh の順に照合し、付かないものは undefined (= シンボルのまま残す)。
 */
function romanFor(symbol, tonic, mode) {
  const table = diatonicTable(tonic, mode)
  const romans = mode === 'major' ? ROMAN_MAJOR : ROMAN_MINOR
  let degree = table.findIndex((name) => sameChord(name, symbol))
  if (degree < 0) degree = seventhTable(tonic, mode).findIndex((n) => sameChord(n, symbol))
  if (degree >= 0) return romans[degree]
  // マイナーキーの調性 V (♯7 を含む) は自然音和音に無いので、属音の根音で拾う。
  if (mode === 'minor') {
    const dominantRoot = /^([A-G][#b]?)/.exec(diatonicTable(tonic, 'minor')[4])?.[1]
    const root = /^([A-G][#b]?)/.exec(symbol)?.[1]
    if (dominantRoot && root === dominantRoot) return 'V'
  }
  return undefined
}

const G_SHARP = 56 // E major の G#
const C_SHARP = 49 // A7 の C#
const F_SHARP = 54 // D7 の F#

function round(x) {
  return Number(x.toFixed(4))
}

function seq(entries) {
  return entries.map((entry, i) => ({
    id: `n${String(i + 1).padStart(3, '0')}`,
    time: round(entry[0]),
    duration: round(entry[1]),
    midi: entry[2],
    velocity: entry[3] ?? 84,
    source: entry[4] ?? 'sample',
  }))
}

/**
 * cell = [time, duration, symbol, candidates?, roman?, keySpec?]
 * keySpec = [tonic, mode] を渡すとローマ数字を生成する。
 */
function cells(list) {
  return list.map((cell, i) => {
    const roman = cell[4]
    const spec = cell[5]
    const computed = roman ?? (spec ? romanFor(cell[2], spec[0], spec[1]) : undefined)
    return {
      id: `c${String(i + 1).padStart(3, '0')}`,
      time: round(cell[0]),
      duration: round(cell[1]),
      symbol: cell[2],
      candidates: cell[3] ?? [cell[2]],
      ...(computed ? { roman: computed } : {}),
      confidence: 1,
    }
  })
}

/** 8 分のアルペジオを小節内に並べる。 */
function arpeggio(start, triad, beats) {
  const ladder = [...triad, triad[0] + 12, triad[2], triad[1], triad[0] + 12, triad[2] + 12]
  const out = []
  for (let i = 0; i < Math.round(beats * 2); i += 1) {
    out.push([start + i * 0.5, 0.5, ladder[i % ladder.length], 100 - (i % 2) * 6])
  }
  return out
}

/** 低音 + 和音。 */
function pad(start, beats, bass, triad) {
  const out = [[start, beats, bass, 66]]
  for (const midi of triad) out.push([start, beats, midi, 76])
  return out
}

// ------------------------------------------------- 1. I-V-vi-IV から A minor へ
const S1_BARS = [
  { at: 0, bass: N.C3, triad: [N.C4, N.E4, N.G4], symbol: 'C', roman: 'I', melody: [N.E4, N.G4] },
  { at: 4, bass: N.G2, triad: [N.G3, N.B3, N.D4], symbol: 'G', roman: 'V', melody: [N.D4, N.B4] },
  { at: 8, bass: N.A2, triad: [N.A3, N.C4, N.E4], symbol: 'Am', roman: 'vi', melody: [N.C5, N.A4] },
  { at: 12, bass: N.F2, triad: [N.F3, N.A3, N.C4], symbol: 'F', roman: 'IV', melody: [N.A4, N.F4] },
  // ここから A minor。Am は C major の vi でもあるので pivot になる。
  { at: 16, bass: N.A2, triad: [N.A3, N.C4, N.E4], symbol: 'Am', roman: 'i', melody: [N.A4, N.C5] },
  { at: 20, bass: N.D3, triad: [N.D3, N.F3, N.A3], symbol: 'Dm', roman: 'iv', melody: [N.A4, N.G4] },
  // E major は Am の V。ハ長調の G を G# に上げる。
  { at: 24, bass: N.E2, triad: [N.E3, G_SHARP, N.B3], symbol: 'E', roman: 'V', melody: [N.G4, N.B4] },
  { at: 28, bass: N.A2, triad: [N.A3, N.C4, N.E4], symbol: 'Am', roman: 'i', melody: [N.A4, N.C5] },
]

const s1Notes = []
for (const bar of S1_BARS) {
  s1Notes.push(...pad(bar.at, 4, bar.bass, bar.triad))
  s1Notes.push([bar.at + 2, 1, bar.melody[0], 98])
  s1Notes.push([bar.at + 3, 1, bar.melody[1], 94])
}

export const popProgression = {
  version: 1,
  meta: {
    title: '自作進行: I-V-vi-IV → A minor',
    tonic: 'C',
    scale: 'major',
    bpm: 100,
    timeSig: [4, 4],
  },
  notes: seq(s1Notes),
  // 小節 5 以降は A minor。ローマ数字は当时的キーに合わせる。
  chords: cells([
    ...S1_BARS.slice(0, 4).map((b) => [b.at, 4, b.symbol, [b.symbol], null, ['C', 'major']]),
    ...S1_BARS.slice(4).map((b) => [b.at, 4, b.symbol, [b.symbol], null, ['A', 'minor']]),
  ]),
  events: [
    {
      id: 'ev-mod-1',
      time: 16,
      kind: 'modulation',
      label: 'C major から A minor へ。共通コードは Am',
      fromKey: 'C major',
      toKey: 'A minor',
      pivot: 'Am',
      source: 'author',
      confidence: 1,
      duration: 8,
      pauseOnPass: true,
      memo: 'この旗で止まる。Tutorial のステップと紐づけている。',
    },
    {
      id: 'ev-ton-1',
      time: 24,
      kind: 'tonicization',
      label: 'E major (A minor の V。ハ長調の G を G# に上げる)',
      fromKey: 'A minor',
      toKey: 'A minor',
      source: 'author',
      confidence: 1,
      duration: 4,
      memo: 'キーバッジは変えない。キーは A minor のまま。',
    },
    {
      id: 'ev-cad-1',
      time: 28,
      kind: 'cadence',
      label: 'カデンツ (E → Am)',
      fromKey: 'A minor',
      toKey: 'A minor',
      source: 'author',
      confidence: 1,
      duration: 4,
    },
  ],
}

// ------------------------------------------------- 2. ii-V-I を G7 で締める
const S2_CELLS = [
  [0, 4, 'Cmaj7', ['Cmaj7']],
  [4, 2, 'Am7', ['Am7', 'A7#5']],
  [6, 2, 'D7', ['D7', 'Dm7']],
  [8, 4, 'Gmaj7', ['Gmaj7']],
  [12, 4, 'Cmaj7', ['Cmaj7']],
  [16, 4, 'Fmaj7', ['Fmaj7']],
  [20, 2, 'Em7', ['Em7', 'E5b']],
  [22, 2, 'A7', ['A7', 'Am7']],
  [24, 2, 'Dm7', ['Dm7', 'Dm7b5']],
  [26, 2, 'G7', ['G7', 'Cmaj7/G']],
  [28, 4, 'Cmaj7', ['Cmaj7']],
]

const S2_VOICINGS = {
  Cmaj7: { bass: N.C3, triad: [N.C4, N.E4, N.G4, N.B4] },
  Am7: { bass: N.A2, triad: [N.A3, N.C4, N.E4, N.G4] },
  D7: { bass: N.D3, triad: [N.D3, F_SHARP, N.A3, N.C4] },
  Gmaj7: { bass: N.G2, triad: [N.G3, N.B3, N.D4, N.F4] },
  Fmaj7: { bass: N.F2, triad: [N.F3, N.A3, N.C4, N.E4] },
  Em7: { bass: N.E2, triad: [N.E3, N.G3, N.B3, N.D4] },
  A7: { bass: N.A2, triad: [N.A3, C_SHARP, N.E3, N.G3] },
  Dm7: { bass: N.D3, triad: [N.D3, N.F3, N.A3, N.C4] },
  G7: { bass: N.G2, triad: [N.G3, N.B3, N.D4, N.F4] },
}

const s2Notes = []
for (const [start, dur, symbol] of S2_CELLS) {
  const v = S2_VOICINGS[symbol]
  s2Notes.push(...pad(start, dur, v.bass, v.triad))
  // 1 小節セルだけ、4 拍目の頭で上声部を adultery 動かす。
  if (dur === 4) s2Notes.push([start + 3, 1, v.triad[3] + 12, 98])
}

export const jazzTwoFiveOne = {
  version: 1,
  meta: {
    title: '自作進行: ii-V-I (C major)',
    tonic: 'C',
    scale: 'major',
    bpm: 92,
    timeSig: [4, 4],
  },
  notes: seq(s2Notes),
  chords: cells(S2_CELLS.map((c) => [...c, null, ['C', 'major']])),
  events: [
    {
      id: 'ev-sd-1',
      time: 6,
      kind: 'tonicization',
      label: 'D7 (V/V)。G major へ一瞬OOKれ込む',
      fromKey: 'C major',
      toKey: 'C major',
      source: 'author',
      confidence: 1,
      duration: 2,
      memo: 'キーバッジは変えない。強い旗は立てない。',
    },
    {
      id: 'ev-sd-2',
      time: 22,
      kind: 'tonicization',
      label: 'A7 (V/vi)',
      fromKey: 'C major',
      toKey: 'C major',
      source: 'author',
      confidence: 1,
      duration: 2,
      memo: 'キーバッジは変えない。',
    },
    {
      id: 'ev-cad-2',
      time: 12,
      kind: 'cadence',
      label: 'カデンツ (Gmaj7 → Cmaj7)',
      fromKey: 'C major',
      toKey: 'C major',
      source: 'author',
      confidence: 1,
      duration: 4,
    },
    {
      id: 'ev-cad-3',
      time: 28,
      kind: 'cadence',
      label: 'カデンツ (G7 → Cmaj7)',
      fromKey: 'C major',
      toKey: 'C major',
      source: 'author',
      confidence: 1,
      duration: 4,
    },
  ],
}

// ------------------------------------------------- 3. 8 小節のアルペジオ練習
const S3_CELLS = [
  [0, 8, 'C', ['C', 'Cmaj', 'C5']],
  [8, 8, 'Am', ['Am', 'Amin', 'Am7']],
  [16, 8, 'F', ['F', 'Fmaj', 'Fadd9']],
  [24, 8, 'G', ['G', 'Gsus4', 'G5']],
]
const S3_VOICINGS = {
  C: { bass: N.C3, triad: [N.C4, N.E4, N.G4] },
  Am: { bass: N.A2, triad: [N.A3, N.C4, N.E4] },
  F: { bass: N.F2, triad: [N.F3, N.A3, N.C4] },
  G: { bass: N.G2, triad: [N.G3, N.B3, N.D4] },
}

const s3Notes = []
for (const [start, beats, symbol] of S3_CELLS) {
  const v = S3_VOICINGS[symbol]
  s3Notes.push([start, beats, v.bass, 60])
  for (const midi of v.triad) s3Notes.push([start, beats, midi, 68])
  s3Notes.push(...arpeggio(start + 2, v.triad, beats - 2))
}

export const scaleStudy = {
  version: 1,
  meta: {
    title: '自作練習: C major アルペジオ I-vi-IV-V',
    tonic: 'C',
    scale: 'major',
    bpm: 72,
    timeSig: [4, 4],
  },
  notes: seq(s3Notes),
  chords: cells(S3_CELLS.map((c) => [...c, null, ['C', 'major']])),
  events: [
    {
      id: 'ev-cad-4',
      time: 28,
      kind: 'cadence',
      label: 'カデンツ (V → I)',
      fromKey: 'C major',
      toKey: 'C major',
      source: 'author',
      confidence: 1,
      duration: 4,
    },
  ],
}

// ------------------------------------------------- lessons
function triad(midis, duration, start = 0) {
  return seq(
    midis.map((midi) => [start, duration, midi, 92]),
  )
}

export const lessonFirstChords = {
  id: 'first-chords',
  title: '最初の和音 4 つ',
  tonic: 'C',
  keyName: 'C major',
  score: {
    meta: {
      title: 'レッスン: I-vi-IV-V',
      tonic: 'C',
      scale: 'major',
      bpm: 72,
      timeSig: [4, 4],
    },
    notes: seq(s3Notes),
    chords: cells(S3_CELLS.map((c) => [...c, null, ['C', 'major']])),
    events: scaleStudy.events,
  },
  steps: [
    {
      id: 'step-c',
      prompt: 'C を弾く。構成音は C E G。',
      expect: { kind: 'chord', symbol: 'C' },
      pauseSampleOnInput: true,
      advanceOn: 'match',
      fromBeat: 0,
      nudge: 'C E G の鍵だけ。',
      sample: { notes: triad([N.C4, N.E4, N.G4], 3) },
    },
    {
      id: 'step-am',
      prompt: 'Am を弾く。構成音は A C E。',
      expect: { kind: 'chord', symbol: 'Am' },
      pauseSampleOnInput: true,
      advanceOn: 'match',
      fromBeat: 8,
      nudge: 'A C E の鍵だけ。',
      sample: { notes: triad([N.A3, N.C4, N.E4], 3) },
    },
    {
      id: 'step-f',
      prompt: 'F を弾く。構成音は F A C。',
      expect: { kind: 'chord', symbol: 'F' },
      pauseSampleOnInput: true,
      advanceOn: 'match',
      fromBeat: 16,
      nudge: 'F A C の鍵だけ。',
      sample: { notes: triad([N.F3, N.A3, N.C4], 3) },
    },
    {
      id: 'step-g',
      prompt: 'G を弾く。構成音は G B D。',
      expect: { kind: 'chord', symbol: 'G' },
      pauseSampleOnInput: true,
      advanceOn: 'match',
      fromBeat: 24,
      nudge: 'G B D の鍵だけ。',
      sample: { notes: triad([N.G3, N.B3, N.D4], 3) },
    },
    {
      id: 'step-listen',
      prompt: 'I-vi-IV-V を最後まで聞く。',
      expect: { kind: 'listen' },
      pauseSampleOnInput: false,
      advanceOn: 'manual',
      fromBeat: 0,
    },
  ],
}

export const lessonKeyChange = {
  id: 'key-change',
  title: '転調で止まる',
  tonic: 'C',
  keyName: 'C major',
  score: {
    meta: popProgression.meta,
    notes: popProgression.notes,
    chords: popProgression.chords,
    events: popProgression.events,
  },
  steps: [
    {
      id: 'step-i',
      prompt: 'C を弾く。I の構成音は C E G。',
      expect: { kind: 'chord', symbol: 'C' },
      pauseSampleOnInput: true,
      advanceOn: 'match',
      fromBeat: 0,
      nudge: 'C E G の鍵だけ。',
      sample: { notes: triad([N.C4, N.E4, N.G4], 4) },
    },
    {
      id: 'step-v',
      prompt: 'G を弾く。V の構成音は G B D。',
      expect: { kind: 'chord', symbol: 'G' },
      pauseSampleOnInput: true,
      advanceOn: 'match',
      fromBeat: 4,
      nudge: 'G B D の鍵だけ。',
      sample: { notes: triad([N.G3, N.B3, N.D4], 4) },
    },
    {
      id: 'step-pivot',
      prompt: '第 5 小節の Am を弾く。ここで転調する。',
      expect: { kind: 'chord', symbol: 'Am' },
      pauseSampleOnInput: true,
      advanceOn: 'match',
      fromBeat: 12,
      stopAtBeat: 16,
      nudge: 'A C E の鍵だけ。',
      sample: { notes: triad([N.A3, N.C4, N.E4], 4) },
    },
    {
      id: 'step-v-of-am',
      prompt: 'E を弾く。A minor の V。G# を含む。',
      expect: { kind: 'chord', symbol: 'E' },
      pauseSampleOnInput: true,
      advanceOn: 'match',
      fromBeat: 20,
      nudge: 'E G# B の鍵だけ。',
      sample: { notes: triad([N.E3, G_SHARP, N.B3], 4) },
    },
    {
      id: 'step-listen',
      prompt: '最後まで聞く。終止で止まる。',
      expect: { kind: 'listen' },
      pauseSampleOnInput: false,
      advanceOn: 'manual',
      fromBeat: 0,
      stopAtBeat: 28,
    },
  ],
}

export const outputs = {
  'src/samples/pop-progression-c.json': popProgression,
  'src/samples/jazz-ii-v-i.json': jazzTwoFiveOne,
  'src/samples/scale-study-c.json': scaleStudy,
  'src/tutorial/lessons/first-chords.json': lessonFirstChords,
  'src/tutorial/lessons/key-change.json': lessonKeyChange,
}