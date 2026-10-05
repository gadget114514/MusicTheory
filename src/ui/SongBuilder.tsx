/**
 * 作曲パネル。和音を選んで鳴らし、ルールに従って並べて曲っぽくする。
 * tonal は候補を出すだけ、発音は engine/chordAudition に任せる。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  auditionChord,
  auditionProgression,
  stopAudition,
} from '@/engine/chordAudition'
import {
  borrowedChoices,
  diatonicChoices,
  generateProgression,
  presetToChoices,
  PROGRESSION_PRESETS,
  type ProgressionChoice,
} from '@/theory/progression'
import type { KeyRef } from '@/theory'

interface Props {
  musicKey: KeyRef
  bpm: number
  barBeats: number
  onApply(entries: ProgressionChoice[], mode: 'append' | 'replace'): void
}

export function SongBuilder({ musicKey, bpm, barBeats, onApply }: Props) {
  const [presetId, setPresetId] = useState('jun')
  const [bars, setBars] = useState(4)
  const [progression, setProgression] = useState<ProgressionChoice[]>(() =>
    presetToChoices(musicKey, 'jun'),
  )
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)
  const [playingAll, setPlayingAll] = useState(false)

  const palette = useMemo(() => diatonicChoices(musicKey), [musicKey])
  const borrowed = useMemo(() => borrowedChoices(musicKey), [musicKey])

  useEffect(() => () => stopAudition(), [])

  const stopAll = () => {
    stopAudition()
    setPlayingAll(false)
    setPlayingIndex(null)
  }

  const playSingle = (symbol: string, index?: number) => {
    stopAll()
    if (!symbol) return
    if (index !== undefined) setPlayingIndex(index)
    auditionChord(symbol, Math.max(0.9, Math.min(2.2, (barBeats * 60) / Math.max(20, bpm))))
    window.setTimeout(() => setPlayingIndex((v) => (index === undefined ? null : v === index ? null : v)), 1200)
  }

  const playAll = () => {
    if (progression.length === 0) return
    stopAll()
    setPlayingAll(true)
    const events = progression.map((p, i) => ({
      id: `song-${i}`,
      time: i * barBeats,
      duration: barBeats,
      symbol: p.symbol,
      candidates: [p.symbol],
      confidence: 1 as const,
    }))
    auditionProgression(events, bpm, {
      onChord: (_chord, idx) => setPlayingIndex(idx),
      onDone: () => {
        setPlayingAll(false)
        setPlayingIndex(null)
      },
    })
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= progression.length) return
    const copy = [...progression]
    const [item] = copy.splice(index, 1)
    copy.splice(next, 0, item!)
    setProgression(copy)
  }

  const removeAt = (index: number) => {
    setProgression(progression.filter((_, i) => i !== index))
  }

  return (
    <div className="song">
      <div className="song-head">
        <strong>作曲: 和音を並べる</strong>
        <span className="song-key">
          {musicKey.name} / {bpm} BPM / 1和音{barBeats}拍
        </span>
      </div>

      <div className="song-row">
        <span className="song-label">パレット (押すと鳴る)</span>
        <div className="song-palette">
          {palette.map((c) => (
            <span key={c.roman} className="song-chord">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => playSingle(c.symbol)}
                title={`${c.symbol} (${c.roman}) を試聴`}
              >
                {c.symbol}
                <em>{c.roman}</em>
              </button>
              <button
                type="button"
                className="btn btn-tiny"
                onClick={() => setProgression([...progression, c])}
                title={`${c.symbol} を進行に追加`}
              >
                +
              </button>
            </span>
          ))}
          {borrowed.map((c) => (
            <span key={c.symbol} className="song-chord is-borrowed">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => playSingle(c.symbol)}
                title={`${c.symbol} (${c.roman}) を試聴`}
              >
                {c.symbol}
                <em>{c.roman}</em>
              </button>
              <button
                type="button"
                className="btn btn-tiny"
                onClick={() => setProgression([...progression, c])}
                title={`${c.symbol} を進行に追加`}
              >
                +
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="song-row">
        <span className="song-label">ルールで生成</span>
        <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {PROGRESSION_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <select value={bars} onChange={(e) => setBars(Number(e.target.value))}>
          <option value={4}>4小節</option>
          <option value={8}>8小節</option>
        </select>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => setProgression(presetToChoices(musicKey, presetId))}
        >
          プリセット
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => setProgression(generateProgression(musicKey, bars))}
        >
          自動作曲 ({bars}小節)
        </button>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={() => {
            stopAll()
            setProgression([])
          }}
        >
          消去
        </button>
      </div>

      <div className="song-row">
        <span className="song-label">進行 ({progression.length}和音)</span>
        <div className="song-slots">
          {progression.length === 0 ? (
            <span className="song-empty">パレットの + か自動作曲で和音を並べてください。</span>
          ) : (
            progression.map((c, i) => (
              <span
                key={`${c.symbol}-${i}`}
                className={`song-slot${playingIndex === i ? ' is-playing' : ''}`}
              >
                <button
                  type="button"
                  className="song-slot-main"
                  onClick={() => playSingle(c.symbol, i)}
                  title={`${c.symbol} を鳴らす`}
                >
                  {i + 1}. {c.symbol}
                  <em>{c.roman}</em>
                </button>
                <button type="button" className="btn btn-tiny" onClick={() => move(i, -1)} title="前へ">
                  ←
                </button>
                <button type="button" className="btn btn-tiny" onClick={() => move(i, 1)} title="後ろへ">
                  →
                </button>
                <button type="button" className="btn btn-tiny" onClick={() => removeAt(i)} title="外す">
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="song-row song-actions">
        {playingAll ? (
          <button type="button" className="btn btn-small" onClick={stopAll}>
            ■ 停止
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-small"
            onClick={playAll}
            disabled={progression.length === 0}
          >
            ▶ 進行を鳴らす
          </button>
        )}
        <button
          type="button"
          className="btn btn-small"
          onClick={() => onApply(progression, 'append')}
          disabled={progression.length === 0}
          title="スコアの末尾にコードとブロックコード音符を足す"
        >
          スコア末尾に追加
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => onApply(progression, 'replace')}
          disabled={progression.length === 0}
          title="スコアのコードと sample 音符をこの進行で置き換える"
        >
          スコア置き換え
        </button>
      </div>
    </div>
  )
}
