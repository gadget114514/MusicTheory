/**
 * v0.2 1 章: 解析画面的下段。
 * MIDI を読み、chords を埋める。音は Playback と同じ。
 */
import type { AnalyzeSettings } from '@/store/score'
import type { ChordEvent, ScoreEvent } from '@/model/types'
import { beatsPerBar } from '@/model/types'
import { isDiatonicChord, romanNumeral, type KeyRef } from '@/theory'
import { eventClassName } from '@/analysis/events'

interface Props {
  analyze: AnalyzeSettings
  chords: ChordEvent[]
  events: ScoreEvent[]
  timeSig: [number, number]
  displayKey: KeyRef
  barBeats: number
  selectedChordId: string | null
  onPatch(patch: Partial<AnalyzeSettings>): void
  onSelect(chord: ChordEvent): void
  onPickSymbol(chordId: string, symbol: string): void
  onReanalyze(): void
  onEventClick(event: ScoreEvent): void
}

export function AnalyzePanel({
  analyze,
  chords,
  events,
  timeSig,
  displayKey,
  selectedChordId,
  onPatch,
  onSelect,
  onPickSymbol,
  onReanalyze,
  onEventClick,
}: Props) {
  const barBeats = beatsPerBar(timeSig)
  const authors = events.filter((e) => e.source === 'author')
  const detected = events.filter((e) => e.source === 'detected')

  return (
    <div className="analyze">
      <div className="analyze-controls">
        <label>
          窓
          <select
            value={analyze.windowBeats}
            onChange={(e) => onPatch({ windowBeats: Number(e.target.value) })}
          >
            <option value={0}>1 小節</option>
            <option value={barBeats / 2}>2 拍</option>
            <option value={barBeats * 2}>2 小節</option>
            <option value={barBeats * 4}>4 小節</option>
          </select>
        </label>
        <label>
          持続の閾値
          <input
            type="range"
            min={0}
            max={0.9}
            step={0.05}
            value={analyze.sustainRatio}
            onChange={(e) => onPatch({ sustainRatio: Number(e.target.value) })}
          />
          <em>{(analyze.sustainRatio * 100).toFixed(0)}%</em>
        </label>
        <label className="analyze-check">
          <input
            type="checkbox"
            checked={analyze.excludeMelody}
            onChange={(e) => onPatch({ excludeMelody: e.target.checked })}
          />
          最高音を外す
        </label>
        <label className="analyze-check">
          <input
            type="checkbox"
            checked={analyze.assumePerfectFifth}
            onChange={(e) => onPatch({ assumePerfectFifth: e.target.checked })}
          />
          空なら完全五度を仮定
        </label>
        <label>
          キー
          <input
            type="text"
            placeholder="C / Am / F# minor"
            value={analyze.keyHint}
            onChange={(e) => onPatch({ keyHint: e.target.value })}
          />
        </label>
        <label className="analyze-check">
          <input
            type="checkbox"
            checked={analyze.autoEvents}
            onChange={(e) => onPatch({ autoEvents: e.target.checked })}
          />
          転調フラグを推定
        </label>
        <button type="button" className="btn btn-small" onClick={onReanalyze}>
          再解析
        </button>
      </div>

      <div className="analyze-body">
        <div className="analyze-chords">
          <div className="analyze-head">コード候補 ({chords.length} セル)</div>
          <ul className="chord-list">
            {chords.map((chord) => {
              const diatonic = chord.symbol ? isDiatonicChord(chord.symbol, displayKey) : false
              return (
                <li
                  key={chord.id}
                  className={`chord-row${selectedChordId === chord.id ? ' is-selected' : ''}`}
                  onClick={() => onSelect(chord)}
                >
                  <span className="chord-row-bar">
                    小節 {Math.floor(chord.time / barBeats) + 1} / 拍 {chord.time.toFixed(0)}
                  </span>
                  <span className={`chord-row-symbol${diatonic ? ' is-diatonic' : ''}`}>
                    {chord.symbol || '—'}
                  </span>
                  <span className="chord-row-roman">
                    {chord.roman ?? romanNumeral(chord.symbol, displayKey) ?? '—'}
                  </span>
                  <span className="chord-row-conf">
                    {(chord.confidence * 100).toFixed(0)}%
                  </span>
                  <span className="chord-row-cands">
                    {chord.candidates.slice(0, 5).map((symbol) => (
                      <button
                        key={symbol}
                        type="button"
                        className="cand"
                        onClick={(e) => {
                          e.stopPropagation()
                          onPickSymbol(chord.id, symbol)
                        }}
                      >
                        {symbol}
                      </button>
                    ))}
                    {chord.candidates.length === 0 ? <em>候補なし</em> : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="analyze-events">
          <div className="analyze-head">出来事の旗</div>
          <p className="analyze-note">
            作者旗 {authors.length} 本 / 推定旗 {detected.length} 本。実線が作者、点線が推定です。
          </p>
          <ul className="event-list">
            {[...authors, ...detected].map((event) => (
              <li key={event.id} className="event-row">
                <button
                  type="button"
                  className={`event-chip ${eventClassName(event)}`}
                  onClick={() => onEventClick(event)}
                >
                  {event.kind}
                </button>
                <span className="event-time">拍 {event.time.toFixed(0)}</span>
                <span className="event-label">{event.label}</span>
                <span className="event-conf">{(event.confidence * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}