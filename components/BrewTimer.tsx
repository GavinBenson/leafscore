'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  DEFAULT_INCREMENT_SECONDS,
  describeSeconds,
  formatClock,
  newTimer,
  parseStepSeconds,
  pauseTimer,
  remainingSecondsAt,
  resetTimer,
  settleTimer,
  startTimer,
  suggestNextSeconds,
  timerStatus,
  type TimerState,
  type TimerStatus,
} from '@/lib/brewTimer'
import { MAX_INFUSIONS_PER_SESSION, MAX_INFUSION_NOTE_LENGTH } from '@/lib/validation/brewSession'

type Step = {
  id: number
  secondsText: string
  timer: TimerState
  note: string
  rating: string
}

const STATUS_LABEL: Record<TimerStatus, string> = {
  idle: 'Ready',
  running: 'Steeping',
  paused: 'Paused',
  done: 'Done',
}

function makeStep(id: number, seconds: number): Step {
  return { id, secondsText: String(seconds), timer: newTimer(seconds), note: '', rating: '' }
}

// What the server action receives (the action validates it again).
function serialize(steps: Step[]) {
  return steps.map((s) => ({
    seconds: parseStepSeconds(s.secondsText) ?? 0,
    rating: s.rating.trim() === '' ? null : /^\d{1,3}$/.test(s.rating.trim()) ? Number(s.rating.trim()) : -1,
    note: s.note.trim() === '' ? null : s.note,
  }))
}

