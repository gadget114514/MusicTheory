import type { ScoreDocument, TutorialScript } from '@/model/types'

/**
 * v0.1 設計 9.3 / 4.3: 内蔵サンプルとレッスンはバンドルに同梱する。
 * 読み込みはビルド時。哪一个 MIDI ファイルも同梱していない。
 */
/**
 * このファイルは src/samples/ にあるので、glob はリポジトリルート基準
 * ('../samples/*.json') で書かないといけない。
 */
const sampleModules = import.meta.glob<ScoreDocument>('../samples/*.json', {
  eager: true,
  import: 'default',
})

const lessonModules = import.meta.glob<TutorialScript>('../tutorial/lessons/*.json', {
  eager: true,
  import: 'default',
})

export interface SampleEntry {
  id: string
  title: string
  score: ScoreDocument
  origin: string
}

export interface LessonEntry {
  id: string
  title: string
  script: TutorialScript
  origin: string
}

function fileNameOf(origin: string): string {
  return origin.split('/').pop() ?? origin
}

export const samples: SampleEntry[] = Object.entries(sampleModules)
  .map(([origin, score]) => ({
    id: fileNameOf(origin).replace(/\.json$/, ''),
    title: score?.meta?.title ?? fileNameOf(origin),
    score: normalizeScore(score, fileNameOf(origin)),
    origin,
  }))
  .sort((a, b) => a.id.localeCompare(b.id))

export const lessons: LessonEntry[] = Object.entries(lessonModules)
  .map(([origin, script]) => ({
    id: script?.id ?? fileNameOf(origin).replace(/\.json$/, ''),
    title: script?.title ?? script?.id ?? origin,
    script,
    origin,
  }))
  .sort((a, b) => a.id.localeCompare(b.id))

function normalizeScore(score: ScoreDocument, fallbackTitle: string): ScoreDocument {
  return {
    version: 1,
    meta: score.meta ?? {
      title: fallbackTitle,
      tonic: 'C',
      scale: 'major',
      bpm: 100,
      timeSig: [4, 4],
    },
    notes: Array.isArray(score.notes) ? score.notes : [],
    chords: Array.isArray(score.chords) ? score.chords : [],
    events: Array.isArray(score.events) ? score.events : [],
  }
}

/** 外部 JSON には version が無いことがある。読み込み時に必ずここを通す。 */
export function migrateScore(input: unknown): ScoreDocument | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<ScoreDocument>
  if (!raw.meta || typeof raw.meta !== 'object') return null
  const meta = raw.meta
  if (typeof meta.bpm !== 'number' || typeof meta.tonic !== 'string') return null
  return normalizeScore(
    {
      version: 1,
      meta: {
        title: typeof meta.title === 'string' ? meta.title : '無題',
        tonic: meta.tonic,
        scale: typeof meta.scale === 'string' ? meta.scale : 'major',
        bpm: meta.bpm,
        timeSig:
          Array.isArray(meta.timeSig) && meta.timeSig.length === 2
            ? [Number(meta.timeSig[0]) || 4, Number(meta.timeSig[1]) || 4]
            : [4, 4],
      },
      notes: Array.isArray(raw.notes) ? raw.notes : [],
      chords: Array.isArray(raw.chords) ? raw.chords : [],
      events: Array.isArray(raw.events) ? raw.events : [],
    },
    '無題',
  )
}

export function sampleById(id: string): SampleEntry | undefined {
  return samples.find((s) => s.id === id)
}

export function lessonById(id: string): LessonEntry | undefined {
  return lessons.find((l) => l.id === id)
}