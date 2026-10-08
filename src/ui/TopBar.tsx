/**
 * v0.2 1 章: 上バーは高さ 48px 固定。
 * 再生、BPM、キー、ループ、MIDI を開く。モード切替は持たせすぎない。
 */
import { useEffect, useState } from 'react'
import type { AppMode, Quantize } from '@/model/types'

const MODES: { id: AppMode; label: string; hint: string }[] = [
  { id: 'tutorial', label: 'チュートリアル', hint: 'TutorialRunner が Transport と Input にポリシーを被せる' },
  { id: 'play', label: '再生', hint: '記録しない' },
  { id: 'record', label: '録音', hint: 'source:user のレーンに積む' },
  { id: 'analyze', label: '解析', hint: 'MIDI を窓切りして Chord.detect' },
]

interface Props {
  mode: AppMode
  title: string
  projectName: string | null
  dirty: boolean
  playing: boolean
  bpm: number
  keyLabel: string
  loopEnabled: boolean
  loopLabel: string
  metronome: boolean
  recording: boolean
  quantize: Quantize
  runtimeLabel: string
  midiStatus: string
  midiDevices: string[]
  upperView: string
  onMode(mode: AppMode): void
  onPlay(): void
  onStop(): void
  onReturn(): void
  onBpm(value: number): void
  onLoop(enabled: boolean): void
  onMetronome(value: boolean): void
  onQuantize(value: Quantize): void
  onUpperView(value: string): void
  onOpenMidi(): void
  onOpenProject(): void
  onSave(): void
  onNew(): void
  onLoadSample(id: string): void
  onStartLesson(id: string): void
  onRequestMidi(): void
  samples: { id: string; title: string }[]
  lessons: { id: string; title: string }[]
}

export function TopBar(props: Props) {
  const [menu, setMenu] = useState<'none' | 'sample' | 'lesson'>('none')

  useEffect(() => {
    if (menu === 'none') return
    const close = () => setMenu('none')
    window.addEventListener('click', close, { once: true })
    return () => window.removeEventListener('click', close)
  }, [menu])

  return (
    <header className="topbar" onClick={(e) => e.stopPropagation()}>
      <div className="topbar-group">
        <button
          type="button"
          className="btn btn-icon"
          onClick={props.onReturn}
          title="先頭に戻る (Home)"
        >
          ⏮
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={props.onPlay}
          title={props.playing ? '一時停止' : '再生 (Space)'}
        >
          {props.playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className="btn btn-icon" onClick={props.onStop} title="停止">
          ■
        </button>
        <button
          type="button"
          className={`btn btn-icon${props.recording ? ' is-rec' : ''}`}
          onClick={() => props.onMode(props.mode === 'record' ? 'play' : 'record')}
          title="録音を入れる / 切る"
        >
          ●
        </button>
      </div>

      <label className="topbar-field">
        BPM
        <input
          type="number"
          min={20}
          max={300}
          step={1}
          value={props.bpm}
          onChange={(e) => props.onBpm(Number(e.target.value) || 100)}
        />
      </label>

      <span className="key-badge" title="現在のキー。v0.3 の旗を通過すると切り替わる。">
        {props.keyLabel}
      </span>

      <button
        type="button"
        className={`btn btn-small${props.loopEnabled ? ' is-on' : ''}`}
        onClick={() => props.onLoop(!props.loopEnabled)}
        title={props.loopLabel}
      >
        ループ {props.loopEnabled ? '入' : '切'}
      </button>

      <button
        type="button"
        className={`btn btn-small${props.metronome ? ' is-on' : ''}`}
        onClick={() => props.onMetronome(!props.metronome)}
      >
        メトロノーム
      </button>

      <label className="topbar-field">
        量子化
        <select
          value={props.quantize}
          onChange={(e) => props.onQuantize(e.target.value as Quantize)}
          disabled={props.mode !== 'record'}
        >
          <option value="off">なし</option>
          <option value="1/8">1/8</option>
          <option value="1/16">1/16</option>
        </select>
      </label>

      <div className="topbar-modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`btn btn-mode${props.mode === m.id ? ' is-on' : ''}`}
            title={m.hint}
            onClick={() => props.onMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="topbar-group topbar-right">
        <label className="topbar-field">
          上半分
          <select value={props.upperView} onChange={(e) => props.onUpperView(e.target.value)}>
            <option value="chords">コードのみ</option>
            <option value="chords+staff">コード + 楽譜</option>
            <option value="staff">楽譜のみ</option>
          </select>
        </label>

        <button type="button" className="btn btn-small" onClick={() => setMenu(menu === 'sample' ? 'none' : 'sample')}>
          サンプル
        </button>
        <button type="button" className="btn btn-small" onClick={() => setMenu(menu === 'lesson' ? 'none' : 'lesson')}>
          レッスン
        </button>
        {menu !== 'none' ? (
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            <div className="menu-label">{menu === 'sample' ? '内蔵サンプル (自作)' : 'レッスン'}</div>
            {menu === 'sample'
              ? props.samples.map((s) => (
                  <button key={s.id} type="button" className="menu-item" onClick={() => { setMenu('none'); props.onLoadSample(s.id) }}>
                    {s.title}
                  </button>
                ))
              : props.lessons.map((l) => (
                  <button key={l.id} type="button" className="menu-item" onClick={() => { setMenu('none'); props.onStartLesson(l.id) }}>
                    {l.title}
                  </button>
                ))}
          </div>
        ) : null}

        <button type="button" className="btn btn-small" onClick={props.onOpenMidi}>
          MIDI を開く
        </button>
        <button type="button" className="btn btn-small" onClick={props.onOpenProject}>
          開く
        </button>
        <button type="button" className="btn btn-small" onClick={props.onSave}>
          保存{props.dirty ? ' *' : ''}
        </button>
        <button type="button" className="btn btn-small" onClick={props.onNew}>
          新規
        </button>

        <button
          type="button"
          className="btn btn-small"
          onClick={props.onRequestMidi}
          title={props.midiDevices.length ? props.midiDevices.join(' / ') : '外部MIDI を要求'}
        >
          MIDI 入力: {props.midiStatus}
        </button>
      </div>

      <div className="topbar-title" title={props.projectName ?? props.title}>
        <span>{props.projectName ?? props.title}</span>
        <em>{props.runtimeLabel}</em>
      </div>
    </header>
  )
}