// Infusion list with a steep timer per step. Time is always derived from
// timestamps (Date.now deltas): the interval below only asks React to redraw,
// so a throttled background tab cannot make the clock drift. No Notification or
// Vibration API: completion is a visible state change plus a polite live region.
export function BrewTimer() {
  const uid = useId()
  const nextId = useRef(2)
  const addRef = useRef<HTMLButtonElement>(null)
  const stepsRef = useRef<Step[]>([])
  const [steps, setSteps] = useState<Step[]>(() => [makeStep(1, 20)])
  const [now, setNow] = useState(() => Date.now())
  const [increment, setIncrement] = useState(String(DEFAULT_INCREMENT_SECONDS))
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    stepsRef.current = steps
  })

  const anyRunning = steps.some((s) => s.timer.startedAt !== null)
  useEffect(() => {
    if (!anyRunning) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      const finished: number[] = []
      stepsRef.current.forEach((s, index) => {
        if (s.timer.startedAt !== null && timerStatus(s.timer, t) === 'done') finished.push(index)
      })
      if (finished.length === 0) return
      setSteps((prev) => prev.map((s) => ({ ...s, timer: settleTimer(s.timer, t) })))
      const last = finished[finished.length - 1]
      setAnnouncement(
        `Step ${last + 1} finished after ${describeSeconds(stepsRef.current[last].timer.durationSec)}. Time to pour.`,
      )
    }
    const id = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [anyRunning])

  function update(id: number, change: (s: Step) => Step) {
    setSteps((prev) => prev.map((s) => (s.id === id ? change(s) : s)))
  }

  function addStep() {
    const parsedIncrement = /^\d{1,3}$/.test(increment.trim()) ? Number(increment.trim()) : DEFAULT_INCREMENT_SECONDS
    const seconds = suggestNextSeconds(
      steps.map((s) => parseStepSeconds(s.secondsText) ?? s.timer.durationSec),
      parsedIncrement,
    )
    const id = nextId.current++
    setSteps((prev) => (prev.length >= MAX_INFUSIONS_PER_SESSION ? prev : [...prev, makeStep(id, seconds)]))
  }

  function removeStep(id: number) {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)))
    addRef.current?.focus()
  }

  return (
    <section aria-labelledby={`${uid}-heading`} style={{ marginBottom: 16 }}>
      <h2 id={`${uid}-heading`} className="section-title" style={{ fontSize: 18 }}>
        Infusions
      </h2>
      <input type="hidden" name="infusions" value={JSON.stringify(serialize(steps))} />
      <p className="form-hint" id={`${uid}-help`}>
        Start a timer for each steep. Each new step suggests the previous time plus the increment below. Times
        keep running if you switch tabs.
      </p>
      <div role="status" aria-live="polite" style={{ minHeight: 24, fontWeight: 600, marginBottom: 8 }}>
        {announcement}
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
        {steps.map((step, index) => {
          const status = timerStatus(step.timer, now)
          const remaining = remainingSecondsAt(step.timer, now)
          const fid = (name: string) => `${uid}-${step.id}-${name}`
          return (
            <li
              key={step.id}
              className="card"
              style={{
                borderColor: status === 'done' ? 'var(--color-primary)' : undefined,
                borderWidth: status === 'running' || status === 'done' ? 2 : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Step {index + 1}</h3>
                <span className={status === 'done' ? 'tag tag-accent' : 'tag'}>{STATUS_LABEL[status]}</span>
              </div>

              <div
                role="timer"
                aria-label={`Step ${index + 1} time remaining`}
                style={{ fontSize: 40, fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '8px 0' }}
              >
                {formatClock(remaining)}
              </div>

              <div className="form-group">
                <label htmlFor={fid('seconds')} className="form-label">
                  Steep time in seconds (1 to 3600)
                </label>
                <input
                  id={fid('seconds')}
                  type="text"
                  inputMode="numeric"
                  className="field"
                  value={step.secondsText}
                  disabled={status !== 'idle'}
                  aria-invalid={parseStepSeconds(step.secondsText) === null}
                  onChange={(e) => {
                    const secondsText = e.target.value
                    update(step.id, (s) => {
                      const parsed = parseStepSeconds(secondsText)
                      return { ...s, secondsText, timer: parsed === null ? s.timer : newTimer(parsed) }
                    })
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {status === 'running' ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ minHeight: 44 }}
                    onClick={() => {
                      const t = Date.now()
                      setNow(t)
                      update(step.id, (s) => ({ ...s, timer: pauseTimer(s.timer, t) }))
                    }}
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ minHeight: 44 }}
                    disabled={status === 'done' || parseStepSeconds(step.secondsText) === null}
                    onClick={() => {
                      const t = Date.now()
                      setNow(t)
                      setAnnouncement(`Step ${index + 1} started.`)
                      update(step.id, (s) => ({ ...s, timer: startTimer(s.timer, t) }))
                    }}
                  >
                    {status === 'paused' ? 'Resume' : 'Start'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ minHeight: 44 }}
                  disabled={status === 'idle'}
                  onClick={() => {
                    setNow(Date.now())
                    update(step.id, (s) => ({ ...s, timer: resetTimer(s.timer) }))
                  }}
                >
                  Reset
                </button>
                {steps.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: 44 }}
                    onClick={() => removeStep(step.id)}
                  >
                    Remove<span className="visually-hidden"> step {index + 1}</span>
                  </button>
                )}
              </div>

              <div className="form-group">
                <label htmlFor={fid('note')} className="form-label">
                  Note (optional, {MAX_INFUSION_NOTE_LENGTH} characters at most)
                </label>
                <textarea
                  id={fid('note')}
                  className="field field-textarea"
                  rows={2}
                  maxLength={MAX_INFUSION_NOTE_LENGTH}
                  value={step.note}
                  onChange={(e) => update(step.id, (s) => ({ ...s, note: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor={fid('rating')} className="form-label">
                  Rating (optional, 0 to 100)
                </label>
                <input
                  id={fid('rating')}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  className="field"
                  value={step.rating}
                  onChange={(e) => update(step.id, (s) => ({ ...s, rating: e.target.value }))}
                />
              </div>
            </li>
          )
        })}
      </ol>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
        <div>
          <label htmlFor={`${uid}-increment`} className="form-label">
            Add seconds to each new step
          </label>
          <input
            id={`${uid}-increment`}
            type="text"
            inputMode="numeric"
            className="field"
            style={{ width: 100 }}
            value={increment}
            onChange={(e) => setIncrement(e.target.value)}
          />
        </div>
        <button
          ref={addRef}
          type="button"
          className="btn btn-outline"
          style={{ minHeight: 44 }}
          disabled={steps.length >= MAX_INFUSIONS_PER_SESSION}
          onClick={addStep}
        >
          Add step
        </button>
      </div>
    </section>
  )
}
