import { describe, expect, it } from 'vitest'
import {
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
} from './brewTimer'

describe('timer from timestamps', () => {
  it('is idle with the full time before starting', () => {
    const t = newTimer(30)
    expect(timerStatus(t, 1_000)).toBe('idle')
    expect(remainingSecondsAt(t, 99_999)).toBe(30)
  })

  it('derives remaining time from the start timestamp, not from ticks', () => {
    const t = startTimer(newTimer(30), 1_000)
    expect(remainingSecondsAt(t, 1_000)).toBe(30)
    expect(remainingSecondsAt(t, 1_001)).toBe(30)
    expect(remainingSecondsAt(t, 11_000)).toBe(20)
    // A throttled tab that wakes up late still gets the right answer.
    expect(remainingSecondsAt(t, 26_500)).toBe(5)
    expect(timerStatus(t, 26_500)).toBe('running')
    expect(remainingSecondsAt(t, 31_000)).toBe(0)
    expect(timerStatus(t, 31_000)).toBe('done')
    expect(remainingSecondsAt(t, 900_000)).toBe(0)
  })

  it('pauses, resumes and resets', () => {
    let t = startTimer(newTimer(30), 0)
    t = pauseTimer(t, 10_000)
    expect(timerStatus(t, 500_000)).toBe('paused')
    expect(remainingSecondsAt(t, 500_000)).toBe(20)
    t = startTimer(t, 500_000)
    expect(remainingSecondsAt(t, 505_000)).toBe(15)
    t = resetTimer(t)
    expect(timerStatus(t, 505_000)).toBe('idle')
    expect(remainingSecondsAt(t, 505_000)).toBe(30)
  })

  it('does not restart a finished timer and settles a finished run', () => {
    const running = startTimer(newTimer(5), 0)
    // startedAt 0 is a real timestamp, not "not running".
    expect(timerStatus(running, 1_000)).toBe('running')
    expect(startTimer(running, 10_000)).toBe(running)
    const settled = settleTimer(running, 10_000)
    expect(settled.startedAt).toBeNull()
    expect(timerStatus(settled, 10_000_000)).toBe('done')
    expect(settleTimer(running, 2_000)).toBe(running)
  })

  it('ignores a clock that moves backwards', () => {
    const t = startTimer(newTimer(30), 10_000)
    expect(remainingSecondsAt(t, 5_000)).toBe(30)
  })

  it('clamps the duration', () => {
    expect(newTimer(0).durationSec).toBe(1)
    expect(newTimer(99_999).durationSec).toBe(3_600)
    expect(newTimer(Number.NaN).durationSec).toBe(20)
  })
})

describe('suggestNextSeconds', () => {
  it('starts at 20 seconds', () => {
    expect(suggestNextSeconds([])).toBe(20)
  })
  it('adds the increment to the previous step', () => {
    expect(suggestNextSeconds([20])).toBe(25)
    expect(suggestNextSeconds([20, 25], 10)).toBe(35)
    expect(suggestNextSeconds([20], 0)).toBe(20)
  })
  it('stays in range and ignores a negative increment', () => {
    expect(suggestNextSeconds([3_598], 10)).toBe(3_600)
    expect(suggestNextSeconds([30], -50)).toBe(30)
  })
})

describe('formatting and parsing', () => {
  it('formats a clock', () => {
    expect(formatClock(75)).toBe('1:15')
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-3)).toBe('0:00')
    expect(formatClock(3600)).toBe('60:00')
  })
  it('describes seconds for announcements', () => {
    expect(describeSeconds(75)).toBe('1 minute 15 seconds')
    expect(describeSeconds(60)).toBe('1 minute')
    expect(describeSeconds(1)).toBe('1 second')
    expect(describeSeconds(0)).toBe('0 seconds')
  })
  it('parses step seconds', () => {
    expect(parseStepSeconds('20')).toBe(20)
    expect(parseStepSeconds(' 1:30 ')).toBe(90)
    expect(parseStepSeconds('0')).toBeNull()
    expect(parseStepSeconds('3601')).toBeNull()
    expect(parseStepSeconds('1:75')).toBeNull()
    expect(parseStepSeconds('abc')).toBeNull()
    expect(parseStepSeconds('1.5')).toBeNull()
    expect(parseStepSeconds('')).toBeNull()
  })
})
