// Pure logic for the gongfu session timer (PBI 47). The timer never counts
// ticks: it stores a start timestamp plus the time already elapsed, so the
// remaining time is always derived from Date.now() deltas and stays correct
// when a background tab throttles its timers.

export const MIN_STEP_SECONDS = 1
export const MAX_STEP_SECONDS = 3_600
export const FIRST_STEP_SECONDS = 20
export const DEFAULT_INCREMENT_SECONDS = 5

export type TimerState = {
  durationSec: number
  /** Timestamp (ms) of the last start or resume, or null when not running. */
  startedAt: number | null
  /** Milliseconds elapsed before the current run (pauses add to it). */
  elapsedMs: number
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

export function clampSeconds(n: number): number {
  if (!Number.isFinite(n)) return FIRST_STEP_SECONDS
  return Math.min(MAX_STEP_SECONDS, Math.max(MIN_STEP_SECONDS, Math.round(n)))
}

export function newTimer(durationSec: number): TimerState {
  return { durationSec: clampSeconds(durationSec), startedAt: null, elapsedMs: 0 }
}

export function elapsedMsAt(t: TimerState, now: number): number {
  const running = t.startedAt === null ? 0 : Math.max(0, now - t.startedAt)
  return t.elapsedMs + running
}

/** Whole seconds left, rounded up so "0:00" only shows once time is really up. */
export function remainingSecondsAt(t: TimerState, now: number): number {
  const left = t.durationSec * 1000 - elapsedMsAt(t, now)
  return Math.max(0, Math.ceil(left / 1000))
}

export function timerStatus(t: TimerState, now: number): TimerStatus {
  if (elapsedMsAt(t, now) >= t.durationSec * 1000) return 'done'
  if (t.startedAt !== null) return 'running'
  return t.elapsedMs > 0 ? 'paused' : 'idle'
}

export function startTimer(t: TimerState, now: number): TimerState {
  const status = timerStatus(t, now)
  return status === 'idle' || status === 'paused' ? { ...t, startedAt: now } : t
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  if (t.startedAt === null) return t
  return { ...t, startedAt: null, elapsedMs: Math.min(t.durationSec * 1000, elapsedMsAt(t, now)) }
}

export function resetTimer(t: TimerState): TimerState {
  return { ...t, startedAt: null, elapsedMs: 0 }
}

/** A running timer whose time is up becomes a stopped, finished timer. */
export function settleTimer(t: TimerState, now: number): TimerState {
  if (t.startedAt === null || timerStatus(t, now) !== 'done') return t
  return { ...t, startedAt: null, elapsedMs: t.durationSec * 1000 }
}

/** Seconds for the next step: the previous step plus an increment (first step: 20 s). */
export function suggestNextSeconds(
  previous: readonly number[],
  increment = DEFAULT_INCREMENT_SECONDS,
): number {
  if (previous.length === 0) return FIRST_STEP_SECONDS
  const last = previous[previous.length - 1]
  if (!Number.isFinite(last)) return FIRST_STEP_SECONDS
  const step = Number.isFinite(increment) ? Math.round(increment) : DEFAULT_INCREMENT_SECONDS
  return clampSeconds(last + Math.max(0, step))
}

/** 75 -> "1:15", 5 -> "0:05", 3600 -> "60:00". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Spoken form for announcements: 75 -> "1 minute 15 seconds". */
export function describeSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  const parts: string[] = []
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`)
  if (r > 0 || m === 0) parts.push(`${r} second${r === 1 ? '' : 's'}`)
  return parts.join(' ')
}

/** "20", "1:30" or "90" -> seconds within the allowed range, else null. */
export function parseStepSeconds(text: string): number | null {
  const s = typeof text === 'string' ? text.trim() : ''
  let seconds: number
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(s)
  if (clock) seconds = Number(clock[1]) * 60 + Number(clock[2])
  else if (/^\d{1,4}$/.test(s)) seconds = Number(s)
  else return null
  return seconds >= MIN_STEP_SECONDS && seconds <= MAX_STEP_SECONDS ? seconds : null
}
