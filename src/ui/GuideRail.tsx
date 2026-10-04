/**
 * v0.2 5 章 / v0.3: 手引き欄。別画面のウィザードにしない。左欄が今の画面を指す。
 * 文は拍では変えない。一致・不一致・聞いている最中の 3 状態だけ色が変わる。
 */
import type { ScoreEvent } from '@/model/types'
import type { MatchState } from '@/model/types'
import { describeExpectation } from '@/tutorial/runner'
import type { Step } from '@/model/types'
import { eventSentence } from '@/analysis/events'

interface Props {
  open: boolean
  onToggle(): void
  mode: string
  step: Step | null
  stepIndex: number
  stepTotal: number
  matchState: MatchState
  missCount: number
  guideText: string | null
  guideTone: 'info' | 'good' | 'bad'
  awaitingNext: boolean
  /** v0.3: 旗を通過したときの 1.5 秒の文。 */
  transient: { text: string; key: string } | null
  onListen(): void
  onTry(): void
  onNext(): void
  onRestart(): void
}

export function GuideRail({
  open,
  onToggle,
  mode,
  step,
  stepIndex,
  stepTotal,
  matchState,
  missCount,
  guideText,
  guideTone,
  awaitingNext,
  transient,
  onListen,
  onTry,
  onNext,
  onRestart,
}: Props) {
  if (!open) {
    return (
      <aside className="guide guide-closed">
        <button type="button" className="guide-open-tab" onClick={onToggle}>
          手引き
        </button>
      </aside>
    )
  }

  const isTutorial = mode === 'tutorial'
  const label = stateLabel(matchState)

  return (
    <aside className="guide">
      <header className="guide-head">
        <button type="button" className="guide-close" onClick={onToggle} title="手引きを閉じる">
          ⟨
        </button>
        <span className="guide-title">
          {isTutorial ? '手引き' : '情報'}
        </span>
        <span className={`guide-state state-${matchState}`}>{label}</span>
      </header>

      {transient ? (
        <div className="guide-transient" key={transient.key}>
          {transient.text}
        </div>
      ) : null}

      {isTutorial && step ? (
        <>
          <div className="guide-step">
            Step {Math.min(stepIndex + 1, stepTotal)} / {stepTotal}
          </div>
          <p className="guide-prompt">{step.prompt}</p>
          <p className="guide-detail">期待: {describeExpectation(step)}</p>
          {missCount > 0 ? (
            <p className="guide-miss">外した回数 {missCount} 回</p>
          ) : null}

          <div className="guide-actions">
            <button
              type="button"
              className={`btn btn-listen${matchState === 'listening' ? ' is-on' : ''}`}
              onClick={onListen}
            >
              聞く
            </button>
            <button
              type="button"
              className={`btn btn-try${matchState === 'trying' ? ' is-on' : ''}`}
              onClick={onTry}
            >
              弾く
            </button>
            <button type="button" className="btn btn-next" onClick={onNext}>
              {awaitingNext ? '続けて再生' : '次へ'}
            </button>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onRestart}>
            最初から
          </button>
        </>
      ) : (
        <>
          <div className="guide-step">手引きは空</div>
          <p className="guide-prompt">
            {mode === 'record'
              ? '録音中。弾いた音が下のレーンに残り、再生できます。'
              : mode === 'analyze'
                ? 'MIDI を読み込むと、コード候補がこの枠に並びます。手で選べます。'
                : '自由再生。コードは上のレール、下の鍵盤は今の音を追います。'}
          </p>
          {guideText ? (
            <p className={`guide-detail tone-${guideTone}`}>{guideText}</p>
          ) : null}
        </>
      )}

      <GuideColors />
    </aside>
  )
}

function stateLabel(state: MatchState): string {
  switch (state) {
    case 'listening':
      return '聞いている'
    case 'trying':
      return '弾いている'
    case 'matched':
      return '一致'
    case 'missed':
      return '不一致'
    default:
      return '準備'
  }
}

function GuideColors() {
  return (
    <div className="guide-legend">
      <span><i className="swatch swatch-active" />今鳴っている</span>
      <span><i className="swatch swatch-expected" />次に弾くべき音</span>
      <span><i className="swatch swatch-wrong" />期待と違う (200ms)</span>
      <span><i className="swatch swatch-past" />通過済み</span>
    </div>
  )
}

export { eventSentence }
export type { ScoreEvent }