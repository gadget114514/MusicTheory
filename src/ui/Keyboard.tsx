/**
 * v0.2 4 章: 鍵盤はモードを知らない。渡されるのは「点灯マップ」だけ。
 * 点灯の理由は手引きと TheoryService が決める。
 *
 * 色は v0.2 2 章の約束を固定する。
 *   琥珀: 今鳴っている
 *   青緑: 次に弾くべき音 / 現在コードの構成音
 *   赤  : 期待と違う押鍵 (200ms で消す)
 *   淡灰: 通過済み
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { inputRouter, MIDI_HIGH, MIDI_LOW, DEFAULT_VIEW_LOW } from '@/engine/input'
import { transport } from '@/engine/transport'
import { degreesOfKey, pitchClassOf, type KeyRef } from '@/theory'

const BLACK = new Set([1, 3, 6, 8, 10])
const WHITE_W = 34
const BLACK_W = 20
const WHITE_H = 168
const BLACK_H = 104

export interface KeyboardLights {
  /** 鳴っている (琥珀)。押鍵 + 再生中の Part。 */
  active: Set<number>
  /** 期待する (青緑)。 */
  expected: Set<number>
  /** 期待と違う押鍵 (赤)。 */
  wrong: Set<number>
  /** 旧主音の残光。1 小節で消える。 */
  afterglow: number | null
  /** 現在コードの構成音を淡く。Tutorial 中だけ。 */
  chordTones: Set<number>
  /** 度数を出すか。Tutorial 中だけ。 */
  showDegrees: boolean
  key: KeyRef | null
}

interface KeyInfo {
  midi: number
  black: boolean
  /** 白鍵としての左位置。 */
  left: number
}

function buildKeys(): KeyInfo[] {
  const out: KeyInfo[] = []
  let whiteIndex = 0
  for (let midi = MIDI_LOW; midi <= MIDI_HIGH; midi += 1) {
    const black = BLACK.has(midi % 12)
    if (!black) {
      out.push({ midi, black: false, left: whiteIndex * WHITE_W })
      whiteIndex += 1
    } else {
      // 黒鍵は左右の白鍵の境界に置く。
      out.push({ midi, black: true, left: whiteIndex * WHITE_W - BLACK_W / 2 })
    }
  }
  return out
}

const KEYS = buildKeys()
const WHITE_COUNT = KEYS.filter((k) => !k.black).length
const TOTAL_W = WHITE_COUNT * WHITE_W

interface Props {
  lights: KeyboardLights
}

export function Keyboard({ lights }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const degrees = useMemo(() => (lights.key ? degreesOfKey(lights.key) : {}), [lights.key])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const first = KEYS.find((k) => !k.black && k.midi >= DEFAULT_VIEW_LOW)
    if (first) el.scrollLeft = Math.max(0, first.left - 8)
  }, [])

  const press = useCallback((midi: number) => {
    void transport.unlock()
    inputRouter.press(midi, 'screen', 100)
  }, [])

  const release = useCallback((midi: number) => {
    inputRouter.release(midi, 'screen')
  }, [])

  // 再生ヘッドが画面内に留まるように、最高的アクティブ音へ寄せる。
  const lastActive = lights.active.size > 0 ? Math.max(...lights.active) : null
  useEffect(() => {
    const el = scrollRef.current
    if (!el || lastActive === null) return
    const key = KEYS.find((k) => k.midi === lastActive)
    if (!key) return
    el.scrollTo({ left: Math.max(0, key.left - el.clientWidth / 2), behavior: 'smooth' })
  }, [lastActive])

  return (
    <div className="keyboard">
      <div className="keyboard-scroll" ref={scrollRef}>
        <div className="keyboard-inner" style={{ width: TOTAL_W, height: WHITE_H }}>
          {KEYS.map((key) => {
            const classes = ['key', key.black ? 'key-black' : 'key-white']
            if (lights.active.has(key.midi)) classes.push('is-active')
            else if (lights.expected.has(key.midi)) classes.push('is-expected')
            if (lights.wrong.has(key.midi)) classes.push('is-wrong')
            if (lights.chordTones.has(key.midi) && !lights.expected.has(key.midi)) {
              classes.push('is-chord-tone')
            }
            if (key.midi === lights.afterglow) classes.push('is-afterglow')
            // degrees はピッチクラス名 ("C", "Db") で引ける。
            const pcName = pitchClassOf(key.midi)
            const degree = lights.showDegrees ? degrees[pcName] : undefined
            if (degree) classes.push('has-degree')

            return (
              <button
                key={key.midi}
                type="button"
                className={classes.join(' ')}
                style={{ left: key.left, height: key.black ? BLACK_H : WHITE_H }}
                aria-label={noteName(key.midi)}
                onPointerDown={(e) => {
                  e.preventDefault()
                  press(key.midi)
                }}
                onPointerUp={() => release(key.midi)}
                onPointerLeave={() => release(key.midi)}
                onPointerCancel={() => release(key.midi)}
              >
                {degree ? <span className="key-degree">{degree}</span> : null}
                {pcName === 'C' && !key.black ? (
                  <span className="key-name">C{Math.floor(key.midi / 12) - 1}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
      <div className="keyboard-hint">
        <span>画面 / PC キー (A=C4) / 外部 MIDI は同じ鍵が光ります。</span>
        <span className="keyboard-range">
          既定表示 C2〜C6。横スクロール可
        </span>
      </div>
    </div>
  )
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function noteName(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
}