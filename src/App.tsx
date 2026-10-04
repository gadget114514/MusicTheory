import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnalyzePanel } from '@/ui/AnalyzePanel'
import { ChordRail } from '@/ui/ChordRail'
import { GuideRail } from '@/ui/GuideRail'
import { Keyboard } from '@/ui/Keyboard'
import { StaffView } from '@/ui/StaffView'
import { TopBar } from '@/ui/TopBar'
import { useAnimationFrame } from '@/ui/usePlayhead'
import { useActiveMidis, useBeatLabel, useNowChord } from '@/ui/live'
import { allNotesOff, markTransportOrigin, noteOff, noteOn, setMetronome as applyMetronome } from '@/engine/audio'
import { inputRouter, type MidiStatus } from '@/engine/input'
import { player } from '@/engine/player'
import { recorder } from '@/engine/recorder'
import { transport } from '@/engine/transport'
import { analyzeNotes, keyLabel, midiToNotes, readMidiBytes, trackSummaries } from '@/analysis/chords'
import { detectScoreEvents, eventSentence, mergeEvents, resolveOrMakeKey, shouldGuide } from '@/analysis/events'
import { platform } from '@/platform'
import { lessonById, lessons, migrateScore, sampleById, samples } from '@/samples'
import { useStore } from '@/store/score'
import * as theoryApi from '@/theory'
import { chordPitchClasses, describeSymbol, expectedMidis } from '@/theory'
import { listeningLabel, tutorialRunner } from '@/tutorial/runner'
import {
  beatsPerBar,
  createEmptyScore,
  type AppMode,
  type ChordEvent,
  type ScoreDocument,
  type ScoreEvent,
  type UpperView,
} from '@/model/types'

const MODE_LABEL: Record<AppMode, string> = {
  tutorial: 'チュートリアル',
  play: '再生',
  record: '録音',
  analyze: '解析',
}

const PC_INDEX: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

function pcIndex(pc: string): number {
  return PC_INDEX[pc] ?? -1
}

// 開発時の検証用。Pages 用の本番ビルドには含まれない。
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__theoryDesk', {
    value: {
      store: useStore,
      transport,
      inputRouter,
      player,
      tutorialRunner,
      recorder,
      analysis: { analyzeNotes, detectScoreEvents, mergeEvents },
      catalog: { samples, lessons, sampleById, lessonById },
      theory: theoryApi,
    },
    configurable: true,
  })
}

