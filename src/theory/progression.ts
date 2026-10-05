/**
 * ルールに従って和音を並べ、曲っぽい進行を作るための純関数群。
 * tonal は音を出さない・Tone はコード名を知らない境界は保つ。
 * ここはシンボル文字列と Roman の往復だけを扱い、発音は engine 側に任せる。
 */
import { Chord } from 'tonal'
import { chordKey, type KeyRef } from './index'

export interface ProgressionChoice {
  symbol: string
  roman: string
  /** ダイアトニック内か。借用・セカンダリは false。 */
  diatonic: boolean
}

const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']

function romanTable(mode: 'major' | 'minor'): string[] {
  return mode === 'major' ? ROMAN_MAJOR : ROMAN_MINOR
}

/** キーのダイアトニック三和音を Roman 付きで並べる。パレット表示用。 */
export function diatonicChoices(key: KeyRef): ProgressionChoice[] {
  const table = romanTable(key.mode)
  return key.triads.map((symbol, i) => ({
    symbol,
    roman: table[i] ?? '',
    diatonic: true,
  }))
}

/** よく使う借用・セカンダリ。キーに合わせて根音だけ拾う。 */
export function borrowedChoices(key: KeyRef): ProgressionChoice[] {
  const out: ProgressionChoice[] = []
  const push = (symbol: string, roman: string) => {
    const got = Chord.get(symbol)
    if (got.empty) return
    if (out.some((c) => chordKey(c.symbol) === chordKey(symbol))) return
    out.push({ symbol, roman, diatonic: false })
  }
  // 属和音の 7th 化 (V7) と平行調由来の m7 など、鳴らして分かる範囲だけ。
  const dom = key.dominantRoot
  if (dom) {
    push(`${dom}7`, 'V7')
    push(`${dom}sus4`, 'Vsus4')
  }
  // メジャーの vi を V/vi にする定番のセカンダリ例は root が取れれば足す。
  // 失敗しても無視 (tonal が空を返すだけ)。
  return out
}

/** 度数 (0=I .. 6=vii) からそのキーの三和音シンボルを引く。 */
export function symbolAtDegree(key: KeyRef, degree: number): { symbol: string; roman: string } {
  const table = romanTable(key.mode)
  const index = ((degree % 7) + 7) % 7
  const symbol = key.triads[index] ?? ''
  return { symbol, roman: table[index] ?? '' }
}

export interface ProgressionPreset {
  id: string
  title: string
  /** 度数列。0=I, 3=IV, 4=V, 5=vi ... */
  degrees: number[]
  memo: string
}

export const PROGRESSION_PRESETS: ProgressionPreset[] = [
  { id: 'canon', title: 'カノン (I-V-vi-iii-IV-I-IV-V)', degrees: [0, 4, 5, 2, 3, 0, 3, 4], memo: '8小節の定番。' },
  { id: 'jun', title: '順 (I-V-vi-IV)', degrees: [0, 4, 5, 3], memo: 'ポップスの順進行。' },
  { id: 'odo', title: '王道 (IV-V-iii-vi)', degrees: [3, 4, 2, 5], memo: '日本の王道。切なさが出る。' },
  { id: '251', title: 'ii-V-I (-vi)', degrees: [1, 4, 0, 5], memo: 'ジャズの ii-V-I 着地。' },
  { id: '6251', title: 'vi-ii-V-I', degrees: [5, 1, 4, 0], memo: '循環して I に戻る。' },
  { id: 'plagal', title: 'I-IV-V-I', degrees: [0, 3, 4, 0], memo: 'まず迷ったらこれ。' },
]

/** プリセットをキーに当てはめる。 */
export function presetToChoices(key: KeyRef, presetId: string): ProgressionChoice[] {
  const preset = PROGRESSION_PRESETS.find((p) => p.id === presetId) ?? PROGRESSION_PRESETS[0]
  return preset.degrees.map((d) => {
    const { symbol, roman } = symbolAtDegree(key, d)
    return { symbol, roman, diatonic: true }
  })
}

/**
 * ランダムウォークで進行を作る。終止だけはauthentic/plagalに寄せる。
 * degree 列で作ってからシンボルに直すので、転調なしの範囲に収まる。
 */
export function generateProgression(
  key: KeyRef,
  bars = 4,
  seed?: number,
): ProgressionChoice[] {
  const count = Math.min(16, Math.max(2, Math.round(bars)))
  let rand = seed ?? Math.floor(Math.random() * 1_000_000)
  const next = () => {
    // xorshift32。seed 指定時は再現する。
    rand ^= rand << 13
    rand ^= rand >>> 17
    rand ^= rand << 5
    rand >>>= 0
    return rand / 0xffffffff
  }
  const pick = (cands: number[], weights: number[]): number => {
    const total = weights.reduce((a, b) => a + b, 0)
    let r = next() * total
    for (let i = 0; i < cands.length; i += 1) {
      r -= weights[i]
      if (r <= 0) return cands[i]!
    }
    return cands[cands.length - 1]!
  }
  // degree -> [行き先, 重み]
  const table: Record<number, { to: number[]; w: number[] }> = {
    0: { to: [0, 1, 2, 3, 4, 5, 6], w: [1, 2, 1, 3, 3, 2, 1] },
    1: { to: [4, 6, 0, 5], w: [4, 2, 1, 1] },
    2: { to: [5, 3, 1], w: [3, 2, 1] },
    3: { to: [0, 4, 1, 5], w: [2, 3, 2, 1] },
    4: { to: [0, 5, 2], w: [4, 2, 1] },
    5: { to: [3, 1, 4, 0], w: [3, 2, 2, 1] },
    6: { to: [0, 4], w: [4, 1] },
  }
  const degrees: number[] = [0]
  while (degrees.length < count) {
    const cur = degrees[degrees.length - 1]!
    const row = table[cur] ?? table[0]!
    degrees.push(pick(row.to, row.w))
  }
  // 終止: 最後は I、最後から2番目は V / vii / IV のいずれかに寄せる。
  degrees[count - 1] = 0
  if (count >= 2) {
    const cand = key.mode === 'minor' ? [4, 6, 3] : [4, 6, 3]
    degrees[count - 2] = cand[Math.floor(next() * cand.length)]!
  }
  return degrees.map((d) => {
    const { symbol, roman } = symbolAtDegree(key, d)
    return { symbol, roman, diatonic: true }
  })
}

/** 次に来やすい候補を Roman 順で返す。パレットの並び替え用。 */
export function suggestNext(key: KeyRef, currentRoman: string | null): ProgressionChoice[] {
  const table = romanTable(key.mode)
  const index = currentRoman ? table.indexOf(currentRoman) : 0
  const order =
    index < 0
      ? [0, 3, 4, 5, 1, 2, 6]
      : ([0, 1, 2, 3, 4, 5, 6].slice(index).concat([0, 1, 2, 3, 4, 5, 6].slice(0, index)) as number[])
  return order.map((d) => {
    const { symbol, roman } = symbolAtDegree(key, d)
    return { symbol, roman, diatonic: true }
  })
}
