/**
 * v0.2 3.1: 1 セル = 1 ChordEvent。既定は 1 小節。
 * 解析の窓と表示の窓を同じにする。
 * 再生ヘッドはセル境界ではなく拍の連続位置。
 *
 * v0.3: コードセルの上に出来事の旗を立てる。旗は常にレール上に見え、
 * 来てから突然出さない。先が読めることが本体。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChordEvent, ScoreEvent } from '@/model/types'
import { beatsPerBar } from '@/model/types'
import { eventClassName, EVENT_STRENGTH } from '@/analysis/events'
import { transport } from '@/engine/transport'
import { useAnimationFrame } from './usePlayhead'

export interface ChordRailLayout {
  cells: { chord: ChordEvent; left: number; width: number }[]
  width: number
  beats: number
}

const MIN_CELL_W = 44

export function layoutChords(
  chords: ChordEvent[],
  pxPerBeat: number,
  totalBeats?: number,
): ChordRailLayout {
  const cells: ChordRailLayout['cells'] = []
  let end = totalBeats ?? 0
  for (const chord of chords) {
    // 拍位置基準。隙間や開始オフセットがあってもヘッド (beat * px) と一致する。
    const left = chord.time * pxPerBeat
    const width = Math.max(MIN_CELL_W, chord.duration * pxPerBeat)
    cells.push({ chord, left, width })
    end = Math.max(end, chord.time + chord.duration)
  }
  const beats = Math.max(end, 1)
  return { cells, width: Math.max(beats * pxPerBeat, 1), beats }
}

interface Props {
  chords: ChordEvent[]
  events: ScoreEvent[]
  pxPerBeat: number
  timeSig: [number, number]
  /** 全拍数。App 側の totalBeats を渡すと Staff と幅が揃う。 */
  totalBeats?: number
  /** Tutorial の「弾く」中はシークを止める。 */
  seekLocked: boolean
  mode: string
  /** 再生ヘッドへの追従。OFF の間は手動スクロールを奪わない。 */
  follow: boolean
  onFollowChange?(follow: boolean): void
  onZoom?(pxPerBeat: number): void
  onSeek(beat: number): void
  onSelectChord?(chord: ChordEvent): void
  onEventClick?(event: ScoreEvent): void
  onAuditionChord?(chord: ChordEvent): void
  /** 試聴中のコード。セルを強調する。 */
  auditionChordId?: string | null
  /** 現在キーの区間。背景淡色をキーごとにずらす。 */
  keySpans: { start: number; end: number; tone: string }[]
}

