/**
 * v0.2 3.1: 1 セル = 1 ChordEvent。既定は 1 小節。
 * 解析の窓と表示の窓を同じにする。
 * 再生ヘッドはセル境界ではなく拍の連続位置。
 *
 * v0.3: コードセルの上に出来事の旗を立てる。旗は常にレール上に見え、
 * 来てから突然出さない。先が読めることが本体。
 */
import { useMemo, useRef, useState } from 'react'
import type { ChordEvent, ScoreEvent } from '@/model/types'
import { beatsPerBar } from '@/model/types'
import { eventClassName, EVENT_STRENGTH } from '@/analysis/events'
import { useAnimationFrame } from './usePlayhead'

export interface ChordRailLayout {
  cells: { chord: ChordEvent; left: number; width: number }[]
  width: number
  beats: number
}

export function layoutChords(chords: ChordEvent[], pxPerBeat: number): ChordRailLayout {
  const cells: ChordRailLayout['cells'] = []
  let left = 0
  for (const chord of chords) {
    const width = Math.max(56, chord.duration * pxPerBeat)
    cells.push({ chord, left, width })
    left += width
  }
  return { cells, width: Math.max(left, 1), beats: left / pxPerBeat }
}

interface Props {
  chords: ChordEvent[]
  events: ScoreEvent[]
  pxPerBeat: number
  timeSig: [number, number]
  /** Tutorial の「弾く」中はシークを止める。 */
  seekLocked: boolean
  mode: string
  onSeek(beat: number): void
  onSelectChord?(chord: ChordEvent): void
  onEventClick?(event: ScoreEvent): void
  /** 現在キーの区間。背景淡色をキーごとにずらす。 */
  keySpans: { start: number; end: number; tone: string }[]
}

export function ChordRail({
  chords,
  events,
  pxPerBeat,
  timeSig,
  seekLocked,
  mode,
  onSeek,
  onSelectChord,
  onEventClick,
  keySpans,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const lastIndex = useRef(-1)
  const barBeats = beatsPerBar(timeSig)
  const layout = useMemo(() => layoutChords(chords, pxPerBeat), [chords, pxPerBeat])

  const beatToX = (beat: number) => beat * pxPerBeat

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

  // レールが横へ滑って現在を中央に保つ。
  useAnimationFrame((beat) => {
    const el = scrollRef.current
    if (!el) return
    const x = beatToX(beat)
    const margin = el.clientWidth * 0.38
    if (x - margin > el.scrollLeft && x - margin < el.scrollLeft + el.clientWidth) return
    el.scrollTo({ left: Math.max(0, x - margin), behavior: 'smooth' })
  }, true)

  const flagHeight: Record<ScoreEvent['kind'], number> = {
    modulation: 26,
    author: 26,
    cadence: 16,
    meter: 16,
    tonicization: 10,
  }

  return (
    <div className="rail">
      <div className="rail-scroll" ref={scrollRef}>
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
            const classes = ['rail-cell']
            if (isActive) classes.push('is-active')
            if (beatBefore(chord, layout, activeIndex)) classes.push('is-past')
            if (mode === 'analyze') classes.push('is-editable')
            return (
              <button
                key={chord.id}
                type="button"
                className={classes.join(' ')}
                style={{ left, width }}
                onClick={() => {
                  if (seekLocked) return
                  onSeek(chord.time)
                  onSelectChord?.(chord)
                }}
                title={`${chord.symbol || 'コードなし'} / ${chord.candidates.join(', ') || '候補なし'}`}
              >
                <span className="rail-cell-symbol">{chord.symbol || '—'}</span>
                {chord.roman ? <span className="rail-cell-roman">{chord.roman}</span> : null}
                {chord.candidates.length > 1 ? (
                  <span className="rail-cell-candidates">{chord.candidates.slice(1, 4).join(' / ')}</span>
                ) : null}
              </button>
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