export function App() {
  const state = useStore()
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [selectedChordId, setSelectedChordId] = useState<string | null>(null)
  const [transient, setTransient] = useState<{ text: string; key: string; until: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const store = useStore.getState
  const mode = state.mode
  const score = state.score
  const barBeats = beatsPerBar(score.meta.timeSig)
  const displayKey = state.displayKey
  const afterglowRef = useRef<{ pc: string; until: number } | null>(null)

  // ------------------------------------------------------------- 初期化
  useEffect(() => {
    store().setRuntimeLabel(platform.label)
    return inputRouter.onMidiStatus((midiStatus: MidiStatus, devices: string[]) => {
      store().setMidiInfo(midiStatusLabel(midiStatus), devices)
    })
  }, [])

  // 内蔵サンプルを最初の 1 枚として開いておく。
  useEffect(() => {
    const s = useStore.getState()
    if (s.score.notes.length === 0 && s.score.chords.length === 0) {
      const first = samples[0]
      if (first) {
        s.setScore(structuredClone(first.score), first.title, null)
        transport.setTempo(first.score.meta.bpm)
        player.load(first.score.notes, first.score.meta.bpm)
        player.refresh()
        s.setDisplayKey(keyFromMeta(first.score.meta))
      }
    }
  }, [])

  // ------------------------------------------------------------- 再生
  const play = useCallback(async () => {
    await transport.unlock()
    markTransportOrigin()
    player.startParts()
    await transport.play()
    setPlaying(true)
  }, [])

  const pause = useCallback(() => {
    transport.pause()
    player.stopParts()
    allNotesOff()
    setPlaying(false)
  }, [])

  const stop = useCallback(() => {
    transport.stop()
    player.stopParts()
    allNotesOff()
    inputRouter.allOff()
    useStore.getState().setPressedMidis([])
    useStore.getState().setRecording(false)
    setPlaying(false)
  }, [])

  // ------------------------------------------------------------- モード
  const stopRecording = useCallback(() => {
    const s = useStore.getState()
    if (!s.recording) return
    const notes = recorder.flush(s.quantize, beatsPerBar(s.score.meta.timeSig))
    if (notes.length > 0) s.addNotes(notes)
    s.setRecording(false)
  }, [])

  const startRecording = useCallback(() => {
    useStore.getState().setRecording(true)
    recorder.start()
  }, [])

  const setMode = useCallback(
    (next: AppMode) => {
      const s = useStore.getState()
      s.setMode(next)
      if (next !== 'record') stopRecording()
      // Tutorial 中はシークを止める。TutorialRunner が同じ Transport にポリシーを被せる。
      s.setSeekLocked(next === 'tutorial')
      if (next !== 'tutorial') {
        player.setSampleOnly(false)
        s.setExpectedPitchClasses([])
        tutorialRunner.load(null)
      } else {
        player.setSampleOnly(true)
        if (s.score.tutorial) tutorialRunner.load(s.score.tutorial)
      }
      player.refresh()
    },
    [stopRecording],
  )

  useEffect(() => {
    if (mode === 'record' && !state.recording) startRecording()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // モードが変わったら再生経路を揃える。sample と user で分岐させない。
  useEffect(() => {
    player.setSampleOnly(mode === 'tutorial')
    player.load(mode === 'tutorial' ? (score.tutorial?.score.notes ?? []) : score.notes, score.meta.bpm)
    player.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    transport.setTempo(score.meta.bpm)
    if (mode !== 'tutorial') {
      player.setBpm(score.meta.bpm)
      player.load(score.notes, score.meta.bpm)
      player.refresh()
    }
  }, [score.meta.bpm, score.notes, mode])

  useEffect(() => {
    applyMetronome(state.metronome)
  }, [state.metronome])

  // ------------------------------------------------------------- 入力
  const syncPressed = useCallback(() => {
    const pressed = inputRouter.heldMidis()
    const s = useStore.getState()
    s.setPressedMidis(pressed)
    s.setActiveMidis(pressed)
  }, [])

  useEffect(() => {
    const offOn = inputRouter.onNoteOn(({ midi, velocity }) => {
      noteOn(midi, velocity)
      const s = useStore.getState()
      if (s.mode === 'record' && s.recording) recorder.noteOn(midi, velocity)
      syncPressed()
    })
    const offOff = inputRouter.onNoteOff(({ midi }) => {
      noteOff(midi)
      const s = useStore.getState()
      if (s.mode === 'record' && s.recording) {
        const note = recorder.noteOff(midi, s.quantize, beatsPerBar(s.score.meta.timeSig))
        if (note) s.addNotes([note])
      }
      syncPressed()
    })
    return () => {
      offOn()
      offOff()
    }
  }, [syncPressed])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.code === 'Space') {
        event.preventDefault()
        if (transport.transportState === 'started') pause()
        else void play()
        return
      }
      const midi = inputRouter.handleComputerKeyDown(event)
      if (midi !== null) event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      inputRouter.handleComputerKeyUp(event)
    }
    const onBlur = () => {
      inputRouter.allOff()
      syncPressed()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [play, pause, syncPressed])

  // ------------------------------------------------------------- シーク / ループ
  const seek = useCallback((beat: number) => {
    if (useStore.getState().seekLocked) return
    transport.seek(beat)
    markTransportOrigin()
    setTransient(null)
  }, [])

  useEffect(
    () =>
      transport.onTick(() => {
        setPlaying(transport.transportState === 'started')
      }),
    [],
  )

  // v0.2 1 章: 全拍数は音符・コード・拍子から決める。
  const totalBeats = useMemo(
    () =>
      Math.max(
        barBeats,
        score.chords.reduce((m, c) => Math.max(m, c.time + c.duration), 0),
        score.notes.reduce((m, n) => Math.max(m, n.time + n.duration), 0),
      ),
    [score.chords, score.notes, barBeats],
  )

  // ループは拍単位。
  useEffect(() => {
    transport.setLoop(loop ? 0 : null, loop ? Math.ceil(totalBeats) : null)
  }, [loop, totalBeats])

  // ------------------------------------------------------------- v0.3 旗の通過
  const onEventPass = useCallback(
    (event: ScoreEvent, beat: number) => {
      const s = useStore.getState()
      if (event.kind === 'modulation' && event.toKey) {
        const nextKey = resolveOrMakeKey(event.toKey)
        if (nextKey.name !== s.displayKey.name) {
          // 旧主音だけ 1 小節残光。
          afterglowRef.current = { pc: s.displayKey.tonic, until: beat + barBeats }
          s.setAfterglow(s.displayKey.tonic, beat + barBeats)
          s.setDisplayKey(nextKey)
        }
      }
      if (shouldGuide(event)) {
        setTransient({
          text: eventSentence(event),
          key: `${event.id}:${Math.floor(beat)}`,
          until: performance.now() + 1500,
        })
      }
      // 音は止めない。Tutorial がその旗を課題にしているときだけ。
      if (event.pauseOnPass && s.mode === 'tutorial') tutorialRunner.notifyEventPass(event)
    },
    [barBeats],
  )

  useAnimationFrame((beat) => {
    const events = useStore.getState().score.events
    for (const event of events) {
      if (beat < event.time || beat > event.time + 0.25) continue
      onEventPass(event, beat)
    }
    if (afterglowRef.current && beat > afterglowRef.current.until) {
      afterglowRef.current = null
      useStore.getState().setAfterglow(null, 0)
    }
    if (transient && performance.now() > transient.until) setTransient(null)
    // 赤は 200ms で消す。残さない。
    const s = useStore.getState()
    if (s.wrongMidis.length > 0) {
      const now = performance.now()
      if (s.wrongMidis.every((midi) => now - (s.wrongStamp[midi] ?? 0) > 200)) s.clearWrong()
    }
  })

  // ------------------------------------------------------------- 点灯マップ
  const activeMidis = useActiveMidis(score.notes)
  const nowChord = useNowChord(score.chords)
  const beatLabel = useBeatLabel()

  const expectedSet = useMemo(() => {
    const set = new Set<number>()
    for (const midi of expectedMidis(state.expectedPitchClasses, { centerMidi: 60 })) {
      set.add(midi)
    }
    return set
  }, [state.expectedPitchClasses])

  const chordTones = useMemo(() => {
    const set = new Set<number>()
    const symbol = nowChord?.symbol ?? ''
    if (!symbol) return set
    const pcs = chordPitchClasses(symbol)
    for (const pc of pcs) {
      const index = pcIndex(pc)
      if (index < 0) continue
      for (let midi = 36; midi <= 96; midi += 1) {
        if (midi % 12 === index) set.add(midi)
      }
    }
    return set
  }, [nowChord])

  const lights = useMemo(
    () => ({
      active: new Set(activeMidis),
      expected: expectedSet,
      wrong: new Set(state.wrongMidis),
      afterglow:
        state.afterglowPitchClass !== null ? 60 + pcIndex(state.afterglowPitchClass) : null,
      chordTones,
      showDegrees: mode === 'tutorial',
      key: displayKey,
    }),
    [activeMidis, expectedSet, state.wrongMidis, state.afterglowPitchClass, chordTones, mode, displayKey],
  )

  // ------------------------------------------------------------- ファイル操作
  const loadScore = useCallback((next: ScoreDocument, name: string | null, path: string | null) => {
    const s = useStore.getState()
    transport.stop()
    player.stopParts()
    setPlaying(false)
    s.setScore(next, name, path)
    transport.setTempo(next.meta.bpm)
    player.load(next.notes, next.meta.bpm)
    player.setSampleOnly(false)
    player.refresh()
    s.setDisplayKey(keyFromMeta(next.meta))
    s.setMode(next.tutorial ? 'tutorial' : 'play')
    s.setSeekLocked(false)
    if (next.tutorial) tutorialRunner.load(next.tutorial)
    else tutorialRunner.load(null)
  }, [])

  const onOpenMidi = useCallback(async () => {
    const file = await platform.openMidi()
    if (!file) return
    try {
      const { midi } = readMidiBytes(file.data)
      const tracks = trackSummaries(midi)
      // v0.2: MIDI を読み、コードレールに ChordEvent を並べる。
      const bpm = midi.header.tempos[0]?.bpm ?? 100
      const sig = midi.header.timeSignatures[0]?.timeSignature
      const timeSig: [number, number] = sig ? [sig[0], sig[1]] : [4, 4]
      // 最もノートが多いトラックを正とする。メロディだけだとコードが出にくい。
      const best = [...tracks].sort((a, b) => b.notes - a.notes)[0]
      const notes = midiToNotes(midi, best?.index ?? 0)
      const meta = { title: file.name, tonic: 'C', scale: 'major', bpm: Math.round(bpm), timeSig }
      const analyze = useStore.getState().analyze
      const result = analyzeNotes(notes, meta, {
        windowBeats: analyze.windowBeats,
        sustainRatio: analyze.sustainRatio,
        excludeMelody: analyze.excludeMelody,
        assumePerfectFifth: analyze.assumePerfectFifth,
        keyHint: analyze.keyHint || null,
      })
      const keyRef = result.key ?? keyFromMeta(meta)
      // 推定は既定で無効 (v0.3 6 章「検出は最後」)。
      // 作者旗だけでレールが埋まる。作者旗が無い MIDI だけ推定を使う。
      const detected = analyze.autoEvents
        ? mergeEvents(
            [],
            detectScoreEvents(notes, result.chords, meta, keyRef),
            beatsPerBar(timeSig),
          )
        : []
      loadScore({ version: 1, meta, notes, chords: result.chords, events: detected }, file.name, file.path)
      useStore.getState().setMode('analyze')
      setNotice(`${file.name}: トラック ${tracks.length} 本 / ノート ${notes.length} 個 / 推定キー ${keyRef.name}`)
    } catch (error) {
      setNotice(`MIDI を読めませんでした: ${String(error)}`)
    }
  }, [loadScore])

  const onOpenProject = useCallback(async () => {
    const file = await platform.openProject()
    if (!file) return
    try {
      const parsed = migrateScore(JSON.parse(file.text))
      if (!parsed) {
        setNotice('プロジェクト形式ではありません。')
        return
      }
      loadScore(parsed, file.name, file.path)
      setNotice(`${file.name} を開きました。`)
    } catch (error) {
      setNotice(`開けませんでした: ${String(error)}`)
    }
  }, [loadScore])

  const onSave = useCallback(async () => {
    const s = useStore.getState()
    const name = s.projectName ?? s.score.meta.title
    const saved = await platform.saveProject(
      `${name}.tdesk.json`,
      JSON.stringify(
        {
          version: 1,
          meta: s.score.meta,
          notes: s.score.notes,
          chords: s.score.chords,
          events: s.score.events,
          tutorial: s.score.tutorial,
        },
        null,
        2,
      ),
    )
    useStore.getState().markClean()
    setNotice(saved ? `${saved} に保存しました。` : `${name}.tdesk.json を書き出しました。`)
  }, [])

  const onNew = useCallback(() => {
    loadScore(createEmptyScore(), null, null)
    setNotice('新規スコア。')
  }, [loadScore])

  const onLoadSample = useCallback(
    (id: string) => {
      const sample = sampleById(id)
      if (!sample) return
      loadScore(structuredClone(sample.score), sample.title, null)
      setNotice(`サンプル「${sample.title}」を読みました。`)
    },
    [loadScore],
  )

  const onStartLesson = useCallback(
    (id: string) => {
      const lesson = lessonById(id)
      if (!lesson) return
      const script = lesson.script
      const project: ScoreDocument = {
        version: 1,
        meta: { ...script.score.meta, title: `レッスン: ${lesson.title}` },
        notes: structuredClone(script.score.notes),
        chords: structuredClone(script.score.chords),
        events: structuredClone(script.score.events),
        tutorial: script,
      }
      loadScore(project, lesson.title, null)
      useStore.getState().setMode('tutorial')
      useStore.getState().setSeekLocked(true)
      tutorialRunner.load(script)
      setNotice(`レッスン「${lesson.title}」を開始。サンプルを「聞く」か、そのまま弾いてください。`)
    },
    [loadScore],
  )

  const onReanalyze = useCallback(() => {
    const s = useStore.getState()
    const analyze = s.analyze
    const result = analyzeNotes(s.score.notes, s.score.meta, {
      windowBeats: analyze.windowBeats,
      sustainRatio: analyze.sustainRatio,
      excludeMelody: analyze.excludeMelody,
      assumePerfectFifth: analyze.assumePerfectFifth,
      keyHint: analyze.keyHint || null,
    })
    const keyRef = result.key ?? keyFromMeta(s.score.meta)
    const authorEvents = s.score.events.filter((e) => e.source === 'author')
    const detected = analyze.autoEvents
      ? mergeEvents(
          authorEvents,
          detectScoreEvents(s.score.notes, result.chords, s.score.meta, keyRef),
          beatsPerBar(s.score.meta.timeSig),
        )
      : authorEvents
    s.setChords(result.chords)
    s.setEvents(detected)
    s.setDisplayKey(keyRef)
    setNotice('再解析しました。')
  }, [])

  const onEventClick = useCallback((event: ScoreEvent) => {
    const s = useStore.getState()
    if (event.source === 'detected') {
      // 「転調ではない」にする。作者旗として残す。
      s.updateEvent(event.id, {
        kind: 'tonicization',
        source: 'author',
        label: `${event.label} (転調ではないとして保持)`,
      })
      setNotice(`${event.label} を作者旗に直しました。`)
      return
    }
    s.updateEvent(event.id, { pauseOnPass: !event.pauseOnPass })
    setNotice(`${event.label}: この旗で止める = ${!event.pauseOnPass}`)
  }, [])

  // ------------------------------------------------------------- Tutorial
  const onListen = useCallback(() => void tutorialRunner.listen(), [])
  const onTry = useCallback(() => tutorialRunner.tryIt(), [])
  const onNext = useCallback(() => void tutorialRunner.next(), [])
  const onRestart = useCallback(() => {
    tutorialRunner.load(score.tutorial ?? null)
    setTransient(null)
  }, [score.tutorial])
  const onRequestMidi = useCallback(() => void inputRouter.requestMidi(), [])

  // ------------------------------------------------------------- 表示
  const pxPerBeat = state.railZoom
  const step = mode === 'tutorial' ? tutorialRunner.currentStep : null
  const keySpans = useMemo(
    () => keySpansFor(score.events, score.meta, totalBeats),
    [score.events, score.meta, totalBeats],
  )

  return (
    <div className="app">
      <TopBar
        mode={mode}
        title={score.meta.title}
        projectName={state.projectName}
        dirty={state.dirty}
        playing={playing}
        bpm={score.meta.bpm}
        keyLabel={keyLabel(displayKey, score.meta)}
        loopEnabled={loop}
        loopLabel={`ループ: 0 〜 ${Math.ceil(totalBeats)} 拍`}
        metronome={state.metronome}
        recording={state.recording}
        quantize={state.quantize}
        runtimeLabel={state.runtimeLabel}
        midiStatus={state.midiStatus}
        midiDevices={state.midiDevices}
        upperView={state.upperView}
        onMode={setMode}
        onPlay={() => (playing ? pause() : void play())}
        onStop={stop}
        onBpm={(value) => {
          useStore.getState().setBpm(value)
          transport.setTempo(value)
        }}
        onLoop={setLoop}
        onMetronome={(value) => useStore.getState().setMetronome(value)}
        onQuantize={(value) => useStore.getState().setQuantize(value)}
        onUpperView={(value) => useStore.getState().setUpperView(value as UpperView)}
        onOpenMidi={() => void onOpenMidi()}
        onOpenProject={() => void onOpenProject()}
        onSave={() => void onSave()}
        onNew={onNew}
        onLoadSample={onLoadSample}
        onStartLesson={onStartLesson}
        onRequestMidi={onRequestMidi}
        samples={samples.map((s) => ({ id: s.id, title: s.title }))}
        lessons={lessons.map((l) => ({ id: l.id, title: l.title }))}
      />

      <div className="workspace">
        <GuideRail
          open={state.guideOpen}
          onToggle={() => useStore.getState().toggleGuide()}
          mode={mode}
          step={step}
          stepIndex={state.stepIndex}
          stepTotal={state.stepTotal}
          matchState={state.matchState}
          missCount={state.missCount}
          guideText={state.guideLine?.text ?? null}
          guideTone={state.guideLine?.tone ?? 'info'}
          awaitingNext={state.awaitingNextAtEvent}
          transient={transient ? { text: transient.text, key: transient.key } : null}
          onListen={onListen}
          onTry={onTry}
          onNext={onNext}
          onRestart={onRestart}
        />

        <main className="upper">
          <div
            className="upper-rail"
            style={{ flex: state.upperView === 'chords+staff' ? '0 0 40%' : '1 1 auto' }}
          >
            {state.upperView !== 'staff' ? (
              <ChordRail
                chords={score.chords}
                events={score.events}
                pxPerBeat={pxPerBeat}
                timeSig={score.meta.timeSig}
                seekLocked={state.seekLocked}
                mode={mode}
                onSeek={seek}
                onSelectChord={(chord) => setSelectedChordId(chord.id)}
                onEventClick={onEventClick}
                keySpans={keySpans}
              />
            ) : null}
          </div>

          {state.upperView !== 'chords' ? (
            <div
              className="upper-staff"
              style={{ flex: state.upperView === 'chords+staff' ? '0 0 60%' : '1 1 auto' }}
            >
              <StaffView
                notes={score.notes}
                chords={score.chords}
                events={score.events}
                pxPerBeat={pxPerBeat}
                timeSig={score.meta.timeSig}
                showChordLabels={state.upperView === 'staff'}
              />
            </div>
          ) : null}

          <div className="upper-zoom">
            <button
              type="button"
              className="btn btn-tiny"
              onClick={() => state.setRailZoom(Math.max(24, pxPerBeat - 12))}
            >
              −
            </button>
            <span>{Math.round(pxPerBeat)} px/拍</span>
            <button
              type="button"
              className="btn btn-tiny"
              onClick={() => state.setRailZoom(Math.min(200, pxPerBeat + 12))}
            >
              +
            </button>
            <span className="upper-meta">
              {MODE_LABEL[mode]} / 拍 {beatLabel.toFixed(1)} / 全 {Math.ceil(totalBeats)} 拍
              {state.recording ? ' / 録音中' : ''}
            </span>
            {mode === 'tutorial' ? (
              <span className="upper-meta">
                {listeningLabel(state.matchState)}
                {nowChord?.symbol ? ` / いま ${nowChord.symbol} ${describeSymbol(nowChord.symbol)}` : ''}
              </span>
            ) : null}
          </div>

          {mode === 'analyze' ? (
            <AnalyzePanel
              analyze={state.analyze}
              chords={score.chords}
              events={score.events}
              timeSig={score.meta.timeSig}
              displayKey={displayKey}
              barBeats={barBeats}
              selectedChordId={selectedChordId}
              onPatch={(patch) => useStore.getState().patchAnalyze(patch)}
              onSelect={(chord) => setSelectedChordId(chord.id)}
              onPickSymbol={(id, symbol) => useStore.getState().selectChordSymbol(id, symbol)}
              onReanalyze={onReanalyze}
              onEventClick={onEventClick}
            />
          ) : null}
        </main>
      </div>

      <section className="lower">
        <Keyboard lights={lights} />
      </section>

      <footer className="statusbar">
        <span>{notice ?? 'Space で再生 / 停止。最初のクリックで音が鳴ります。'}</span>
        <span className="statusbar-right">
          {platform.label} / {state.projectName ?? score.meta.title}
          {state.dirty ? ' *' : ''} / 期待 {state.expectedPitchClasses.join(' ') || '—'}
        </span>
      </footer>
    </div>
  )
}

// ------------------------------------------------------------------ helpers

function midiStatusLabel(status: MidiStatus): string {
  switch (status) {
    case 'ready':
      return '接続済'
    case 'requesting':
      return '要求中'
    case 'denied':
      return '拒否'
    case 'unsupported':
      return '非対応'
    default:
      return '未要求'
  }
}

function keyFromMeta(meta: ScoreDocument['meta']) {
  return resolveOrMakeKey(`${meta.tonic} ${meta.scale}`)
}

/**
 * レールの背景淡色。キー区間ごとに色をずらす (v0.3 2 章)。
 *
 * 開始キーは「現在表示中のキー」ではなくスコアの meta から取る。
 * 再生ヘッドが進んでキーバッジが A minor になった後に描画し直すと、
 * 先頭区間まで A minor と書かれてしまう。
 */
function keySpansFor(
  events: ScoreEvent[],
  meta: ScoreDocument['meta'],
  totalBeats: number,
): { start: number; end: number; tone: string }[] {
  const baseKey = keyFromMeta(meta)
  const modulations = events
    .filter((e) => e.kind === 'modulation' && e.toKey)
    .sort((a, b) => a.time - b.time)
  const spans: { start: number; end: number; tone: string }[] = []
  let start = 0
  let key = baseKey
  for (const event of modulations) {
    if (event.time <= start) continue
    spans.push({ start, end: event.time, tone: key.name })
    start = event.time
    key = resolveOrMakeKey(event.toKey!)
  }
  spans.push({ start, end: totalBeats, tone: key.name })
  return spans
}

export type { ChordEvent }