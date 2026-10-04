/**
 * v0.2 3.2: 楽譜は従表示。
 * 五線レンダラは自前で書かない。「MIDI の音符を拍位置に置いた簡略表示」で足りる。
 * カーソルは再生拍から計算し、再描画に同期を預けない。
 */
import { useMemo, useRef } from 'react'
import type { ChordEvent, NoteEvent, ScoreEvent } from '@/model/types'
import { beatsPerBar } from '@/model/types'
import { noteName } from './Keyboard'
import { useAnimationFrame } from './usePlayhead'

interface Props {
  notes: NoteEvent[]
  chords: ChordEvent[]
  events: ScoreEvent[]
  pxPerBeat: number
  timeSig: [number, number]
  /** 「コード + 楽譜」でもレールの歌詞を出すか。 */
  showChordLabels: boolean
}

const ROW_H = 9

export function StaffView({
  notes,
  chords,
  events,
  pxPerBeat,
  timeSig,
  showChordLabels,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const barBeats = beatsPerBar(timeSig)

  const bounds = useMemo(() => {
    if (notes.length === 0) return { low: 48, high: 72 }
    let low = 127
    let high = 0
    for (const n of notes) {
      low = Math.min(low, n.midi)
      high = Math.max(high, n.midi)
    }
    const pad = Math.max(2, Math.round((high - low) * 0.15))
    return { low: Math.max(21, low - pad), high: Math.min(108, high + pad) }
  }, [notes])

  const totalBeats = useMemo(() => {
    const notesEnd = notes.reduce((m, n) => Math.max(m, n.time + n.duration), 0)
    const chordsEnd = chords.reduce((m, c) => Math.max(m, c.time + c.duration), 0)
    return Math.max(notesEnd, chordsEnd, barBeats)
  }, [notes, chords, barBeats])

  const width = totalBeats * pxPerBeat
  const rows = bounds.high - bounds.low + 1
  const height = rows * ROW_H

  useAnimationFrame((beat) => {
    const cursor = cursorRef.current
    if (cursor) cursor.style.transform = `translateX(${beat * pxPerBeat}px)`
    const el = scrollRef.current
    if (!el) return
    const x = beat * pxPerBeat
    const margin = el.clientWidth * 0.4
    if (x - margin > el.scrollLeft && x - margin < el.scrollLeft + el.clientWidth) return
    el.scrollTo({ left: Math.max(0, x - margin), behavior: 'smooth' })
  })

  const yOf = (midi: number) => (bounds.high - midi) * ROW_H + ROW_H / 2

  return (
    <div className="staff">
      <div className="staff-scroll" ref={scrollRef}>
        <div className="staff-inner" style={{ width, height: height + 22 }}>
          {showChordLabels
            ? chords.map((chord) => (
                <span
                  key={`lbl-${chord.id}`}
                  className="staff-chord-label"
                  style={{ left: chord.time * pxPerBeat }}
                >
                  {chord.symbol || '—'}
                  {chord.roman ? ` (${chord.roman})` : ''}
                </span>
              ))
            : null}

          {Array.from({ length: rows }, (_, i) => {
            const midi = bounds.high - i
            return (
              <div
                key={`row-${midi}`}
                className={`staff-row${midi % 12 === 0 ? ' is-c' : ''}`}
                style={{ top: i * ROW_H }}
              >
                {midi % 12 === 0 ? <span className="staff-octave">C{Math.floor(midi / 12) - 1}</span> : null}
              </div>
            )
          })}

          {notes.map((note) => (
            <div
              key={note.id}
              className={`staff-note staff-note-${note.source}`}
              style={{
                left: note.time * pxPerBeat,
                width: Math.max(4, note.duration * pxPerBeat - 2),
                top: yOf(note.midi) - 3,
                opacity: 0.45 + (note.velocity / 127) * 0.55,
              }}
              title={`${noteName(note.midi)} @ ${note.time.toFixed(2)}拍`}
            />
          ))}

          {events.map((event) => (
            <div
              key={`ev-${event.id}`}
              className="staff-event"
              style={{ left: event.time * pxPerBeat }}
              title={event.label}
            />
          ))}

          <div className="staff-cursor" ref={cursorRef} />
        </div>
      </div>
      <div className="staff-hint">
        浄書ではありません。音の拍位置だけを並べた従表示です。
      </div>
    </div>
  )
}