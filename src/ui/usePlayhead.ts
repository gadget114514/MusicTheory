/**
 * v0.2 6 章: playheadBeat は Tone.Transport だけが作る。
 * React から playhead をストアに書かない。ここは ref を返すだけで、
 * レールと鍵盤は ref を見て直接動かす。
 */
import { useEffect, useRef } from 'react'
import { transport } from '@/engine/transport'

export type FrameCallback = (beat: number) => void

export function usePlayheadRef(): { current: number } {
  const ref = useRef(0)
  useEffect(() => {
    ref.current = transport.beat
    let raf = 0
    const loop = () => {
      ref.current = transport.beat
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return ref
}

/** rAF で再生位置を受け取る。DOM は ref 経由で直接動かす。 */
export function useAnimationFrame(callback: FrameCallback, active = true): void {
  const ref = useRef(callback)
  ref.current = callback
  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = () => {
      ref.current(transport.beat)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active])
}