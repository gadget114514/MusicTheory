/**
 * v0.2 6 章: playhead はストアに書かない。ただし「どのセルか」「どの音か」だけは
 * index が変わったときだけ state に落とす。30fps の再描画はしない。
 */
import { useEffect, useRef, useState } from 'react'
import type { ChordEvent, NoteEvent } from '@/model/types'
import { transport } from '@/engine/transport'
import { useStore } from '@/store/score'

/**
 * 再生中の Part + 押鍵。音符イベントが変わったときだけ更新する。
 *
 * v0.2 2 章: 停止中は Part が鳴っていないので、点灯しない。
 * 開始拍にノートがあるだけで琥珀が点いてしまうのを避ける。
 */
export function useActiveMidis(notes: NoteEvent[]): number[] {
  const [active, setActive] = useState<number[]>([])
  const noteRef = useRef(notes)
  noteRef.current = notes

  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = () => {
      const next: number[] = []
      // 再生中のみ Part を点灯させる。停止中は押鍵だけ。
      if (transport.transportState === 'started') {
        const beat = transport.beat
        for (const note of noteRef.current) {
          if (beat >= note.time && beat < note.time + note.duration) next.push(note.midi)
        }
      }
      for (const midi of useStore.getState().pressedMidis) next.push(midi)
      const unique = [...new Set(next)].sort((a, b) => a - b)
      const signature = unique.join(',')
      if (signature !== last) {
        last = signature
        setActive(unique)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return active
}

/** いま再生ヘッドが乗っているセル。セルが変わったときだけ更新。 */
export function useNowChord(chords: ChordEvent[]): ChordEvent | null {
  const [current, setCurrent] = useState<ChordEvent | null>(null)
  const chordRef = useRef(chords)
  chordRef.current = chords

  useEffect(() => {
    let raf = 0
    let lastId = ''
    const loop = () => {
      const beat = transport.beat
      let found: ChordEvent | null = null
      for (const chord of chordRef.current) {
        if (beat >= chord.time && beat < chord.time + chord.duration) {
          found = chord
          break
        }
      }
      const id = found?.id ?? ''
      if (id !== lastId) {
        lastId = id
        setCurrent(found)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return current
}

/** 上バーの「拍」表示用に、0.1 拍単位でだけ更新する。 */
export function useBeatLabel(): number {
  const [beat, setBeat] = useState(0)
  useEffect(() => {
    let raf = 0
    let last = -1
    const loop = () => {
      const value = Math.round(transport.beat * 10) / 10
      if (value !== last) {
        last = value
        setBeat(value)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return beat
}