import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('writes headers, rows and blank cells', () => {
    expect(toCsv(['a', 'b', 'c'], [[1, null, true]])).toBe('a,b,c\r\n1,,true\r\n')
  })

  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['x'], [['a,b'], ['say "hi"'], ['two\nlines']])).toBe(
      'x\r\n"a,b"\r\n"say ""hi"""\r\n"two\nlines"\r\n',
    )
  })

  it.each(['=HYPERLINK("x")', '+1', '-1', '@cmd'])('neutralises the formula %s', (text) => {
    const cell = toCsv(['x'], [[text]]).split('\r\n')[1]
    expect(cell.replace(/^"/, '').startsWith("'")).toBe(true)
  })

  it('leaves real numbers alone', () => {
    expect(toCsv(['x'], [[-1]])).toBe('x\r\n-1\r\n')
  })
})
