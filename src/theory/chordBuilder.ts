/**
 * 和音ビルダー用のルート×響き定義。
 * ボタンの表示ラベルはユーザーの指定どおりにし、
 * tonal が解釈できない表記 (-5, 7-5, m7-5, +9, augM7) だけ
 * tonal 側の別名 (Mb5, 7b5, m7b5, 7#9, maj7#5) に読み替える。
 * 発音・構成音の解決は engine/chordAudition と theory に任せ、
 * ここはシンボル文字列の組み立てだけを扱う。
 */

/** ルートボタン。CDEFGAB + C#/Db, D#/Eb, F#, Gb, G#, Ab, A#, Bb */
export const CHORD_BUILDER_ROOTS: string[] = [
  'C',
  'D',
  'E',
  'F',
  'G',
  'A',
  'B',
  'C#',
  'Db',
  'D#',
  'Eb',
  'F#',
  'Gb',
  'G#',
  'Ab',
  'A#',
  'Bb',
]

export interface ChordBuilderQuality {
  /** ボタン表示。ユーザーの指定どおり (M, m, 7-5, +9 など)。 */
  label: string
  /** tonal に渡す接尾辞。表示と異なる場合だけ読み替える。 */
  suffix: string
}

/** 響きボタン。指定の順番のまま並べる。 */
export const CHORD_BUILDER_QUALITIES: ChordBuilderQuality[] = [
  { label: 'M', suffix: 'M' },
  { label: 'm', suffix: 'm' },
  { label: '7', suffix: '7' },
  { label: 'M7', suffix: 'M7' },
  { label: 'm7', suffix: 'm7' },
  { label: 'mM7', suffix: 'mM7' },
  { label: 'sus4', suffix: 'sus4' },
  { label: 'aug7', suffix: 'aug7' },
  // tonal に augM7 の別名は無い。同じ構成音の maj7#5 に読み替える。
  { label: 'augM7', suffix: 'maj7#5' },
  { label: '9', suffix: '9' },
  // tonal の -9 は minor ninth (m9 と同じ)。そのまま渡せる。
  { label: '-9', suffix: '-9' },
  // 単独の -5 / b5 は tonal に無い。長三和+減5 の Mb5 に読み替える。
  { label: '-5', suffix: 'Mb5' },
  { label: 'aug', suffix: 'aug' },
  { label: '6', suffix: '6' },
  { label: 'm6', suffix: 'm6' },
  { label: '7-5', suffix: '7b5' },
  { label: 'm7-5', suffix: 'm7b5' },
  { label: '7sus4', suffix: '7sus4' },
  { label: 'dim7', suffix: 'dim7' },
  { label: 'add9', suffix: 'add9' },
  // 単独の +9 は tonal に無い。属七+増9 の 7#9 に読み替える。
  { label: '+9', suffix: '7#9' },
  { label: '11', suffix: '11' },
]

const SUFFIX_BY_LABEL = new Map<string, string>(
  CHORD_BUILDER_QUALITIES.map((q) => [q.label, q.suffix]),
)

/** 響きラベルから tonal 用の接尾辞を引く。未知ならラベルをそのまま返す。 */
export function qualitySuffix(label: string): string {
  return SUFFIX_BY_LABEL.get(label) ?? label
}

/** ルート + 響きラベルから tonal 用シンボルを作る。例: Db + m7-5 -> Dbm7b5 */
export function buildChordSymbol(root: string, qualityLabel: string): string {
  if (!root) return ''
  return `${root}${qualitySuffix(qualityLabel)}`
}

/** ビルダーの表示ラベル (C + augM7 -> CaugM7) を作る。進行スロットの見た目用。 */
export function displayChordSymbol(root: string, qualityLabel: string): string {
  if (!root) return ''
  return `${root}${qualityLabel}`
}