export function ChordRail({
  chords,
  events,
  pxPerBeat,
  timeSig,
  totalBeats,
  seekLocked,
  mode,
  follow,
  onFollowChange,
  onZoom,
  onSeek,
  onSelectChord,
  onEventClick,
  onAuditionChord,
  auditionChordId,
  keySpans,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const programmatic = useRef(false)
  const prevPx = useRef(pxPerBeat)
  const [activeIndex, setActiveIndex] = useState(-1)
  const lastIndex = useRef(-1)
  const barBeats = beatsPerBar(timeSig)
  const layout = useMemo(
    () => layoutChords(chords, pxPerBeat, totalBeats),
    [chords, pxPerBeat, totalBeats],
  )

  const beatToX = (beat: number) => beat * pxPerBeat

  // Ctrl+ホイールでズーム。React の onWheel は passive のため native で拾う。
  const zoomRef = useRef(onZoom)
  zoomRef.current = onZoom
  const pxRef = useRef(pxPerBeat)
  pxRef.current = pxPerBeat
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -8 : 8
      zoomRef.current?.(Math.min(200, Math.max(16, pxRef.current + delta)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ズームで左端の拍を保つ。scrollLeft を比率で引き継ぐ。
  useEffect(() => {
    const el = scrollRef.current
    const prev = prevPx.current
    prevPx.current = pxPerBeat
    if (!el || prev === pxPerBeat) return
    programmatic.current = true
    el.scrollLeft = (el.scrollLeft / prev) * pxPerBeat
    requestAnimationFrame(() => {
      programmatic.current = false
    })
  }, [pxPerBeat])

  useAnimationFrame((beat) => {
    const head = headRef.current
    if (head) head.style.transform = `translateX(${beatToX(beat)}px)`

    let index = -1
    for (let i = 0; i < chords.length; i += 1) {
      const c = chords[i]
      if (beat >= c.time && beat < c.time + c.duration) {
        index = i
        break
      }
    }
    if (index !== lastIndex.current) {
      lastIndex.current = index
      setActiveIndex(index)
    }
  })

  // 追従は再生中かつ follow=ON のときだけ。停止中や OFF 中は手を出さない。
  useAnimationFrame((beat) => {
    if (!follow) return
    if (transport.transportState !== 'started') return
    const el = scrollRef.current
    if (!el) return
    const x = beatToX(beat)
    const margin = el.clientWidth * 0.38
    const target = Math.max(0, x - margin)
    // 既に視界内なら動かさない。端まで来たら寄せる。
    if (target > el.scrollLeft - 2 && target < el.scrollLeft + 2) return
    if (x > el.scrollLeft && x < el.scrollLeft + el.clientWidth) return
    programmatic.current = true
    el.scrollTo({ left: target, behavior: 'auto' })
    requestAnimationFrame(() => {
      programmatic.current = false
    })
  }, true)

  const handleScroll = () => {
    if (programmatic.current) return
    // ユーザーが手で動かしたら追従を切る。再生中の奪い合いを止める。
    if (follow && transport.transportState === 'started') onFollowChange?.(false)
  }

  const jumpToHead = () => {
    const el = scrollRef.current
    if (!el) return
    onFollowChange?.(true)
    programmatic.current = true
    el.scrollTo({ left: Math.max(0, beatToX(transport.beat) - el.clientWidth * 0.38) })
    requestAnimationFrame(() => {
      programmatic.current = false
    })
  }

  const flagHeight: Record<ScoreEvent['kind'], number> = {
    modulation: 26,
    author: 26,
    cadence: 16,
    meter: 16,
    tonicization: 10,
  }

  return (
    <div className="rail">
      <div className="rail-tools">
        {!follow ? (
          <button type="button" className="btn btn-tiny" onClick={jumpToHead} title="再生ヘッドに追従を戻す">
            ▸ 追従に戻す
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-tiny is-on"
            onClick={() => onFollowChange?.(false)}
            title="自動追従を切り、手動スクロールを優先する"
          >
            追従中
          </button>
        )}
      </div>
      <div className="rail-scroll" ref={scrollRef} onScroll={handleScroll}>
        <div className="rail-inner" style={{ width: layout.width }}>
          {keySpans.map((span) => (
            <div
              key={`span-${span.start}`}
              className="rail-keyband"
              style={{ left: beatToX(span.start), width: beatToX(span.end - span.start) }}
            >
              <span className="rail-keyband-label">{span.tone}</span>
            </div>
          ))}

          {layout.cells.map(({ chord, left, width }) => {
            const isActive = chords[activeIndex]?.id === chord.id
            const isAudition = auditionChordId === chord.id
            const classes = ['rail-cell']
            if (isActive) classes.push('is-active')
            if (beatBefore(chord, layout, activeIndex)) classes.push('is-past')
            if (mode === 'analyze') classes.push('is-editable')
            if (isAudition) classes.push('is-audition')
            return (
              <div key={chord.id} className="rail-cell-wrap" style={{ left, width }}>
                <button
                  type="button"
                  className={classes.join(' ')}
                  style={{ width: '100%' }}
                  onClick={() => {
                    if (seekLocked) return
                    onSeek(chord.time)
                    onSelectChord?.(chord)
                  }}
                  onDoubleClick={() => onAuditionChord?.(chord)}
                  title={`${chord.symbol || 'コードなし'} / ${chord.candidates.join(', ') || '候補なし'} (ダブルクリックで試聴)`}
                >
                  <span className="rail-cell-symbol">{chord.symbol || '—'}</span>
                  {chord.roman ? <span className="rail-cell-roman">{chord.roman}</span> : null}
                  {chord.candidates.length > 1 ? (
                    <span className="rail-cell-candidates">{chord.candidates.slice(1, 4).join(' / ')}</span>
                  ) : null}
                </button>
                {onAuditionChord ? (
                  <button
                    type="button"
                    className="rail-audition"
                    onClick={(e) => {
                      e.stopPropagation()
                      onAuditionChord(chord)
                    }}
                    title={`${chord.symbol || 'コード'} を試聴`}
                    aria-label={`${chord.symbol || 'コード'}を試聴`}
                  >
                    ♪
                  </button>
                ) : null}
              </div>
            )
          })}

          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              className={`rail-flag ${eventClassName(event)} strength-${EVENT_STRENGTH[event.kind]}`}
              style={{
                left: beatToX(event.time),
                height: flagHeight[event.kind],
                width: Math.max(10, (event.duration ?? 0) * pxPerBeat),
              }}
              onClick={() => onEventClick?.(event)}
              title={`${event.kind} / ${event.label} / 信頼度 ${(event.confidence * 100).toFixed(0)}%`}
            >
              <span className="rail-flag-label">{event.label}</span>
            </button>
          ))}

          {/* 拍の連続位置。セル境界ではない。 */}
          <div className="rail-head" ref={headRef} />
          {barTicks(layout.beats, barBeats).map((beat) => (
            <div key={`bar-${beat}`} className="rail-bar" style={{ left: beatToX(beat) }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function beatBefore(
  chord: ChordEvent,
  layout: ChordRailLayout,
  activeIndex: number,
): boolean {
  const index = layout.cells.findIndex((c) => c.chord.id === chord.id)
  return activeIndex >= 0 && index < activeIndex
}

function barTicks(totalBeats: number, barBeats: number): number[] {
  const out: number[] = []
  for (let beat = 0; beat <= totalBeats + 0.001; beat += barBeats) out.push(beat)
  return out
}
